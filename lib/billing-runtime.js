const ENTITLEMENT_FREE = 'free';
const ENTITLEMENT_PAID_SUBSCRIPTION_ACTIVE = 'paid_subscription_active';
const ENTITLEMENT_PAID_FOUNDER_LIFETIME = 'paid_founder_lifetime';
const ENTITLEMENT_UNKNOWN = 'unknown';

const PAID_ENTITLEMENT_STATES = new Set([
  ENTITLEMENT_PAID_SUBSCRIPTION_ACTIVE,
  ENTITLEMENT_PAID_FOUNDER_LIFETIME,
]);

function normalizeEntitlementState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === ENTITLEMENT_FREE ||
    normalized === ENTITLEMENT_PAID_SUBSCRIPTION_ACTIVE ||
    normalized === ENTITLEMENT_PAID_FOUNDER_LIFETIME
  ) {
    return normalized;
  }
  return ENTITLEMENT_UNKNOWN;
}

function cloneDefaultStoreData() {
  return {
    entitlements: {},
    processedEventIds: [],
    subscriptionUsers: {},
  };
}

function normalizeStoreData(seed = {}) {
  const safeSeed = seed && typeof seed === 'object' ? seed : {};
  return {
    entitlements: safeSeed.entitlements && typeof safeSeed.entitlements === 'object' ? { ...safeSeed.entitlements } : {},
    processedEventIds: Array.isArray(safeSeed.processedEventIds) ? Array.from(new Set(safeSeed.processedEventIds.map((id) => String(id)))) : [],
    subscriptionUsers:
      safeSeed.subscriptionUsers && typeof safeSeed.subscriptionUsers === 'object' ? { ...safeSeed.subscriptionUsers } : {},
  };
}

export function createInMemoryBillingStore(seed = {}) {
  let state = normalizeStoreData({ ...cloneDefaultStoreData(), ...seed });

  return {
    getEntitlement(userId) {
      return state.entitlements[String(userId || '')] || null;
    },
    setEntitlement(userId, entitlementState, source = 'server') {
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedUserId) {
        return;
      }

      state.entitlements[normalizedUserId] = {
        entitlementState: normalizeEntitlementState(entitlementState),
        source: String(source || 'server'),
        updatedAt: new Date().toISOString(),
      };
    },
    hasProcessedEvent(eventId) {
      return state.processedEventIds.includes(String(eventId || ''));
    },
    markProcessedEvent(eventId) {
      const normalizedEventId = String(eventId || '').trim();
      if (!normalizedEventId || state.processedEventIds.includes(normalizedEventId)) {
        return;
      }
      state.processedEventIds.push(normalizedEventId);
    },
    setSubscriptionUser(subscriptionId, userId) {
      const normalizedSubscriptionId = String(subscriptionId || '').trim();
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedSubscriptionId || !normalizedUserId) {
        return;
      }
      state.subscriptionUsers[normalizedSubscriptionId] = normalizedUserId;
    },
    getSubscriptionUser(subscriptionId) {
      return state.subscriptionUsers[String(subscriptionId || '').trim()] || '';
    },
    snapshot() {
      return JSON.parse(JSON.stringify(state));
    },
  };
}

export function createPersistentBillingStore({ readState, writeState } = {}) {
  if (typeof readState !== 'function' || typeof writeState !== 'function') {
    throw new Error('Persistent billing store requires readState/writeState functions.');
  }

  let state = normalizeStoreData({ ...cloneDefaultStoreData(), ...(readState() || {}) });

  function persist() {
    writeState(state);
  }

  return {
    isPersistent: true,
    getEntitlement(userId) {
      return state.entitlements[String(userId || '')] || null;
    },
    setEntitlement(userId, entitlementState, source = 'server') {
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedUserId) {
        return;
      }

      state.entitlements[normalizedUserId] = {
        entitlementState: normalizeEntitlementState(entitlementState),
        source: String(source || 'server'),
        updatedAt: new Date().toISOString(),
      };
      persist();
    },
    hasProcessedEvent(eventId) {
      return state.processedEventIds.includes(String(eventId || ''));
    },
    markProcessedEvent(eventId) {
      const normalizedEventId = String(eventId || '').trim();
      if (!normalizedEventId || state.processedEventIds.includes(normalizedEventId)) {
        return;
      }
      state.processedEventIds.push(normalizedEventId);
      persist();
    },
    setSubscriptionUser(subscriptionId, userId) {
      const normalizedSubscriptionId = String(subscriptionId || '').trim();
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedSubscriptionId || !normalizedUserId) {
        return;
      }
      state.subscriptionUsers[normalizedSubscriptionId] = normalizedUserId;
      persist();
    },
    getSubscriptionUser(subscriptionId) {
      return state.subscriptionUsers[String(subscriptionId || '').trim()] || '';
    },
    snapshot() {
      return JSON.parse(JSON.stringify(state));
    },
  };
}

export function toSubscriptionState(entitlementState) {
  const normalizedState = normalizeEntitlementState(entitlementState);
  const isPaid = PAID_ENTITLEMENT_STATES.has(normalizedState);

  return {
    entitlementState: normalizedState,
    plan: isPaid ? 'paid' : 'free',
    isPaid,
    isUnknown: normalizedState === ENTITLEMENT_UNKNOWN,
  };
}

export function readEntitlementForUser(store, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!store || !normalizedUserId) {
    return {
      ...toSubscriptionState(ENTITLEMENT_UNKNOWN),
      source: 'server-unknown',
    };
  }

  try {
    const record = store.getEntitlement(normalizedUserId);
    if (!record) {
      return {
        ...toSubscriptionState(ENTITLEMENT_FREE),
        source: 'server-default',
      };
    }

    return {
      ...toSubscriptionState(record.entitlementState),
      source: String(record.source || 'server'),
      updatedAt: record.updatedAt || '',
    };
  } catch {
    return {
      ...toSubscriptionState(ENTITLEMENT_UNKNOWN),
      source: 'server-unknown',
    };
  }
}

export async function createMonthlyCheckoutSession({
  store,
  stripeAdapter,
  userId,
  baseUrl,
  successPath = '/app/dashboard.html?checkout=success',
  cancelPath = '/app/dashboard.html?checkout=cancel',
} = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return {
      ok: false,
      status: 401,
      error: 'Missing authenticated user context.',
    };
  }

  if (!stripeAdapter || typeof stripeAdapter.createMonthlyCheckoutSession !== 'function') {
    return {
      ok: false,
      status: 503,
      error: 'Billing checkout is not configured.',
    };
  }

  const normalizedBaseUrl = String(baseUrl || '').trim();
  if (!normalizedBaseUrl) {
    return {
      ok: false,
      status: 500,
      error: 'Billing base URL is not configured.',
    };
  }

  const successUrl = `${normalizedBaseUrl}${successPath}`;
  const cancelUrl = `${normalizedBaseUrl}${cancelPath}`;

  try {
    const session = await stripeAdapter.createMonthlyCheckoutSession({
      userId: normalizedUserId,
      successUrl,
      cancelUrl,
    });

    if (store && session && session.subscriptionId) {
      store.setSubscriptionUser(session.subscriptionId, normalizedUserId);
    }

    return {
      ok: true,
      status: 200,
      checkoutUrl: session && session.checkoutUrl ? String(session.checkoutUrl) : '',
      sessionId: session && session.sessionId ? String(session.sessionId) : '',
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error && error.message ? error.message : 'Checkout session creation failed.',
    };
  }
}

export function applyWebhookEvent(store, event) {
  if (!store || !event || typeof event !== 'object') {
    return { applied: false, duplicate: false };
  }

  const eventId = String(event.id || '').trim();
  const eventType = String(event.type || '').trim();

  if (!eventId || !eventType) {
    return { applied: false, duplicate: false };
  }

  if (store.hasProcessedEvent(eventId)) {
    return { applied: false, duplicate: true };
  }

  let applied = false;
  const payload = event && event.data && event.data.object ? event.data.object : {};

  if (eventType === 'checkout.session.completed') {
    const userId = String(
      (payload && payload.metadata && payload.metadata.opportunity_user_id) || payload.client_reference_id || ''
    ).trim();
    const subscriptionId = String(payload.subscription || '').trim();

    if (userId) {
      store.setEntitlement(userId, ENTITLEMENT_PAID_SUBSCRIPTION_ACTIVE, 'webhook-checkout-session-completed');
      if (subscriptionId) {
        store.setSubscriptionUser(subscriptionId, userId);
      }
      applied = true;
    }
  }

  if (eventType === 'customer.subscription.deleted') {
    const subscriptionId = String(payload.id || '').trim();
    const userId = store.getSubscriptionUser(subscriptionId);
    if (userId) {
      store.setEntitlement(userId, ENTITLEMENT_FREE, 'webhook-subscription-deleted');
      applied = true;
    }
  }

  store.markProcessedEvent(eventId);
  return { applied, duplicate: false };
}

export function createBillingRuntime({
  store = createInMemoryBillingStore(),
  stripeAdapter = null,
  webhookVerifier = null,
  baseUrl = '',
} = {}) {
  return {
    async readEntitlement(request = {}) {
      const entitlement = readEntitlementForUser(store, request.userId);
      return {
        status: 200,
        body: entitlement,
      };
    },
    async createCheckoutSession(request = {}) {
      const result = await createMonthlyCheckoutSession({
        store,
        stripeAdapter,
        userId: request.userId,
        baseUrl,
      });

      if (!result.ok) {
        return {
          status: result.status,
          body: {
            error: result.error,
          },
        };
      }

      return {
        status: 200,
        body: {
          checkoutUrl: result.checkoutUrl,
          sessionId: result.sessionId,
        },
      };
    },
    async handleWebhook(request = {}) {
      if (typeof webhookVerifier !== 'function') {
        return {
          status: 503,
          body: {
            error: 'Webhook verification is not configured.',
          },
        };
      }

      try {
        const rawBody = String(request.rawBody || '');
        const event = webhookVerifier({ rawBody, signatureHeader: request.signatureHeader });
        const result = applyWebhookEvent(store, event);
        return {
          status: 200,
          body: {
            received: true,
            duplicate: result.duplicate,
            applied: result.applied,
          },
        };
      } catch (error) {
        return {
          status: 400,
          body: {
            error: error && error.message ? error.message : 'Invalid webhook payload.',
          },
        };
      }
    },
  };
}

export function createStripeCheckoutAdapter({ secretKey = '', monthlyPriceId = '', fetchImpl = null } = {}) {
  const normalizedSecretKey = String(secretKey || '').trim();
  const normalizedMonthlyPriceId = String(monthlyPriceId || '').trim();

  return {
    async createMonthlyCheckoutSession({ userId, successUrl, cancelUrl }) {
      if (!normalizedSecretKey || !normalizedMonthlyPriceId || typeof fetchImpl !== 'function') {
        throw new Error('Stripe checkout adapter is not fully configured.');
      }

      const body = new URLSearchParams();
      body.set('mode', 'subscription');
      body.set('success_url', String(successUrl || ''));
      body.set('cancel_url', String(cancelUrl || ''));
      body.set('line_items[0][price]', normalizedMonthlyPriceId);
      body.set('line_items[0][quantity]', '1');
      body.set('client_reference_id', String(userId || ''));
      body.set('metadata[opportunity_user_id]', String(userId || ''));

      const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalizedSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      const payload = await response.json();
      if (!response.ok) {
        const message = payload && payload.error && payload.error.message ? payload.error.message : 'Stripe checkout failed.';
        throw new Error(message);
      }

      return {
        sessionId: String(payload.id || ''),
        checkoutUrl: String(payload.url || ''),
        subscriptionId: String(payload.subscription || ''),
      };
    },
  };
}

export const BILLING_ENTITLEMENT_STATES = {
  FREE: ENTITLEMENT_FREE,
  PAID_SUBSCRIPTION_ACTIVE: ENTITLEMENT_PAID_SUBSCRIPTION_ACTIVE,
  PAID_FOUNDER_LIFETIME: ENTITLEMENT_PAID_FOUNDER_LIFETIME,
  UNKNOWN: ENTITLEMENT_UNKNOWN,
};
