import {
  BILLING_API_PATHS,
  createBillingApiRequestHandler,
  createEnvPersistentBillingStore,
  createEnvStripeCheckoutAdapter,
} from './billing-api-routes.js';
import { createInMemoryBillingStore } from './billing-runtime.js';

const DEFAULT_SESSION_COOKIE_NAME = 'opportunity_os_session';
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;
const BILLING_PATH_SET = new Set(Object.values(BILLING_API_PATHS));

function parseCookieHeader(rawCookieHeader = '') {
  return String(rawCookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex < 1) {
        return accumulator;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!key) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    }, {});
}

function encodeBase64Url(value = '') {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value = '') {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padded = remainder ? `${normalized}${'='.repeat(4 - remainder)}` : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseWebhookSignatureHeader(signatureHeader = '') {
  const entries = String(signatureHeader || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const parsed = {
    timestamp: '',
    signatures: [],
  };

  entries.forEach((entry) => {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex < 1) {
      return;
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!value) {
      return;
    }

    if (key === 't') {
      parsed.timestamp = value;
    }

    if (key === 'v1') {
      parsed.signatures.push(value);
    }
  });

  return parsed;
}

function safeTimingEqual(leftValue, rightValue, cryptoImpl) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  if (!cryptoImpl || typeof cryptoImpl.timingSafeEqual !== 'function') {
    return left === right;
  }

  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return cryptoImpl.timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveBaseUrl(explicitBaseUrl, runtimeEnv) {
  const explicit = String(explicitBaseUrl || '').trim();
  if (explicit) {
    return explicit;
  }

  const env = (runtimeEnv && runtimeEnv.process && runtimeEnv.process.env) || {};
  return String(env.APP_BASE_URL || env.BILLING_BASE_URL || '').trim();
}

export function createSignedSessionCookieValue({
  userId,
  sessionSecret,
  cookieName = DEFAULT_SESSION_COOKIE_NAME,
  cryptoImpl,
} = {}) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedSecret = String(sessionSecret || '').trim();
  if (!normalizedUserId || !normalizedSecret || !cryptoImpl || typeof cryptoImpl.createHmac !== 'function') {
    return '';
  }

  const payloadEncoded = encodeBase64Url(JSON.stringify({ userId: normalizedUserId }));
  const signature = cryptoImpl.createHmac('sha256', normalizedSecret).update(payloadEncoded).digest('hex');
  if (!signature) {
    return '';
  }

  return `${cookieName}=${payloadEncoded}.${signature}`;
}

export function createSessionUserResolver({
  runtimeEnv = globalThis,
  sessionSecret,
  sessionCookieName = DEFAULT_SESSION_COOKIE_NAME,
  cryptoImpl,
} = {}) {
  const env = (runtimeEnv && runtimeEnv.process && runtimeEnv.process.env) || {};
  const normalizedSecret = String(sessionSecret || env.BILLING_SESSION_SECRET || '').trim();
  const normalizedCookieName = String(sessionCookieName || DEFAULT_SESSION_COOKIE_NAME).trim();
  const resolvedCrypto = cryptoImpl || (runtimeEnv && runtimeEnv.__opportunityCrypto) || null;

  return function resolveSessionUserId(request = {}) {
    if (!normalizedSecret || !normalizedCookieName || !resolvedCrypto || typeof resolvedCrypto.createHmac !== 'function') {
      return '';
    }

    const headers = (request && request.headers) || {};
    const cookies = parseCookieHeader(headers.cookie || headers.Cookie || '');
    const cookieToken = String(cookies[normalizedCookieName] || '').trim();
    if (!cookieToken) {
      return '';
    }

    const segments = cookieToken.split('.');
    if (segments.length !== 2) {
      return '';
    }

    const [payloadEncoded, providedSignature] = segments;
    if (!payloadEncoded || !providedSignature) {
      return '';
    }

    const expectedSignature = resolvedCrypto.createHmac('sha256', normalizedSecret).update(payloadEncoded).digest('hex');
    if (!safeTimingEqual(providedSignature, expectedSignature, resolvedCrypto)) {
      return '';
    }

    try {
      const parsedPayload = JSON.parse(decodeBase64Url(payloadEncoded));
      return String((parsedPayload && parsedPayload.userId) || '').trim();
    } catch {
      return '';
    }
  };
}

export function createStripeWebhookVerifierFromEnv({ runtimeEnv = globalThis, webhookSecret, cryptoImpl } = {}) {
  const env = (runtimeEnv && runtimeEnv.process && runtimeEnv.process.env) || {};
  const normalizedSecret = String(webhookSecret || env.STRIPE_WEBHOOK_SECRET || '').trim();
  const resolvedCrypto = cryptoImpl || (runtimeEnv && runtimeEnv.__opportunityCrypto) || null;
  const toleranceSeed = Number.parseInt(String(env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || ''), 10);
  const toleranceSeconds = Number.isFinite(toleranceSeed)
    ? Math.max(0, toleranceSeed)
    : DEFAULT_WEBHOOK_TOLERANCE_SECONDS;

  if (!normalizedSecret || !resolvedCrypto || typeof resolvedCrypto.createHmac !== 'function') {
    return null;
  }

  return function verifyStripeWebhook({ rawBody = '', signatureHeader = '' } = {}) {
    const normalizedRawBody = String(rawBody || '');
    const { timestamp, signatures } = parseWebhookSignatureHeader(signatureHeader);
    const timestampSeconds = Number.parseInt(timestamp, 10);
    if (!timestamp || !Number.isFinite(timestampSeconds) || signatures.length < 1) {
      throw new Error('Invalid webhook signature.');
    }

    if (toleranceSeconds > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
        throw new Error('Invalid webhook signature.');
      }
    }

    const signedPayload = `${timestamp}.${normalizedRawBody}`;
    const expectedSignature = resolvedCrypto.createHmac('sha256', normalizedSecret).update(signedPayload).digest('hex');
    const matched = signatures.some((candidate) => safeTimingEqual(candidate, expectedSignature, resolvedCrypto));
    if (!matched) {
      throw new Error('Invalid webhook signature.');
    }

    try {
      return JSON.parse(normalizedRawBody);
    } catch {
      throw new Error('Invalid webhook payload.');
    }
  };
}

export function createBillingRouteHandlerFromRuntime({
  runtimeEnv = globalThis,
  operationMode,
  baseUrl,
  store,
  stripeAdapter,
  webhookVerifier,
  getAuthenticatedUserId,
} = {}) {
  const resolvedStore = store || createEnvPersistentBillingStore(runtimeEnv) || createInMemoryBillingStore();
  const resolvedStripeAdapter = stripeAdapter || createEnvStripeCheckoutAdapter(runtimeEnv);
  const resolvedWebhookVerifier =
    webhookVerifier === undefined ? createStripeWebhookVerifierFromEnv({ runtimeEnv }) : webhookVerifier;
  const resolveSessionUserId = getAuthenticatedUserId || createSessionUserResolver({ runtimeEnv });

  return createBillingApiRequestHandler({
    store: resolvedStore,
    stripeAdapter: resolvedStripeAdapter,
    webhookVerifier: resolvedWebhookVerifier,
    baseUrl: resolveBaseUrl(baseUrl, runtimeEnv),
    operationMode,
    runtimeEnv,
    getAuthenticatedUserId: (request) => resolveSessionUserId(request),
  });
}

function normalizeRequestPath(rawUrl = '/') {
  try {
    return new URL(String(rawUrl || '/'), 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function readRawRequestBody(request) {
  if (typeof request.rawBody === 'string') {
    return Promise.resolve(String(request.rawBody || ''));
  }

  if (Buffer.isBuffer(request.rawBody)) {
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

export function createNodeBillingRequestListener({ billingHandler, ...handlerOptions } = {}) {
  const resolvedBillingHandler = billingHandler || createBillingRouteHandlerFromRuntime(handlerOptions);

  return async function handleNodeBillingRequest(request, response) {
    const method = String((request && request.method) || 'GET').toUpperCase();
    const path = normalizeRequestPath((request && request.url) || '/');

    if (!BILLING_PATH_SET.has(path)) {
      return false;
    }

    try {
      const body = method === 'POST' ? await readRawRequestBody(request || {}) : '';
      const result = await resolvedBillingHandler({
        method,
        path,
        headers: (request && request.headers) || {},
        body,
      });

      const statusCode = Number((result && result.status) || 500);
      const payload = JSON.stringify((result && result.body) || { error: 'Unexpected error.' });

      if (response && typeof response.setHeader === 'function') {
        response.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (response) {
        response.statusCode = statusCode;
      }
      if (response && typeof response.end === 'function') {
        response.end(payload);
      }

      return true;
    } catch {
      if (response && typeof response.setHeader === 'function') {
        response.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (response) {
        response.statusCode = 500;
      }
      if (response && typeof response.end === 'function') {
        response.end(JSON.stringify({ error: 'Internal server error.' }));
      }
      return true;
    }
  };
}

