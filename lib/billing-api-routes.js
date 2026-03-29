import { createBillingRuntime, createInMemoryBillingStore, createStripeCheckoutAdapter } from './billing-runtime.js';

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

export function createBillingApiRequestHandler({
  store = createInMemoryBillingStore(),
  stripeAdapter = null,
  webhookVerifier = null,
  baseUrl = '',
} = {}) {
  const runtime = createBillingRuntime({
    store,
    stripeAdapter,
    webhookVerifier,
    baseUrl,
  });

  return async function handleRequest({ method = 'GET', path = '', headers = {}, body = '' } = {}) {
    const normalizedMethod = String(method || '').toUpperCase();
    const normalizedPath = String(path || '').trim();
    const userId = readHeader(headers, 'x-opportunity-os-user-id');

    if (normalizedMethod === 'GET' && normalizedPath === BILLING_API_PATHS.ENTITLEMENTS) {
      return runtime.readEntitlement({ userId });
    }

    if (normalizedMethod === 'POST' && normalizedPath === BILLING_API_PATHS.CHECKOUT_SESSION) {
      return runtime.createCheckoutSession({ userId });
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
