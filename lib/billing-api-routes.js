import {
  createBillingRuntime,
  createInMemoryBillingStore,
  createPersistentBillingStore,
  createStripeCheckoutAdapter,
} from './billing-runtime.js';

export const BILLING_API_PATHS = {
  ENTITLEMENTS: '/api/entitlements',
  CHECKOUT_SESSION: '/api/billing/checkout-session',
  STRIPE_WEBHOOK: '/api/billing/webhook/stripe',
};

function readHeader(headers = {}, key = '') {
  const normalizedKey = String(key || '').toLowerCase();
  const pairs = Object.entries(headers || {});
  const match = pairs.find(([headerName]) => String(headerName || '').toLowerCase() === normalizedKey);
  return match ? String(match[1] || '') : '';
}

function isRealOperationMode(operationMode = '') {
  const normalized = String(operationMode || '').trim().toLowerCase();
  return normalized !== 'development' && normalized !== 'test' && normalized !== 'mock';
}

function resolveOperationMode(operationMode, runtimeEnv) {
  const explicit = String(operationMode || '').trim();
  if (explicit) {
    return explicit;
  }

  const env = (runtimeEnv && runtimeEnv.process && runtimeEnv.process.env) || {};
  return String(env.OPPORTUNITY_OS_BILLING_MODE || env.NODE_ENV || '').trim();
}

function resolveAuthenticatedUserId(request, getAuthenticatedUserId) {
  if (typeof getAuthenticatedUserId !== 'function') {
    return '';
  }

  try {
    return String(getAuthenticatedUserId(request) || '').trim();
  } catch {
    return '';
  }
}

export function createBillingApiRequestHandler({
  store = createInMemoryBillingStore(),
  stripeAdapter = null,
  webhookVerifier = null,
  baseUrl = '',
  operationMode,
  runtimeEnv = globalThis,
  requirePersistentStore,
  getAuthenticatedUserId,
} = {}) {
  const resolvedOperationMode = resolveOperationMode(operationMode, runtimeEnv);
  const persistentStoreRequired =
    typeof requirePersistentStore === 'boolean' ? requirePersistentStore : isRealOperationMode(resolvedOperationMode);
  const hasPersistentStore = Boolean(store && store.isPersistent === true);
  const storeInitializationError =
    store && typeof store.initializationError === 'string' ? String(store.initializationError || '').trim() : '';

  const runtime = createBillingRuntime({
    store,
    stripeAdapter,
    webhookVerifier,
    baseUrl,
  });

  return async function handleRequest({ method = 'GET', path = '', headers = {}, body = '', session = null } = {}) {
    const normalizedMethod = String(method || '').toUpperCase();
    const normalizedPath = String(path || '').trim();

    if (storeInitializationError) {
      return {
        status: 503,
        body: {
          error: storeInitializationError,
        },
      };
    }

    if (persistentStoreRequired && !hasPersistentStore) {
      return {
        status: 503,
        body: {
          error: 'Persistent billing store is required in this operation mode.',
        },
      };
    }

    const requestContext = {
      method: normalizedMethod,
      path: normalizedPath,
      headers,
      body,
      session,
    };
    const authenticatedUserId = resolveAuthenticatedUserId(requestContext, getAuthenticatedUserId);

    if (normalizedMethod === 'GET' && normalizedPath === BILLING_API_PATHS.ENTITLEMENTS) {
      if (!authenticatedUserId) {
        return {
          status: 401,
          body: {
            error: 'Authentication is required.',
          },
        };
      }
      return runtime.readEntitlement({ userId: authenticatedUserId });
    }

    if (normalizedMethod === 'POST' && normalizedPath === BILLING_API_PATHS.CHECKOUT_SESSION) {
      if (!authenticatedUserId) {
        return {
          status: 401,
          body: {
            error: 'Authentication is required.',
          },
        };
      }
      return runtime.createCheckoutSession({ userId: authenticatedUserId });
    }

    if (normalizedMethod === 'POST' && normalizedPath === BILLING_API_PATHS.STRIPE_WEBHOOK) {
      return runtime.handleWebhook({
        rawBody: String(body || ''),
        signatureHeader: readHeader(headers, 'stripe-signature'),
      });
    }

    return {
      status: 404,
      body: {
        error: 'Not found.',
      },
    };
  };
}

export function createEnvStripeCheckoutAdapter(globalObject = globalThis) {
  const env = (globalObject && globalObject.process && globalObject.process.env) || {};
  return createStripeCheckoutAdapter({
    secretKey: env.STRIPE_SECRET_KEY || '',
    monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID || '',
    fetchImpl: globalObject && typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : null,
  });
}

export function createEnvPersistentBillingStore(globalObject = globalThis) {
  const env = (globalObject && globalObject.process && globalObject.process.env) || {};
  const filePath = String(env.BILLING_STORE_FILE || '').trim();
  const fsAdapter = globalObject && globalObject.__opportunityBillingFs;

  if (!filePath || !fsAdapter) {
    return null;
  }

  const readState = () => {
    if (!fsAdapter.existsSync(filePath)) {
      return {};
    }
    const raw = String(fsAdapter.readFileSync(filePath, 'utf8') || '');
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error('Persistent billing store file is corrupted or truncated.');
    }
  };

  const writeState = (state) => {
    const serialized = JSON.stringify(state);
    const tempPath = `${filePath}.tmp`;

    fsAdapter.writeFileSync(tempPath, serialized);
    if (typeof fsAdapter.renameSync === 'function') {
      fsAdapter.renameSync(tempPath, filePath);
      return;
    }

    fsAdapter.writeFileSync(filePath, serialized);
  };

  return createPersistentBillingStore({ readState, writeState });
}
