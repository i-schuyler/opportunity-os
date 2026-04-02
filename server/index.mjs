import { createServer } from 'node:http';
import * as fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createNodeBillingRequestListener } from '../lib/server-billing-adapter.js';

const currentFilePath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFilePath), '..');
const appDir = path.join(rootDir, 'app');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function resolveStaticPath(requestPath = '/') {
  const pathname = String(requestPath || '/').trim();
  if (pathname === '/') {
    return path.join(appDir, 'index.html');
  }

  if (pathname.startsWith('/app/')) {
    return path.join(rootDir, pathname);
  }

  if (pathname.startsWith('/lib/')) {
    return path.join(rootDir, pathname);
  }

  return '';
}

function resolveMimeType(filePath = '') {
  const extension = path.extname(filePath);
  return MIME_TYPES[extension] || 'application/octet-stream';
}

function isInsideRoot(candidatePath = '') {
  const normalizedRoot = `${rootDir}${path.sep}`;
  const normalizedCandidate = path.resolve(candidatePath);
  return normalizedCandidate === rootDir || normalizedCandidate.startsWith(normalizedRoot);
}

async function serveStaticFile(requestPath, response) {
  const filePath = resolveStaticPath(requestPath);
  if (!filePath || !isInsideRoot(filePath)) {
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

const handleBillingApiRequest = createNodeBillingRequestListener({ runtimeEnv });

const port = Number.parseInt(String(process.env.PORT || '8787'), 10) || 8787;

const server = createServer(async (request, response) => {
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
