import { createServer } from 'node:http';
import * as fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  createNodeBillingRequestListener,
  createSessionUserResolver,
  createSignedSessionCookieValue,
} from '../lib/server-billing-adapter.js';

const currentFilePath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFilePath), '..');
const appDir = path.join(rootDir, 'app');
const PUBLIC_CLIENT_LIB_FILES = new Map([
  ['/lib/auth-scaffold.js', path.join(rootDir, 'lib', 'auth-scaffold.js')],
  ['/lib/opportunity-model.js', path.join(rootDir, 'lib', 'opportunity-model.js')],
]);
const PUBLIC_CLIENT_LIB_FILE_SET = new Set(PUBLIC_CLIENT_LIB_FILES.values());

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const AUTH_SESSION_PATH = '/api/auth/session';
const SESSION_COOKIE_NAME = 'opportunity_os_session';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value = '') {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

function createStableUserId(email = '') {
  const digest = crypto.createHash('sha256').update(String(email || ''), 'utf8').digest('hex');
  return `user-${digest.slice(0, 24)}`;
}

function parseJson(value = '') {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return null;
  }
}

function readRawRequestBody(request) {
  if (typeof request.rawBody === 'string') {
    return Promise.resolve(String(request.rawBody || ''));
  }

  if (Buffer.isBuffer(request && request.rawBody)) {
    return Promise.resolve(request.rawBody.toString('utf8'));
  }

  if (!request || typeof request.on !== 'function') {
    return Promise.resolve('');
  }

  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''), 'utf8'));
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    request.on('error', (error) => {
      reject(error);
    });
  });
}

function safeTimingEqual(leftValue, rightValue) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveCookieSecurityMode() {
  const env = process.env || {};
  const explicitSecure = String(env.OPPORTUNITY_OS_SESSION_COOKIE_SECURE || '').trim();
  if (explicitSecure === '1' || explicitSecure.toLowerCase() === 'true') {
    return true;
  }

  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  return nodeEnv === 'production';
}

function buildSessionCookieAttributes(maxAgeSeconds) {
  const secure = resolveCookieSecurityMode();
  const maxAge = Number.isFinite(maxAgeSeconds) ? Math.max(0, Number(maxAgeSeconds)) : SESSION_COOKIE_MAX_AGE_SECONDS;
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function writeJsonResponse(response, statusCode, payload) {
  response.statusCode = Number(statusCode || 500);
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload || {}));
}

function resolveStaticPath(requestPath = '/') {
  const pathname = String(requestPath || '/').trim();

  const publicClientLibPath = PUBLIC_CLIENT_LIB_FILES.get(pathname);
  if (publicClientLibPath) {
    return publicClientLibPath;
  }

  if (pathname === '/') {
    return path.join(appDir, 'index.html');
  }

  if (pathname === '/app' || pathname === '/app/') {
    return path.join(appDir, 'index.html');
  }

  if (pathname.startsWith('/app/')) {
    const candidatePath = path.resolve(appDir, `.${pathname.slice('/app'.length)}`);
    return isInsideDirectory(candidatePath, appDir) ? candidatePath : '';
  }

  if (pathname.startsWith('/')) {
    const candidatePath = path.resolve(appDir, `.${pathname}`);
    return isInsideDirectory(candidatePath, appDir) ? candidatePath : '';
  }

  return '';
}

function resolveMimeType(filePath = '') {
  const extension = path.extname(filePath);
  return MIME_TYPES[extension] || 'application/octet-stream';
}

function isInsideDirectory(candidatePath = '', directoryPath = '') {
  const normalizedRoot = `${path.resolve(directoryPath)}${path.sep}`;
  const normalizedCandidate = path.resolve(candidatePath);
  return normalizedCandidate === path.resolve(directoryPath) || normalizedCandidate.startsWith(normalizedRoot);
}

async function serveStaticFile(requestPath, response) {
  const filePath = resolveStaticPath(requestPath);
  const isPublicClientLib = PUBLIC_CLIENT_LIB_FILE_SET.has(filePath);
  const isAllowedAppFile = isInsideDirectory(filePath, appDir);
  const isAllowedPath = isPublicClientLib || isAllowedAppFile;

  if (!filePath || !isAllowedPath) {
    return false;
  }

  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return false;
    }

    const payload = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('content-type', resolveMimeType(filePath));
    response.end(payload);
    return true;
  } catch {
    return false;
  }
}

function parseRequestPath(requestUrl = '/') {
  try {
    return new URL(String(requestUrl || '/'), 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

const runtimeEnv = {
  process,
  fetch: globalThis.fetch ? globalThis.fetch.bind(globalThis) : null,
  __opportunityCrypto: crypto,
  __opportunityBillingFs: fs,
};

const resolveSessionUserId = createSessionUserResolver({ runtimeEnv });
const handleBillingApiRequest = createNodeBillingRequestListener({ runtimeEnv });

async function handleAuthApiRequest(request, response) {
  const requestPath = parseRequestPath((request && request.url) || '/');
  if (requestPath !== AUTH_SESSION_PATH) {
    return false;
  }

  const method = String((request && request.method) || 'GET').toUpperCase();
  const env = process.env || {};
  const sessionSecret = String(env.BILLING_SESSION_SECRET || '').trim();
  const authAccessCode = String(env.OPPORTUNITY_OS_AUTH_ACCESS_CODE || '').trim();

  if (method === 'GET') {
    const userId = resolveSessionUserId({ headers: (request && request.headers) || {} });
    if (!userId) {
      writeJsonResponse(response, 401, { error: 'Authentication is required.' });
      return true;
    }

    writeJsonResponse(response, 200, {
      authenticated: true,
      userId,
    });
    return true;
  }

  if (method === 'POST') {
    if (!sessionSecret || !authAccessCode) {
      writeJsonResponse(response, 503, {
        error: 'Real auth session issuance is not configured.',
      });
      return true;
    }

    const rawBody = await readRawRequestBody(request || {});
    const parsedBody = parseJson(rawBody);
    if (!parsedBody || typeof parsedBody !== 'object') {
      writeJsonResponse(response, 400, {
        error: 'Request body must be valid JSON.',
      });
      return true;
    }

    const email = normalizeEmail(parsedBody.email);
    const accessCode = String(parsedBody.accessCode || '').trim();

    if (!isValidEmail(email)) {
      writeJsonResponse(response, 400, {
        error: 'A valid email is required.',
      });
      return true;
    }

    if (!safeTimingEqual(accessCode, authAccessCode)) {
      writeJsonResponse(response, 401, {
        error: 'Invalid sign-in credentials.',
      });
      return true;
    }

    const userId = createStableUserId(email);
    const sessionCookie = createSignedSessionCookieValue({
      userId,
      sessionSecret,
      cookieName: SESSION_COOKIE_NAME,
      cryptoImpl: crypto,
    });

    if (!sessionCookie) {
      writeJsonResponse(response, 503, {
        error: 'Unable to issue secure session.',
      });
      return true;
    }

    response.setHeader('set-cookie', `${sessionCookie}; ${buildSessionCookieAttributes(SESSION_COOKIE_MAX_AGE_SECONDS)}`);
    writeJsonResponse(response, 200, {
      authenticated: true,
      userId,
      email,
    });
    return true;
  }

  if (method === 'DELETE') {
    response.setHeader('set-cookie', `${SESSION_COOKIE_NAME}=; ${buildSessionCookieAttributes(0)}`);
    writeJsonResponse(response, 200, {
      authenticated: false,
    });
    return true;
  }

  response.setHeader('allow', 'GET, POST, DELETE');
  writeJsonResponse(response, 405, {
    error: 'Method not allowed.',
  });
  return true;
}

const port = Number.parseInt(String(process.env.PORT || '8787'), 10) || 8787;

const server = createServer(async (request, response) => {
  const handledAuth = await handleAuthApiRequest(request, response);
  if (handledAuth) {
    return;
  }

  const handledBilling = await handleBillingApiRequest(request, response);
  if (handledBilling) {
    return;
  }

  const requestPath = parseRequestPath(request.url || '/');
  const handledStatic = await serveStaticFile(requestPath, response);
  if (handledStatic) {
    return;
  }

  response.statusCode = 404;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error: 'Not found.' }));
});

server.listen(port, () => {
  process.stdout.write(`Opportunity OS server listening on http://localhost:${port}\n`);
});
