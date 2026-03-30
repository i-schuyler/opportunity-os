// scripts/node-test-placeholder.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const pendingAsyncTests = [];

const appDir = path.join(__dirname, '..', 'app');
const requiredFiles = ['index.html', 'styles.css', 'main.js'];

for (const file of requiredFiles) {
  const filePath = path.join(appDir, file);
  assert.ok(fs.existsSync(filePath), `expected app shell file to exist: ${file}`);
}

const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(appDir, 'dashboard.html'), 'utf8');
assert.ok(html.includes('<title>Opportunity OS</title>'), 'expected shell title in index.html');
assert.ok(
  html.includes('opportunity seekers') || html.includes('Opportunity seekers'),
  'expected opportunity-seekers messaging in index.html'
);
assert.ok(
  dashboardHtml.includes('id="subscription-boundary-panel"'),
  'expected dashboard subscription boundary panel to exist'
);

function makeSessionStorage(initialValues = {}) {
  const map = new Map();
  const setCalls = [];

  Object.entries(initialValues).forEach(([key, value]) => {
    map.set(key, String(value));
  });

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      const normalized = String(value);
      setCalls.push({ key, value: normalized });
      map.set(key, normalized);
    },
    removeItem(key) {
      map.delete(key);
    },
    _setCalls: setCalls,
  };
}

function loadAuthScaffold(windowObj) {
  const filePath = path.join(__dirname, '..', 'lib', 'auth-scaffold.js');
  let source = fs.readFileSync(filePath, 'utf8');

  source = source.replace(/export function\s+/g, 'function ');
  source += '\nmodule.exports = { isMockAuthEnabled, getMockSession, signInWithEmail, signOut };\n';

  const context = {
    window: windowObj,
    module: { exports: {} },
    exports: {},
    Date,
    JSON,
  };

  vm.createContext(context);
  new vm.Script(source, { filename: filePath }).runInContext(context);
  return context.module.exports;
}

function loadDashboardModule(mocks) {
  const filePath = path.join(__dirname, '..', 'app', 'dashboard.js');
  let source = fs.readFileSync(filePath, 'utf8');

  source = source.replace(/^import[\s\S]*?;\n/gm, '');
  source = source.replace(/export function\s+/g, 'function ');
  source = source.replace(
    /\nif \(typeof window !== 'undefined' && typeof document !== 'undefined'\) \{\n  initializeDashboard\(window, document\);\n\}\n?$/,
    '\n'
  );
  source +=
    '\nmodule.exports = { initializeDashboard, buildCard, buildSampleOpportunitySeeds, normalizeSafeSourceLink, normalizeDashboardFilters, deriveStatusOptions, deriveBulkStatusOptions, filterOpportunityItems, sortOpportunityItems, classifyDeadlineUrgency, buildNextBestActions, buildDashboardChecklist, buildOpportunityExportPayload, parseOpportunityImportPayload, mergeImportedOpportunitiesForUser, resolveLocalSubscriptionState, buildSubscriptionBoundaryState };\n';

  const context = {
    ...mocks,
    module: { exports: {} },
    exports: {},
    JSON,
    URL,
    URLSearchParams,
    Blob: mocks.Blob || globalThis.Blob,
  };

  vm.createContext(context);
  new vm.Script(source, { filename: filePath }).runInContext(context);
  return context.module.exports;
}

function loadOpportunityModel() {
  const filePath = path.join(__dirname, '..', 'lib', 'opportunity-model.js');
  let source = fs.readFileSync(filePath, 'utf8');

  source = source.replace(/export function\s+/g, 'function ');
  source +=
    '\nmodule.exports = { createOpportunity, listOpportunitiesForUser, createOpportunityForUser, updateOpportunityForUser, archiveOpportunityForUser, deleteOpportunityForUser };\n';

  const context = {
    module: { exports: {} },
    exports: {},
    Date,
    JSON,
    globalThis: {},
  };

  vm.createContext(context);
  new vm.Script(source, { filename: filePath }).runInContext(context);
  return context.module.exports;
}

function loadBillingRuntimeModule() {
  const filePath = path.join(__dirname, '..', 'lib', 'billing-runtime.js');
  let source = fs.readFileSync(filePath, 'utf8');

  source = source.replace(/export async function\s+/g, 'async function ');
  source = source.replace(/export function\s+/g, 'function ');
  source = source.replace(/export const\s+/g, 'const ');
  source +=
    '\nmodule.exports = { createInMemoryBillingStore, createPersistentBillingStore, toSubscriptionState, readEntitlementForUser, createMonthlyCheckoutSession, applyWebhookEvent, createBillingRuntime, createStripeCheckoutAdapter, BILLING_ENTITLEMENT_STATES };\n';

  const context = {
    module: { exports: {} },
    exports: {},
    Date,
    URLSearchParams,
  };

  vm.createContext(context);
  new vm.Script(source, { filename: filePath }).runInContext(context);
  return context.module.exports;
}

function loadBillingApiRoutesModule(runtimeModule) {
  const filePath = path.join(__dirname, '..', 'lib', 'billing-api-routes.js');
  let source = fs.readFileSync(filePath, 'utf8');

  source = source.replace(/^import[\s\S]*?;\n/gm, '');
  source = source.replace(/export function\s+/g, 'function ');
  source = source.replace(/export const\s+/g, 'const ');
  source += '\nmodule.exports = { BILLING_API_PATHS, createBillingApiRequestHandler, createEnvStripeCheckoutAdapter, createEnvPersistentBillingStore };\n';

  const context = {
    ...runtimeModule,
    module: { exports: {} },
    exports: {},
    globalThis,
  };

  vm.createContext(context);
  new vm.Script(source, { filename: filePath }).runInContext(context);
  return context.module.exports;
}

(function testBillingEntitlementReadFailsClosedWhenUnknown() {
  const billing = loadBillingRuntimeModule();
  const store = billing.createInMemoryBillingStore();

  const freeEntitlement = billing.readEntitlementForUser(store, 'dev-user');
  assert.strictEqual(freeEntitlement.entitlementState, 'free');
  assert.strictEqual(freeEntitlement.plan, 'free');
  assert.strictEqual(freeEntitlement.isPaid, false);

  const unknownEntitlement = billing.readEntitlementForUser(
    {
      getEntitlement() {
        throw new Error('store-read-failed');
      },
    },
    'dev-user'
  );
  assert.strictEqual(unknownEntitlement.entitlementState, 'unknown');
  assert.strictEqual(unknownEntitlement.plan, 'free');
  assert.strictEqual(unknownEntitlement.isPaid, false);
})();

pendingAsyncTests.push(
  (async function testBillingCheckoutSessionAndWebhookRuntimePaths() {
    const billing = loadBillingRuntimeModule();
    const routes = loadBillingApiRoutesModule(billing);
    let persistedState = {};
    const store = billing.createPersistentBillingStore({
      readState: () => persistedState,
      writeState: (nextState) => {
        persistedState = JSON.parse(JSON.stringify(nextState));
      },
    });

    const handler = routes.createBillingApiRequestHandler({
      store,
      operationMode: 'production',
      getAuthenticatedUserId: (request) => (request && request.session && request.session.userId) || '',
      baseUrl: 'https://app.example.test',
      webhookVerifier: ({ rawBody }) => JSON.parse(rawBody),
      stripeAdapter: {
        async createMonthlyCheckoutSession({ userId, successUrl, cancelUrl }) {
          assert.strictEqual(userId, 'dev-user');
          assert.strictEqual(successUrl, 'https://app.example.test/app/dashboard.html?checkout=success');
          assert.strictEqual(cancelUrl, 'https://app.example.test/app/dashboard.html?checkout=cancel');
          return {
            sessionId: 'cs_test_123',
            checkoutUrl: 'https://checkout.stripe.test/session/cs_test_123',
            subscriptionId: 'sub_test_123',
          };
        },
      },
    });

    const entitlementResponse = await handler({
      method: 'GET',
      path: routes.BILLING_API_PATHS.ENTITLEMENTS,
      session: { userId: 'dev-user' },
    });
    assert.strictEqual(entitlementResponse.status, 200);
    assert.strictEqual(entitlementResponse.body.entitlementState, 'free');

    const checkoutResponse = await handler({
      method: 'POST',
      path: routes.BILLING_API_PATHS.CHECKOUT_SESSION,
      session: { userId: 'dev-user' },
      body: '{}',
    });
    assert.strictEqual(checkoutResponse.status, 200);
    assert.strictEqual(checkoutResponse.body.checkoutUrl, 'https://checkout.stripe.test/session/cs_test_123');

    const checkoutCompletedWebhook = await handler({
      method: 'POST',
      path: routes.BILLING_API_PATHS.STRIPE_WEBHOOK,
      body: JSON.stringify({
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'dev-user',
            subscription: 'sub_test_123',
          },
        },
      }),
    });
    assert.strictEqual(checkoutCompletedWebhook.status, 200);
    assert.strictEqual(checkoutCompletedWebhook.body.applied, true);

    const paidEntitlement = billing.readEntitlementForUser(store, 'dev-user');
    assert.strictEqual(paidEntitlement.entitlementState, 'paid_subscription_active');
    assert.strictEqual(paidEntitlement.isPaid, true);

    const duplicateWebhook = await handler({
      method: 'POST',
      path: routes.BILLING_API_PATHS.STRIPE_WEBHOOK,
      body: JSON.stringify({
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'dev-user',
            subscription: 'sub_test_123',
          },
        },
      }),
    });
    assert.strictEqual(duplicateWebhook.status, 200);
    assert.strictEqual(duplicateWebhook.body.duplicate, true);

    const subscriptionDeletedWebhook = await handler({
      method: 'POST',
      path: routes.BILLING_API_PATHS.STRIPE_WEBHOOK,
      body: JSON.stringify({
        id: 'evt_subscription_deleted_1',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_123',
          },
        },
      }),
    });
    assert.strictEqual(subscriptionDeletedWebhook.status, 200);
    assert.strictEqual(subscriptionDeletedWebhook.body.applied, true);

    const freeAgainEntitlement = billing.readEntitlementForUser(store, 'dev-user');
    assert.strictEqual(freeAgainEntitlement.entitlementState, 'free');
    assert.strictEqual(freeAgainEntitlement.isPaid, false);
  })()
);

pendingAsyncTests.push(
  (async function testBillingRoutesRejectMissingAuthAndIgnoreClientUserHeader() {
    const billing = loadBillingRuntimeModule();
    const routes = loadBillingApiRoutesModule(billing);
    const store = billing.createInMemoryBillingStore();

    const handler = routes.createBillingApiRequestHandler({
      store,
      operationMode: 'development',
      getAuthenticatedUserId: () => '',
      baseUrl: 'https://app.example.test',
      stripeAdapter: {
        async createMonthlyCheckoutSession() {
          throw new Error('should not be reached without trusted auth');
        },
      },
      webhookVerifier: ({ rawBody }) => JSON.parse(rawBody),
    });

    const entitlementResponse = await handler({
      method: 'GET',
      path: routes.BILLING_API_PATHS.ENTITLEMENTS,
      headers: { 'x-opportunity-os-user-id': 'dev-user' },
      session: null,
    });
    assert.strictEqual(entitlementResponse.status, 401);

    const checkoutResponse = await handler({
      method: 'POST',
      path: routes.BILLING_API_PATHS.CHECKOUT_SESSION,
      headers: { 'x-opportunity-os-user-id': 'dev-user' },
      session: null,
    });
    assert.strictEqual(checkoutResponse.status, 401);
  })()
);

pendingAsyncTests.push(
  (async function testBillingWebhookRejectsMalformedSignature() {
    const billing = loadBillingRuntimeModule();
    const routes = loadBillingApiRoutesModule(billing);
    const store = billing.createInMemoryBillingStore();

    const handler = routes.createBillingApiRequestHandler({
      store,
      operationMode: 'development',
      webhookVerifier: ({ rawBody, signatureHeader }) => {
        if (signatureHeader !== 'sig_valid') {
          throw new Error('Invalid webhook signature.');
        }
        return JSON.parse(rawBody);
      },
      getAuthenticatedUserId: () => '',
      baseUrl: 'https://app.example.test',
    });

    const response = await handler({
      method: 'POST',
      path: routes.BILLING_API_PATHS.STRIPE_WEBHOOK,
      headers: { 'stripe-signature': 'sig_invalid' },
      body: JSON.stringify({ id: 'evt_invalid_sig', type: 'checkout.session.completed', data: { object: {} } }),
    });
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, 'Invalid webhook signature.');
  })()
);

pendingAsyncTests.push(
  (async function testBillingRoutesUnsetModeDefaultsToNonRealBehavior() {
    const billing = loadBillingRuntimeModule();
    const routes = loadBillingApiRoutesModule(billing);
    const store = billing.createInMemoryBillingStore();

    const handler = routes.createBillingApiRequestHandler({
      store,
      runtimeEnv: { process: { env: {} } },
      getAuthenticatedUserId: () => 'dev-user',
      baseUrl: 'https://app.example.test',
      webhookVerifier: ({ rawBody }) => JSON.parse(rawBody),
    });

    const entitlementResponse = await handler({
      method: 'GET',
      path: routes.BILLING_API_PATHS.ENTITLEMENTS,
      session: { userId: 'dev-user' },
    });
    assert.strictEqual(entitlementResponse.status, 200);
    assert.strictEqual(entitlementResponse.body.entitlementState, 'free');
  })()
);

pendingAsyncTests.push(
  (async function testBillingRoutesFailClosedWithoutPersistentStoreInRealMode() {
    const billing = loadBillingRuntimeModule();
    const routes = loadBillingApiRoutesModule(billing);
    const store = billing.createInMemoryBillingStore();

    const handler = routes.createBillingApiRequestHandler({
      store,
      runtimeEnv: { process: { env: { NODE_ENV: 'production' } } },
      getAuthenticatedUserId: () => 'dev-user',
      baseUrl: 'https://app.example.test',
      webhookVerifier: ({ rawBody }) => JSON.parse(rawBody),
    });

    const entitlementResponse = await handler({
      method: 'GET',
      path: routes.BILLING_API_PATHS.ENTITLEMENTS,
      session: { userId: 'dev-user' },
    });
    assert.strictEqual(entitlementResponse.status, 503);
    assert.strictEqual(entitlementResponse.body.error, 'Persistent billing store is required in this operation mode.');
  })()
);

pendingAsyncTests.push(
  (async function testEnvPersistentStoreCorruptionFailsClosedClearly() {
  const billing = loadBillingRuntimeModule();
  const routes = loadBillingApiRoutesModule(billing);

  const runtimeEnv = {
    process: {
      env: {
        BILLING_STORE_FILE: '/tmp/billing-state.json',
        NODE_ENV: 'production',
      },
    },
    __opportunityBillingFs: {
      existsSync() {
        return true;
      },
      readFileSync() {
        return '{bad-json';
      },
      writeFileSync() {},
      renameSync() {},
    },
  };

  const persistentStore = routes.createEnvPersistentBillingStore(runtimeEnv);
  assert.strictEqual(persistentStore.isPersistent, true);
  assert.strictEqual(persistentStore.isHealthy, false);
  assert.ok(
    persistentStore.initializationError.includes('corrupted or truncated'),
    'expected clear corruption message from persistent store initialization'
  );

  const handler = routes.createBillingApiRequestHandler({
    store: persistentStore,
    runtimeEnv,
    getAuthenticatedUserId: () => 'dev-user',
    baseUrl: 'https://app.example.test',
    webhookVerifier: ({ rawBody }) => JSON.parse(rawBody),
  });

  const response = await handler({ method: 'GET', path: routes.BILLING_API_PATHS.ENTITLEMENTS, session: { userId: 'dev-user' } });
  assert.strictEqual(response.status, 503);
  assert.ok(
    response.body.error.includes('corrupted or truncated'),
    'expected route handler to fail closed with corruption-aware store error'
  );
  })()
);

(function testEnvPersistentStoreWritesUseTempThenRename() {
  const billing = loadBillingRuntimeModule();
  const routes = loadBillingApiRoutesModule(billing);

  const writes = [];
  const files = {};
  const runtimeEnv = {
    process: {
      env: {
        BILLING_STORE_FILE: '/tmp/billing-state.json',
      },
    },
    __opportunityBillingFs: {
      existsSync(pathname) {
        return Object.prototype.hasOwnProperty.call(files, pathname);
      },
      readFileSync(pathname) {
        return files[pathname] || '';
      },
      writeFileSync(pathname, content) {
        writes.push({ type: 'write', pathname });
        files[pathname] = String(content || '');
      },
      renameSync(sourcePath, destinationPath) {
        writes.push({ type: 'rename', sourcePath, destinationPath });
        files[destinationPath] = files[sourcePath];
        delete files[sourcePath];
      },
    },
  };

  const persistentStore = routes.createEnvPersistentBillingStore(runtimeEnv);
  persistentStore.setEntitlement('dev-user', 'paid_subscription_active', 'test');

  assert.strictEqual(writes[0].type, 'write');
  assert.strictEqual(writes[0].pathname, '/tmp/billing-state.json.tmp');
  assert.strictEqual(writes[1].type, 'rename');
  assert.strictEqual(writes[1].sourcePath, '/tmp/billing-state.json.tmp');
  assert.strictEqual(writes[1].destinationPath, '/tmp/billing-state.json');
  assert.ok(files['/tmp/billing-state.json'], 'expected final billing state file write via rename');
})();

pendingAsyncTests.push(
  (async function testBillingRouteFactoryWiringUsesTrustedSessionIdentityAndPersistentDependencies() {
    const billing = loadBillingRuntimeModule();
    const routes = loadBillingApiRoutesModule(billing);

    const files = {};
    const runtimeEnv = {
      process: {
        env: {
          BILLING_STORE_FILE: '/tmp/billing-state.json',
          NODE_ENV: 'production',
        },
      },
      __opportunityBillingFs: {
        existsSync(pathname) {
          return Object.prototype.hasOwnProperty.call(files, pathname);
        },
        readFileSync(pathname) {
          return files[pathname] || '';
        },
        writeFileSync(pathname, content) {
          files[pathname] = String(content || '');
        },
        renameSync(sourcePath, destinationPath) {
          files[destinationPath] = files[sourcePath];
          delete files[sourcePath];
        },
      },
    };

    const persistentStore = routes.createEnvPersistentBillingStore(runtimeEnv);
    const handler = routes.createBillingApiRequestHandler({
      store: persistentStore,
      runtimeEnv,
      getAuthenticatedUserId: (request) => (request && request.session && request.session.userId) || '',
      baseUrl: 'https://app.example.test',
      webhookVerifier: ({ rawBody }) => JSON.parse(rawBody),
      stripeAdapter: {
        async createMonthlyCheckoutSession({ userId }) {
          assert.strictEqual(userId, 'trusted-user', 'expected trusted session identity, not client header');
          return {
            sessionId: 'cs_route_wiring',
            checkoutUrl: 'https://checkout.stripe.test/session/cs_route_wiring',
            subscriptionId: 'sub_route_wiring',
          };
        },
      },
    });

    const response = await handler({
      method: 'POST',
      path: routes.BILLING_API_PATHS.CHECKOUT_SESSION,
      headers: { 'x-opportunity-os-user-id': 'attacker-user' },
      session: { userId: 'trusted-user' },
      body: '{}',
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.checkoutUrl, 'https://checkout.stripe.test/session/cs_route_wiring');
  })()
);

(function testGetMockSessionValid() {
  const windowObj = {
    OPPORTUNITY_OS_ENABLE_MOCK_AUTH: true,
    sessionStorage: makeSessionStorage(),
  };
  windowObj.sessionStorage.setItem(
    'opportunityOsMockSession',
    JSON.stringify({ userId: 'dev-user', email: 'user@example.com' })
  );

  const auth = loadAuthScaffold(windowObj);
  const session = auth.getMockSession();

  assert.deepStrictEqual(session, { userId: 'dev-user', email: 'user@example.com' });
})();

(function testGetMockSessionMalformed() {
  const windowObj = {
    OPPORTUNITY_OS_ENABLE_MOCK_AUTH: true,
    sessionStorage: makeSessionStorage(),
  };
  windowObj.sessionStorage.setItem('opportunityOsMockSession', '{not-json');

  const auth = loadAuthScaffold(windowObj);
  assert.strictEqual(auth.getMockSession(), null);
})();

(function testSignInValidationAndNormalization() {
  const windowObj = {
    OPPORTUNITY_OS_ENABLE_MOCK_AUTH: true,
    sessionStorage: makeSessionStorage(),
  };

  const auth = loadAuthScaffold(windowObj);

  assert.strictEqual(auth.signInWithEmail('   '), null);
  assert.strictEqual(auth.signInWithEmail('not-an-email'), null);

  const session = auth.signInWithEmail('  USER+Tag@Example.COM  ');
  assert.ok(session, 'expected a session for a valid email');
  assert.strictEqual(session.email, 'user+tag@example.com');
  assert.strictEqual(session.userId, 'dev-user-tag-example-com');
})();

(function testSignInFailsClosedWhenMockDisabled() {
  const windowObj = {
    OPPORTUNITY_OS_ENABLE_MOCK_AUTH: false,
    sessionStorage: makeSessionStorage(),
  };

  const auth = loadAuthScaffold(windowObj);
  assert.strictEqual(auth.signInWithEmail('user@example.com'), null);
})();

(function testDashboardRedirectStopsExecution() {
  let redirectedTo = null;
  let getElementByIdCalls = 0;

  const win = {
    location: {
      search: '?mockAuth=1',
      replace(url) {
        redirectedTo = url;
      },
      assign() {
        throw new Error('assign should not be called in unauthenticated redirect path');
      },
    },
  };

  const doc = {
    getElementById() {
      getElementByIdCalls += 1;
      throw new Error('dashboard should return before querying DOM when session is missing');
    },
    createElement() {
      throw new Error('createElement should not run for unauthenticated path');
    },
    body: {
      prepend() {
        throw new Error('banner should not render for unauthenticated path');
      },
    },
  };

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => null,
    isMockAuthEnabled: () => true,
    signOut: () => {},
    createOpportunity: () => {
      throw new Error('createOpportunity should not run for unauthenticated path');
    },
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  assert.strictEqual(redirectedTo, './auth.html?mockAuth=1');
  assert.strictEqual(getElementByIdCalls, 0);
})();

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || '').toLowerCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.type = '';
    this.href = '';
    this.target = '';
    this.rel = '';
    this.value = '';
    this.checked = false;
    this.files = null;
    this.parentNode = null;
    this.listeners = new Map();
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    if (this.children.length > 0) {
      return this.children
        .map((child) => (typeof child === 'string' ? child : child.textContent))
        .join('');
    }
    return this._textContent;
  }

  append(...nodes) {
    nodes.forEach((node) => {
      if (typeof node === 'string') {
        this.children.push(node);
        return;
      }
      node.parentNode = this;
      this.children.push(node);
    });
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => {
      if (child && typeof child !== 'string') {
        child.parentNode = null;
      }
    });
    this.children = [];
    this._textContent = '';
    if (nodes.length > 0) {
      this.append(...nodes);
    }
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  click() {
    return this.trigger('click');
  }

  closest(selector) {
    let current = this;

    while (current) {
      if (
        selector === 'button[data-action]' &&
        current.tagName === 'button' &&
        current.dataset &&
        current.dataset.action
      ) {
        return current;
      }

      if (
        selector === 'input[data-bulk-select]' &&
        current.tagName === 'input' &&
        current.dataset &&
        current.dataset.bulkSelect
      ) {
        return current;
      }

      if (selector === '[data-id]' && current.dataset && current.dataset.id) {
        return current;
      }

      current = current.parentNode;
    }

    return null;
  }

  trigger(type, eventOverrides = {}) {
    const handlers = this.listeners.get(type) || [];
    const settled = handlers.map((handler) =>
      Promise.resolve(
        handler({
          target: this,
          preventDefault() {},
          ...eventOverrides,
        })
      )
    );
    return Promise.all(settled);
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function findFirstNode(root, predicate) {
  if (!root || typeof root === 'string') {
    return null;
  }
  if (predicate(root)) {
    return root;
  }
  for (const child of root.children) {
    const found = findFirstNode(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
}

function testOpportunityItem(source_link, overrides = {}) {
  return {
    id: 'opp-1',
    title: 'Test opportunity',
    type: 'general',
    source_link,
    contact: 'person@example.com',
    deadline: '',
    status: 'new',
    tags: [],
    notes: 'note',
    archived: false,
    ...overrides,
  };
}

function makeDashboardHarness({ storedFilters = null, withForm = false, formValues = {} } = {}) {
  const storageKey = 'opportunityOsDashboardFilters';
  const storage = makeSessionStorage(
    storedFilters
      ? {
          [storageKey]: JSON.stringify(storedFilters),
        }
      : {}
  );

  const nodes = {
    sessionEmail: new FakeElement('p'),
    list: new FakeElement('div'),
    subscriptionSummary: new FakeElement('p'),
    subscriptionFeatureList: new FakeElement('ul'),
    subscriptionFeedback: new FakeElement('p'),
    upgradeCtaButton: new FakeElement('button'),
    viewFilter: new FakeElement('select'),
    statusFilter: new FakeElement('select'),
    sortFilter: new FakeElement('select'),
    nextBestActionSummary: new FakeElement('p'),
    nextBestActionList: new FakeElement('ul'),
    nextBestActionLockMessage: new FakeElement('p'),
    onboardingChecklistSummary: new FakeElement('p'),
    onboardingChecklistList: new FakeElement('ul'),
    summary: new FakeElement('p'),
    bulkActions: new FakeElement('div'),
    selectedSummary: new FakeElement('p'),
    bulkArchiveButton: new FakeElement('button'),
    bulkStatusSelect: new FakeElement('select'),
    bulkStatusApplyButton: new FakeElement('button'),
    exportJsonButton: new FakeElement('button'),
    importJsonButton: new FakeElement('button'),
    importJsonInput: new FakeElement('input'),
    transferFeedback: new FakeElement('p'),
    form: withForm ? new FakeElement('form') : null,
    saveOpportunityButton: withForm ? new FakeElement('button') : null,
    cancelEditButton: withForm ? new FakeElement('button') : null,
  };
  if (nodes.form) {
    nodes.form._formValues = { ...formValues };
    nodes.form.reset = () => {
      nodes.form._formValues = {};
    };
  }
  nodes.subscriptionFeedback.hidden = true;
  nodes.nextBestActionLockMessage.hidden = true;

  const nodeById = {
    'session-email': nodes.sessionEmail,
    'opportunity-list': nodes.list,
    'subscription-summary': nodes.subscriptionSummary,
    'subscription-feature-list': nodes.subscriptionFeatureList,
    'subscription-feedback': nodes.subscriptionFeedback,
    'upgrade-cta-button': nodes.upgradeCtaButton,
    'filter-view': nodes.viewFilter,
    'filter-status': nodes.statusFilter,
    'filter-sort': nodes.sortFilter,
    'next-best-action-summary': nodes.nextBestActionSummary,
    'next-best-action-list': nodes.nextBestActionList,
    'next-best-action-lock-message': nodes.nextBestActionLockMessage,
    'onboarding-checklist-summary': nodes.onboardingChecklistSummary,
    'onboarding-checklist-list': nodes.onboardingChecklistList,
    'filter-summary': nodes.summary,
    'bulk-actions': nodes.bulkActions,
    'selected-summary': nodes.selectedSummary,
    'bulk-archive-button': nodes.bulkArchiveButton,
    'bulk-status-select': nodes.bulkStatusSelect,
    'bulk-status-apply-button': nodes.bulkStatusApplyButton,
    'export-json-button': nodes.exportJsonButton,
    'import-json-button': nodes.importJsonButton,
    'import-json-input': nodes.importJsonInput,
    'transfer-feedback': nodes.transferFeedback,
    'opportunity-form': nodes.form,
    'save-opportunity-button': nodes.saveOpportunityButton,
    'cancel-edit-button': nodes.cancelEditButton,
    'sign-out-button': null,
  };

  const doc = {
    getElementById(id) {
      return Object.prototype.hasOwnProperty.call(nodeById, id) ? nodeById[id] : null;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    body: {
      prepend() {},
    },
  };

  const win = {
    location: {
      search: '?mockAuth=1&mockPlan=paid',
      replace() {
        throw new Error('replace should not be called in authenticated dashboard test path');
      },
      assign() {
        throw new Error('assign should not be called in dashboard filter tests');
      },
    },
    sessionStorage: storage,
  };

  return { win, doc, nodes, storage };
}

function renderedCardIds(listNode) {
  return listNode.children.filter((node) => node && node.tagName === 'article').map((node) => node.dataset.id);
}

function findRenderedCard(listNode, cardId) {
  return listNode.children.find((node) => node && node.tagName === 'article' && node.dataset.id === cardId) || null;
}

function clickCardAction(listNode, cardId, action, statusValue = '') {
  const card = findRenderedCard(listNode, cardId);
  assert.ok(card, `expected rendered card for id "${cardId}"`);
  const targetButton = findFirstNode(
    card,
    (node) =>
      node &&
      node.tagName === 'button' &&
      node.dataset &&
      node.dataset.action === action &&
      (statusValue ? node.dataset.status === statusValue : true)
  );
  assert.ok(targetButton, `expected button action "${action}" on card "${cardId}"`);
  listNode.trigger('click', { target: targetButton });
}

function toggleCardSelection(listNode, cardId, checked = true) {
  const card = findRenderedCard(listNode, cardId);
  assert.ok(card, `expected rendered card for id "${cardId}"`);
  const checkbox = findFirstNode(
    card,
    (node) => node && node.tagName === 'input' && node.dataset && node.dataset.bulkSelect
  );
  assert.ok(checkbox, `expected bulk selection checkbox on card "${cardId}"`);
  checkbox.checked = checked;
  listNode.trigger('change', { target: checkbox });
}

(function testDashboardSourceLinkHttpsIsClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('  https://example.com/path  ', { contact: '' }), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a' && node.href.startsWith('https://'));

  assert.ok(link, 'expected https source link to render as clickable anchor');
  assert.strictEqual(link.href, 'https://example.com/path');
})();

(function testDashboardSourceLinkHttpIsClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('http://example.com/path', { contact: '' }), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a' && node.href.startsWith('http://'));

  assert.ok(link, 'expected http source link to render as clickable anchor');
  assert.strictEqual(link.href, 'http://example.com/path');
})();

(function testDashboardSourceLinkJavascriptIsNotClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('javascript:alert(1)', { contact: '' }), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');
  const sourceText = findFirstNode(card, (node) => node.tagName === 'p' && node.textContent.includes('Source:'));

  assert.strictEqual(link, null, 'expected javascript: source link to be blocked');
  assert.ok(sourceText, 'expected blocked javascript link to render as non-clickable source text');
})();

(function testDashboardSourceLinkMalformedIsNotClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('not-a-valid-url', { contact: '' }), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');
  const sourceText = findFirstNode(card, (node) => node.tagName === 'p' && node.textContent.includes('Source:'));

  assert.strictEqual(link, null, 'expected malformed source link to be blocked');
  assert.ok(sourceText, 'expected malformed source link to render as non-clickable source text');
})();

(function testDashboardContactEmailRendersMailAction() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('', { contact: ' person@example.com ' }), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');

  assert.ok(link, 'expected email contact to render as a clickable action');
  assert.strictEqual(link.href, 'mailto:person%40example.com');
  assert.strictEqual(link.textContent, 'Email');
})();

(function testDashboardContactPhoneRendersTelAction() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('', { contact: '(555) 123-4567' }), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');

  assert.ok(link, 'expected phone-like contact to render as a clickable action');
  assert.strictEqual(link.href, 'tel:5551234567');
  assert.strictEqual(link.textContent, 'Call');
})();

(function testDashboardContactMalformedStaysNonClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('', { contact: '555-abc-1212' }), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');
  const contactText = findFirstNode(card, (node) => node.tagName === 'p' && node.textContent.includes('Contact:'));

  assert.strictEqual(link, null, 'expected malformed contact to stay non-clickable');
  assert.ok(contactText, 'expected malformed contact to render as plain contact text');
})();

(function testDashboardBuildCardShowsUrgencyBadge() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(
    {
      ...testOpportunityItem(''),
      deadline: '2000-01-01',
    },
    doc
  );
  const urgency = findFirstNode(
    card,
    (node) => node.tagName === 'span' && node.className.includes('urgency-badge')
  );

  assert.ok(urgency, 'expected urgency badge to render in opportunity card');
  assert.strictEqual(urgency.textContent, 'Overdue');
})();

(function testDashboardNotesShortRendersPreviewWithoutExpandControl() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(
    {
      ...testOpportunityItem(''),
      notes: 'Short note for quick scan',
    },
    doc
  );

  const notesContent = findFirstNode(
    card,
    (node) => node.tagName === 'p' && node.className.includes('opportunity-card__notes-content')
  );
  const notesToggle = findFirstNode(
    card,
    (node) => node.tagName === 'button' && node.className.includes('opportunity-card__notes-toggle')
  );

  assert.ok(notesContent, 'expected notes content to render for short notes');
  assert.strictEqual(notesContent.textContent, 'Short note for quick scan');
  assert.strictEqual(notesToggle, null, 'expected no expand control for short notes');
})();

(function testDashboardNotesLongRendersExpandControl() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const longNotes = 'Long note '.repeat(20).trim();
  const card = buildCard(
    {
      ...testOpportunityItem(''),
      notes: longNotes,
    },
    doc
  );

  const notesContent = findFirstNode(
    card,
    (node) => node.tagName === 'p' && node.className.includes('opportunity-card__notes-content')
  );
  const notesToggle = findFirstNode(
    card,
    (node) => node.tagName === 'button' && node.className.includes('opportunity-card__notes-toggle')
  );

  assert.ok(notesContent, 'expected notes preview for long notes');
  assert.ok(notesToggle, 'expected expand control for long notes');
  assert.ok(notesContent.textContent.endsWith('…'), 'expected collapsed preview to end with ellipsis');
  assert.strictEqual(notesToggle.textContent, 'Show more');
})();

(function testDashboardNotesExpandCollapseTogglesRenderedContent() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const longNotes = 'Long note '.repeat(20).trim();
  const card = buildCard(
    {
      ...testOpportunityItem(''),
      notes: longNotes,
    },
    doc
  );

  const notesContent = findFirstNode(
    card,
    (node) => node.tagName === 'p' && node.className.includes('opportunity-card__notes-content')
  );
  const notesToggle = findFirstNode(
    card,
    (node) => node.tagName === 'button' && node.className.includes('opportunity-card__notes-toggle')
  );

  assert.ok(notesContent, 'expected notes content for expand/collapse test');
  assert.ok(notesToggle, 'expected toggle control for expand/collapse test');

  notesToggle.trigger('click');
  assert.strictEqual(notesContent.textContent, longNotes);
  assert.strictEqual(notesToggle.textContent, 'Show less');

  notesToggle.trigger('click');
  assert.ok(notesContent.textContent.endsWith('…'), 'expected collapsed text after second click');
  assert.strictEqual(notesToggle.textContent, 'Show more');
})();

(function testDashboardNotesEmptyRemainsClean() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(
    {
      ...testOpportunityItem(''),
      notes: '   ',
    },
    doc
  );

  const notesSection = findFirstNode(
    card,
    (node) => node.tagName === 'div' && node.className.includes('opportunity-card__notes')
  );

  assert.strictEqual(notesSection, null, 'expected no notes section for empty notes');
})();

(function testDashboardFirstRunEmptyStateGuidanceRenders() {
  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId: 'dev-user', email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: () => [],
    createOpportunityForUser: () => {
      throw new Error('createOpportunityForUser should not run before sample action click');
    },
    updateOpportunityForUser: () => {},
    archiveOpportunityForUser: () => {},
    deleteOpportunityForUser: () => {},
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  const emptyState = findFirstNode(
    nodes.list,
    (node) => node.tagName === 'section' && node.className.includes('empty-state')
  );
  const sampleButton = findFirstNode(
    nodes.list,
    (node) => node.tagName === 'button' && node.textContent === 'Load sample opportunities'
  );

  assert.ok(emptyState, 'expected first-run empty-state container');
  assert.ok(
    emptyState.textContent.includes('Start with one clear next step'),
    'expected first-run empty-state headline'
  );
  assert.ok(
    emptyState.textContent.includes('Add one opportunity you can act on this week.'),
    'expected practical onboarding suggestion'
  );
  assert.ok(sampleButton, 'expected sample-data action in first-run empty state');
  assert.strictEqual(nodes.onboardingChecklistSummary.textContent, 'No checklist steps completed yet. Start with one opportunity.');
  assert.strictEqual(nodes.onboardingChecklistList.children.length, 5, 'expected all checklist items to render');
  assert.ok(
    nodes.onboardingChecklistList.children.every((itemNode) => itemNode.dataset.completed === '0'),
    'expected first-run checklist to show pending states'
  );
})();

(function testDashboardSampleDataActionPopulatesAndRenders() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';
  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  const sampleButton = findFirstNode(
    nodes.list,
    (node) => node.tagName === 'button' && node.textContent === 'Load sample opportunities'
  );
  assert.ok(sampleButton, 'expected first-run sample-data action');

  sampleButton.trigger('click');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  assert.strictEqual(persisted.length, 4, 'expected four sample records after loading sample data');
  assert.ok(persisted.some((item) => item.archived), 'expected an archived sample record');
  assert.ok(persisted.some((item) => String(item.notes || '').trim()), 'expected notes in sample records');
  assert.ok(
    persisted.some((item) => String(item.contact || '').trim() || String(item.source_link || '').trim()),
    'expected contact/source fields in sample records'
  );

  assert.strictEqual(renderedCardIds(nodes.list).length, 3, 'expected active sample records in active view');
  assert.strictEqual(nodes.summary.textContent, 'Active: 3 | Archived: 1 | Showing: 3');
  assert.strictEqual(nodes.onboardingChecklistSummary.textContent, '5 of 5 checklist steps complete.');
  assert.ok(
    nodes.onboardingChecklistList.children.every((itemNode) => itemNode.dataset.completed === '1'),
    'expected sample data to satisfy checklist steps'
  );

  const renderedStatuses = Array.from(
    nodes.statusFilter.children
      .map((option) => option.value)
      .filter((value) => value && value !== 'all')
  );
  assert.ok(renderedStatuses.includes('new'), 'expected sample status option: new');
  assert.ok(renderedStatuses.includes('in progress'), 'expected sample status option: in progress');
  assert.ok(renderedStatuses.includes('waiting'), 'expected sample status option: waiting');
  assert.ok(renderedStatuses.includes('done'), 'expected sample status option: done');

  nodes.viewFilter.value = 'archived';
  nodes.viewFilter.trigger('change');
  assert.strictEqual(renderedCardIds(nodes.list).length, 1, 'expected archived sample item in archived view');
})();

(function testDashboardSampleDataActionUsesLocalDashboardPathsOnly() {
  const { win, doc, nodes } = makeDashboardHarness();
  const localItems = [];
  let createCalls = 0;
  let archiveCalls = 0;
  let signOutCalls = 0;
  let updateCalls = 0;
  let deleteCalls = 0;

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId: 'dev-user', email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {
      signOutCalls += 1;
    },
    listOpportunitiesForUser: (_sessionUserId, options = {}) => {
      const includeArchived = Boolean(options.includeArchived);
      return includeArchived ? Array.from(localItems) : localItems.filter((item) => !item.archived);
    },
    createOpportunityForUser: (_sessionUserId, payload) => {
      createCalls += 1;
      const created = {
        id: `sample-${createCalls}`,
        archived: false,
        ...payload,
      };
      localItems.push(created);
      return created;
    },
    updateOpportunityForUser: () => {
      updateCalls += 1;
    },
    archiveOpportunityForUser: (_sessionUserId, id) => {
      archiveCalls += 1;
      const item = localItems.find((entry) => entry.id === id);
      if (item) {
        item.archived = true;
      }
    },
    deleteOpportunityForUser: () => {
      deleteCalls += 1;
    },
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  const sampleButton = findFirstNode(
    nodes.list,
    (node) => node.tagName === 'button' && node.textContent === 'Load sample opportunities'
  );
  assert.ok(sampleButton, 'expected sample-data action button');

  sampleButton.trigger('click');

  assert.strictEqual(createCalls, 4, 'expected sample action to create records through existing local model path');
  assert.strictEqual(archiveCalls, 1, 'expected one sample record archived through existing local model path');
  assert.strictEqual(updateCalls, 0, 'expected no update path usage during sample action');
  assert.strictEqual(deleteCalls, 0, 'expected no delete path usage during sample action');
  assert.strictEqual(signOutCalls, 0, 'expected no auth/sign-out path usage during sample action');
})();

(function testNormalizeDashboardFiltersDefaultsAndValidation() {
  const { normalizeDashboardFilters } = loadDashboardModule({});

  assert.strictEqual(normalizeDashboardFilters().view, 'active');
  assert.strictEqual(normalizeDashboardFilters().status, 'all');
  assert.strictEqual(normalizeDashboardFilters().sort, 'deadline_nearest');

  const normalized = normalizeDashboardFilters({
    view: 'archived',
    status: 'applied',
    sort: 'title_az',
  });
  assert.strictEqual(normalized.view, 'archived');
  assert.strictEqual(normalized.status, 'applied');
  assert.strictEqual(normalized.sort, 'title_az');

  const fallback = normalizeDashboardFilters({
    view: 'invalid',
    status: '   ',
    sort: 'not-real',
  });
  assert.strictEqual(fallback.view, 'active');
  assert.strictEqual(fallback.status, 'all');
  assert.strictEqual(fallback.sort, 'deadline_nearest');
})();

(function testDeriveStatusOptionsDedupesAndSorts() {
  const { deriveStatusOptions } = loadDashboardModule({});

  const statuses = Array.from(
    deriveStatusOptions([
      { status: 'interviewing' },
      { status: 'new' },
      { status: 'applied' },
      { status: 'new' },
      { status: ' ' },
    ])
  );

  assert.deepStrictEqual(statuses, ['applied', 'interviewing', 'new']);
})();

(function testDeriveBulkStatusOptionsIncludeQuickValuesAndObservedStatuses() {
  const { deriveBulkStatusOptions } = loadDashboardModule({});

  const statuses = Array.from(
    deriveBulkStatusOptions([
      { status: 'interviewing' },
      { status: 'new' },
      { status: 'applied' },
      { status: 'done' },
      { status: ' ' },
    ])
  );

  assert.deepStrictEqual(statuses, ['new', 'in progress', 'waiting', 'done', 'applied', 'interviewing']);
})();

(function testBuildOpportunityExportPayloadShape() {
  const { buildOpportunityExportPayload } = loadDashboardModule({});

  const payload = buildOpportunityExportPayload([
    {
      id: 'opp-1',
      user_id: 'dev-user',
      title: 'First',
      type: 'housing',
      source_link: 'https://example.com/1',
      contact: 'person@example.com',
      deadline: '2026-05-02',
      status: 'new',
      tags: ['housing'],
      notes: 'note',
      archived: true,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-02T00:00:00.000Z',
    },
  ]);

  assert.ok(payload, 'expected export payload object');
  assert.ok(Array.isArray(payload.opportunities), 'expected opportunities array in export payload');
  assert.strictEqual(payload.opportunities.length, 1);
  assert.deepStrictEqual(Object.keys(payload.opportunities[0]).sort(), [
    'archived',
    'contact',
    'created_at',
    'deadline',
    'id',
    'notes',
    'source_link',
    'status',
    'tags',
    'title',
    'type',
    'updated_at',
  ]);
  assert.strictEqual(payload.opportunities[0].title, 'First');
})();

(function testParseOpportunityImportPayloadValid() {
  const { parseOpportunityImportPayload } = loadDashboardModule({});

  const parsed = parseOpportunityImportPayload(
    JSON.stringify({
      opportunities: [
        {
          id: 'import-1',
          title: 'Imported',
          status: 'waiting',
          tags: ['one', ' two '],
          archived: true,
        },
      ],
    })
  );

  assert.strictEqual(parsed.opportunities.length, 1);
  assert.strictEqual(parsed.opportunities[0].title, 'Imported');
  assert.strictEqual(parsed.opportunities[0].status, 'waiting');
  assert.deepStrictEqual(parsed.opportunities[0].tags, ['one', 'two']);
  assert.strictEqual(parsed.opportunities[0].archived, true);
})();

(function testParseOpportunityImportPayloadRejectsInvalidShape() {
  const { parseOpportunityImportPayload } = loadDashboardModule({});

  assert.throws(
    () => parseOpportunityImportPayload('{"notOpportunities": []}'),
    /Invalid payload shape/
  );
  assert.throws(() => parseOpportunityImportPayload('{invalid-json'), /Invalid JSON/);
  assert.throws(
    () =>
      parseOpportunityImportPayload(
        JSON.stringify({
          opportunities: [{ title: '   ' }],
        })
      ),
    /non-empty title/
  );
})();

(function testMergeImportedOpportunitiesForUserPopulatesOpportunities() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';
  const { mergeImportedOpportunitiesForUser } = loadDashboardModule({});

  const existing = model.createOpportunityForUser(userId, { id: 'dup-id', title: 'Existing record' }, { storage });
  assert.ok(existing.id, 'expected baseline existing record');

  const importedCount = mergeImportedOpportunitiesForUser(
    userId,
    [
      { id: 'dup-id', title: 'Imported duplicate id', status: 'new', archived: false },
      { id: 'archived-id', title: 'Imported archived', status: 'done', archived: true },
    ],
    {
      listOpportunitiesForUser: (sessionUserId, options = {}) =>
        model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
      createOpportunityForUser: (sessionUserId, seed) =>
        model.createOpportunityForUser(sessionUserId, seed, { storage }),
      archiveOpportunityForUser: (sessionUserId, opportunityId) =>
        model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    }
  );

  assert.strictEqual(importedCount, 2);
  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  assert.strictEqual(persisted.length, 3, 'expected merge behavior to append imported opportunities');
  assert.ok(persisted.some((item) => item.title === 'Imported duplicate id'), 'expected imported record');
  assert.ok(persisted.some((item) => item.title === 'Imported archived' && item.archived), 'expected archived import');
})();

(function testMergeImportedOpportunitiesForUserRollsBackOnFailure() {
  const records = [];
  const deleteCalls = [];
  let createCalls = 0;
  const { mergeImportedOpportunitiesForUser } = loadDashboardModule({});

  assert.throws(
    () =>
      mergeImportedOpportunitiesForUser(
        'dev-user',
        [
          { title: 'First import' },
          { title: 'Second import' },
        ],
        {
          listOpportunitiesForUser: () => Array.from(records),
          createOpportunityForUser: (_userId, seed) => {
            createCalls += 1;
            if (createCalls === 2) {
              throw new Error('create failed');
            }
            const created = { ...seed, id: `created-${createCalls}` };
            records.push(created);
            return created;
          },
          archiveOpportunityForUser: () => {},
          deleteOpportunityForUser: (_userId, opportunityId) => {
            deleteCalls.push(opportunityId);
            const index = records.findIndex((item) => item.id === opportunityId);
            if (index >= 0) {
              records.splice(index, 1);
            }
          },
        }
      ),
    /create failed/
  );

  assert.strictEqual(records.length, 0, 'expected rollback to remove partially imported records');
  assert.deepStrictEqual(deleteCalls, ['created-1']);
})();

(function testMergeImportedOpportunitiesForUserSurfacesRollbackFailure() {
  const records = [];
  const deleteCalls = [];
  let createCalls = 0;
  const { mergeImportedOpportunitiesForUser } = loadDashboardModule({});

  assert.throws(
    () =>
      mergeImportedOpportunitiesForUser(
        'dev-user',
        [
          { title: 'First import' },
          { title: 'Second import' },
        ],
        {
          listOpportunitiesForUser: () => Array.from(records),
          createOpportunityForUser: (_userId, seed) => {
            createCalls += 1;
            if (createCalls === 2) {
              throw new Error('create failed');
            }
            const created = { ...seed, id: `created-${createCalls}` };
            records.push(created);
            return created;
          },
          archiveOpportunityForUser: () => {},
          deleteOpportunityForUser: (_userId, opportunityId) => {
            deleteCalls.push(opportunityId);
            throw new Error('delete failed');
          },
        }
      ),
    /Import failed \(create failed\); rollback incomplete \(delete failed\)\./
  );

  assert.strictEqual(records.length, 1, 'expected partial import state when rollback delete fails');
  assert.deepStrictEqual(deleteCalls, ['created-1']);
})();

(function testDashboardExportJsonControlShowsFeedbackAndDownloads() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';
  model.createOpportunityForUser(userId, { title: 'Export me', status: 'new' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness();
  let capturedBlob = null;
  let revokedUrl = null;

  class FakeBlob {
    constructor(parts = [], options = {}) {
      this.parts = parts;
      this.options = options;
    }
  }

  win.URL = {
    createObjectURL(blob) {
      capturedBlob = blob;
      return 'blob:test-export';
    },
    revokeObjectURL(url) {
      revokedUrl = url;
    },
  };

  const { initializeDashboard } = loadDashboardModule({
    Blob: FakeBlob,
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  nodes.exportJsonButton.trigger('click');

  assert.ok(capturedBlob, 'expected export button to create a JSON blob payload');
  assert.strictEqual(revokedUrl, 'blob:test-export');
  const serialized = String(capturedBlob.parts[0] || '');
  const parsed = JSON.parse(serialized);
  assert.strictEqual(parsed.opportunities.length, 1);
  assert.strictEqual(nodes.transferFeedback.hidden, false);
  assert.strictEqual(nodes.transferFeedback.textContent, 'Exported 1 opportunities to JSON.');
  assert.strictEqual(nodes.transferFeedback.className, 'meta transfer-feedback');
})();

(function testDashboardImportControlOpensFilePickerAndResetsValue() {
  const { win, doc, nodes } = makeDashboardHarness();
  nodes.importJsonInput.value = 'stale-selection';
  let pickerOpenCount = 0;
  nodes.importJsonInput.click = () => {
    pickerOpenCount += 1;
  };

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId: 'dev-user', email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: () => [],
    createOpportunityForUser: () => {},
    updateOpportunityForUser: () => {},
    archiveOpportunityForUser: () => {},
    deleteOpportunityForUser: () => {},
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  nodes.importJsonButton.trigger('click');

  assert.strictEqual(nodes.importJsonInput.value, '', 'expected import click to clear stale file selection');
  assert.strictEqual(pickerOpenCount, 1, 'expected import click to open file picker');
})();

(function testDashboardFreePlanCreateSubmitBlockedAtLimit() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';
  Array.from({ length: 10 }, (_, index) =>
    model.createOpportunityForUser(userId, { title: `Seed ${index + 1}`, status: 'new' }, { storage })
  );

  const { win, doc, nodes } = makeDashboardHarness({
    withForm: true,
    formValues: {
      id: '',
      title: 'Blocked create attempt',
      type: 'general',
      source_link: '',
      contact: '',
      deadline: '',
      status: 'new',
      notes: '',
      tags: '',
    },
  });
  win.location.search = '?mockAuth=1';
  let createCalls = 0;

  const { initializeDashboard } = loadDashboardModule({
    FormData: class FakeFormData {
      constructor(form) {
        this.form = form;
      }
      get(key) {
        return this.form && this.form._formValues ? this.form._formValues[key] : '';
      }
    },
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) => {
      createCalls += 1;
      return model.createOpportunityForUser(sessionUserId, seed, { storage });
    },
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  nodes.form.trigger('submit');

  assert.strictEqual(createCalls, 0, 'expected create submit path to block at free-tier limit');
  assert.ok(
    nodes.subscriptionFeedback.textContent.includes('Free plan supports up to 10 active opportunities'),
    'expected free-tier limit feedback when create is blocked'
  );
})();

(function testDashboardFreePlanExportAndImportHandlersAreHardBlocked() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';
  model.createOpportunityForUser(userId, { title: 'Baseline', status: 'new' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness();
  win.location.search = '?mockAuth=1';
  let createObjectUrlCalls = 0;
  let pickerOpenCount = 0;
  win.URL = {
    createObjectURL() {
      createObjectUrlCalls += 1;
      return 'blob:should-not-be-used';
    },
    revokeObjectURL() {},
  };
  nodes.importJsonInput.click = () => {
    pickerOpenCount += 1;
  };

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  nodes.exportJsonButton.trigger('click');
  assert.strictEqual(createObjectUrlCalls, 0, 'expected free-plan export handler to hard-block blob generation');
  assert.strictEqual(nodes.transferFeedback.textContent, 'Import/export is available on paid plans.');
  assert.strictEqual(nodes.transferFeedback.className, 'meta transfer-feedback transfer-feedback--error');

  nodes.importJsonButton.trigger('click');
  assert.strictEqual(pickerOpenCount, 0, 'expected free-plan import handler to hard-block file picker open');
  assert.strictEqual(nodes.transferFeedback.textContent, 'Import/export is available on paid plans.');
  assert.strictEqual(nodes.transferFeedback.className, 'meta transfer-feedback transfer-feedback--error');
})();

pendingAsyncTests.push(
  (async function testDashboardImportSuccessFeedbackAndMergeViaUI() {
    const model = loadOpportunityModel();
    const storage = makeSessionStorage();
    const userId = 'dev-user';
    model.createOpportunityForUser(userId, { title: 'Existing', status: 'new' }, { storage });

    const { win, doc, nodes } = makeDashboardHarness();

    const { initializeDashboard } = loadDashboardModule({
      getMockSession: () => ({ userId, email: 'dev@example.com' }),
      isMockAuthEnabled: () => false,
      signOut: () => {},
      listOpportunitiesForUser: (sessionUserId, options = {}) =>
        model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
      createOpportunityForUser: (sessionUserId, seed) =>
        model.createOpportunityForUser(sessionUserId, seed, { storage }),
      updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
        model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
      archiveOpportunityForUser: (sessionUserId, opportunityId) =>
        model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
      deleteOpportunityForUser: (sessionUserId, opportunityId) =>
        model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
      window: win,
      document: doc,
    });

    initializeDashboard(win, doc);
    nodes.importJsonInput.files = [
      {
        text: () =>
          JSON.stringify({
            opportunities: [{ title: 'Imported through UI', status: 'waiting' }],
          }),
      },
    ];

    await nodes.importJsonInput.trigger('change');

    const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
    assert.strictEqual(persisted.length, 2, 'expected imported item merged with existing records');
    assert.strictEqual(nodes.transferFeedback.hidden, false);
    assert.strictEqual(nodes.transferFeedback.textContent, 'Imported 1 opportunities (merged with existing data).');
    assert.strictEqual(nodes.transferFeedback.className, 'meta transfer-feedback');
    assert.strictEqual(nodes.summary.textContent, 'Active: 2 | Archived: 0 | Showing: 2');
  })()
);

pendingAsyncTests.push(
  (async function testDashboardImportInvalidShowsErrorAndKeepsState() {
    const model = loadOpportunityModel();
    const storage = makeSessionStorage();
    const userId = 'dev-user';
    model.createOpportunityForUser(userId, { title: 'Baseline', status: 'new' }, { storage });

    const { win, doc, nodes } = makeDashboardHarness();

    const { initializeDashboard } = loadDashboardModule({
      getMockSession: () => ({ userId, email: 'dev@example.com' }),
      isMockAuthEnabled: () => false,
      signOut: () => {},
      listOpportunitiesForUser: (sessionUserId, options = {}) =>
        model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
      createOpportunityForUser: (sessionUserId, seed) =>
        model.createOpportunityForUser(sessionUserId, seed, { storage }),
      updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
        model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
      archiveOpportunityForUser: (sessionUserId, opportunityId) =>
        model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
      deleteOpportunityForUser: (sessionUserId, opportunityId) =>
        model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
      window: win,
      document: doc,
    });

    initializeDashboard(win, doc);
    nodes.importJsonInput.files = [{ text: () => '{invalid-json' }];

    await nodes.importJsonInput.trigger('change');

    const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
    assert.strictEqual(persisted.length, 1, 'expected invalid import to keep existing records unchanged');
    assert.strictEqual(nodes.transferFeedback.hidden, false);
    assert.strictEqual(nodes.transferFeedback.className, 'meta transfer-feedback transfer-feedback--error');
    assert.strictEqual(nodes.transferFeedback.textContent, 'Import failed: Invalid JSON.');
  })()
);

pendingAsyncTests.push(
  (async function testDashboardImportRollbackFailureShowsExplicitError() {
    const { win, doc, nodes } = makeDashboardHarness();
    const records = [];
    let createCalls = 0;

    const { initializeDashboard } = loadDashboardModule({
      getMockSession: () => ({ userId: 'dev-user', email: 'dev@example.com' }),
      isMockAuthEnabled: () => false,
      signOut: () => {},
      listOpportunitiesForUser: () => Array.from(records),
      createOpportunityForUser: (_sessionUserId, seed) => {
        createCalls += 1;
        if (createCalls === 2) {
          throw new Error('create failed');
        }
        const created = { ...seed, id: `created-${createCalls}` };
        records.push(created);
        return created;
      },
      updateOpportunityForUser: () => null,
      archiveOpportunityForUser: () => null,
      deleteOpportunityForUser: () => {
        throw new Error('delete failed');
      },
      window: win,
      document: doc,
    });

    initializeDashboard(win, doc);
    nodes.importJsonInput.files = [
      {
        text: () =>
          JSON.stringify({
            opportunities: [{ title: 'First import' }, { title: 'Second import' }],
          }),
      },
    ];

    await nodes.importJsonInput.trigger('change');

    assert.strictEqual(nodes.transferFeedback.hidden, false);
    assert.strictEqual(nodes.transferFeedback.className, 'meta transfer-feedback transfer-feedback--error');
    assert.strictEqual(
      nodes.transferFeedback.textContent,
      'Import failed with partial rollback: Import failed (create failed); rollback incomplete (delete failed).'
    );
  })()
);

(function testFilterOpportunityItemsByViewAndStatus() {
  const { filterOpportunityItems } = loadDashboardModule({});

  const items = [
    { id: '1', archived: false, status: 'new' },
    { id: '2', archived: false, status: 'applied' },
    { id: '3', archived: true, status: 'new' },
    { id: '4', archived: true, status: 'applied' },
  ];

  const activeOnly = Array.from(filterOpportunityItems(items, { view: 'active', status: 'all' }));
  assert.deepStrictEqual(
    activeOnly.map((item) => item.id),
    ['1', '2']
  );

  const archivedApplied = Array.from(filterOpportunityItems(items, { view: 'archived', status: 'applied' }));
  assert.deepStrictEqual(
    archivedApplied.map((item) => item.id),
    ['4']
  );
})();

(function testSortOpportunityItemsByNearestDeadline() {
  const { sortOpportunityItems } = loadDashboardModule({});

  const sorted = Array.from(
    sortOpportunityItems(
      [
        { id: 'd', deadline: '2026-05-01' },
        { id: 'a', deadline: '2026-04-02' },
        { id: 'c', deadline: '' },
        { id: 'b', deadline: '2026-04-01' },
      ],
      'deadline_nearest'
    )
  );

  assert.deepStrictEqual(
    sorted.map((item) => item.id),
    ['b', 'a', 'd', 'c']
  );
})();

(function testSortOpportunityItemsByRecentlyUpdated() {
  const { sortOpportunityItems } = loadDashboardModule({});

  const sorted = Array.from(
    sortOpportunityItems(
      [
        { id: 'oldest', updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'latest', updated_at: '2026-04-01T00:00:00.000Z' },
        { id: 'middle', updated_at: '2026-02-15T00:00:00.000Z' },
      ],
      'updated_recent'
    )
  );

  assert.deepStrictEqual(
    sorted.map((item) => item.id),
    ['latest', 'middle', 'oldest']
  );
})();

(function testSortOpportunityItemsByTitleAZ() {
  const { sortOpportunityItems } = loadDashboardModule({});

  const sorted = Array.from(
    sortOpportunityItems(
      [
        { id: 'zeta', title: 'Zeta' },
        { id: 'beta', title: 'beta' },
        { id: 'alpha', title: 'Alpha' },
      ],
      'title_az'
    )
  );

  assert.deepStrictEqual(
    sorted.map((item) => item.id),
    ['alpha', 'beta', 'zeta']
  );
})();

(function testClassifyDeadlineUrgencyOverdue() {
  const { classifyDeadlineUrgency } = loadDashboardModule({});

  const urgency = classifyDeadlineUrgency('2026-04-09', Date.parse('2026-04-10T12:00:00.000Z'));
  assert.strictEqual(urgency, 'overdue');
})();

(function testClassifyDeadlineUrgencyDueSoon() {
  const { classifyDeadlineUrgency } = loadDashboardModule({});

  const urgency = classifyDeadlineUrgency('2026-04-17', Date.parse('2026-04-10T12:00:00.000Z'));
  assert.strictEqual(urgency, 'due_soon');
})();

(function testClassifyDeadlineUrgencyNoDeadline() {
  const { classifyDeadlineUrgency } = loadDashboardModule({});

  const urgency = classifyDeadlineUrgency('', Date.parse('2026-04-10T12:00:00.000Z'));
  assert.strictEqual(urgency, 'no_deadline');
})();

(function testClassifyDeadlineUrgencyInvalidIsConservative() {
  const { classifyDeadlineUrgency } = loadDashboardModule({});

  const urgency = classifyDeadlineUrgency('not-a-date', Date.parse('2026-04-10T12:00:00.000Z'));
  assert.strictEqual(urgency, 'no_deadline');
})();

(function testBuildNextBestActionsIncludesOverdueAndDueSoon() {
  const { buildNextBestActions } = loadDashboardModule({});

  const suggestions = buildNextBestActions(
    [
      { id: 'overdue', title: 'Overdue item', status: 'in progress', deadline: '2026-04-08', archived: false },
      { id: 'soon', title: 'Due soon item', status: 'in progress', deadline: '2026-04-14', archived: false },
      { id: 'later', title: 'Later item', status: 'in progress', deadline: '2026-05-01', archived: false },
    ],
    Date.parse('2026-04-10T12:00:00.000Z')
  );

  assert.deepStrictEqual(
    suggestions.map((item) => item.id),
    ['overdue', 'soon']
  );
  assert.strictEqual(suggestions[0].reasonKey, 'overdue');
  assert.strictEqual(suggestions[1].reasonKey, 'due_soon');
})();

(function testBuildNextBestActionsExcludesNonMatchingItemsWhenTopPrioritySlotsFilled() {
  const { buildNextBestActions } = loadDashboardModule({});

  const suggestions = buildNextBestActions(
    [
      { id: 'overdue-a', title: 'Overdue A', status: 'in progress', deadline: '2026-04-07', archived: false },
      { id: 'overdue-b', title: 'Overdue B', status: 'new', deadline: '2026-04-08', archived: false },
      { id: 'soon-a', title: 'Soon A', status: 'in progress', deadline: '2026-04-12', archived: false },
      { id: 'new-only', title: 'New only', status: 'new', deadline: '', archived: false },
      { id: 'waiting', title: 'Waiting', status: 'waiting', deadline: '', archived: false },
      { id: 'done', title: 'Done', status: 'done', deadline: '2026-04-09', archived: false },
      { id: 'archived', title: 'Archived', status: 'in progress', deadline: '2026-04-09', archived: true },
    ],
    Date.parse('2026-04-10T12:00:00.000Z')
  );

  assert.deepStrictEqual(
    suggestions.map((item) => item.id),
    ['overdue-a', 'overdue-b', 'soon-a']
  );
})();

(function testBuildNextBestActionsDeterministicOrdering() {
  const { buildNextBestActions } = loadDashboardModule({});

  const items = [
    { id: 'b-id', title: 'Beta', status: 'new', deadline: '', archived: false },
    { id: 'a-id', title: 'Alpha', status: 'new', deadline: '', archived: false },
    { id: 'c-id', title: 'Gamma', status: 'new', deadline: '', archived: false },
  ];
  const now = Date.parse('2026-04-10T12:00:00.000Z');

  const first = buildNextBestActions(items, now);
  const second = buildNextBestActions(items, now);

  assert.deepStrictEqual(
    first.map((item) => item.id),
    ['a-id', 'b-id', 'c-id']
  );
  assert.deepStrictEqual(
    second.map((item) => item.id),
    ['a-id', 'b-id', 'c-id']
  );
})();

(function testBuildDashboardChecklistCompletionFromData() {
  const { buildDashboardChecklist } = loadDashboardModule({});

  const checklist = buildDashboardChecklist(
    [
      {
        id: 'opp-1',
        title: 'First',
        archived: false,
        status: 'in progress',
        deadline: '2026-04-20',
        notes: 'Follow up with contact tomorrow',
        contact: 'person@example.com',
      },
    ],
    Date.parse('2026-04-18T12:00:00.000Z')
  );

  assert.strictEqual(checklist.totalCount, 5);
  assert.strictEqual(checklist.completedCount, 5);
  assert.ok(checklist.checklistItems.every((item) => item.completed), 'expected all checklist steps complete');
})();

(function testBuildDashboardChecklistIncompleteStateIsCalm() {
  const { buildDashboardChecklist } = loadDashboardModule({});

  const checklist = buildDashboardChecklist([]);
  assert.strictEqual(checklist.totalCount, 5);
  assert.strictEqual(checklist.completedCount, 0);
  assert.ok(
    checklist.checklistItems.every((item) => !item.completed),
    'expected each checklist step to remain pending when no data exists'
  );
})();

(function testBuildDashboardChecklistDeterministic() {
  const { buildDashboardChecklist } = loadDashboardModule({});

  const items = [
    {
      id: 'one',
      title: 'One',
      archived: false,
      status: 'waiting',
      deadline: '2026-04-20',
      notes: '',
      contact: '',
    },
    {
      id: 'two',
      title: 'Two',
      archived: true,
      status: 'new',
      deadline: '',
      notes: 'Archived note',
      contact: '',
    },
  ];

  const first = buildDashboardChecklist(items, Date.parse('2026-04-10T12:00:00.000Z'));
  const second = buildDashboardChecklist(items, Date.parse('2026-04-10T12:00:00.000Z'));

  assert.strictEqual(JSON.stringify(first), JSON.stringify(second));
})();

(function testDashboardNextBestActionsFallbackIsCalm() {
  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId: 'dev-user', email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: () => [
      { id: 'done-1', title: 'Completed', status: 'done', deadline: '2026-04-09', archived: false },
      { id: 'archived-1', title: 'Archived', status: 'new', deadline: '2026-04-08', archived: true },
    ],
    createOpportunityForUser: () => {},
    updateOpportunityForUser: () => {},
    archiveOpportunityForUser: () => {},
    deleteOpportunityForUser: () => {},
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  assert.strictEqual(nodes.nextBestActionList.children.length, 1, 'expected fallback list item');
  assert.ok(
    nodes.nextBestActionList.textContent.includes('No urgent follow-up needed right now.'),
    'expected calm fallback message in next best actions panel'
  );
})();

(function testDashboardFiltersRestoreRenderAndPersistOnChange() {
  const items = [
    {
      id: 'active-applied-zulu',
      title: 'Zulu applied',
      type: 'general',
      source_link: '',
      contact: '',
      deadline: '',
      status: 'applied',
      tags: [],
      notes: '',
      archived: false,
    },
    {
      id: 'active-applied-alpha',
      title: 'Alpha applied',
      type: 'general',
      source_link: '',
      contact: '',
      deadline: '',
      status: 'applied',
      tags: [],
      notes: '',
      archived: false,
    },
    {
      id: 'active-new',
      title: 'Active new',
      type: 'general',
      source_link: '',
      contact: '',
      deadline: '',
      status: 'new',
      tags: [],
      notes: '',
      archived: false,
    },
    {
      id: 'archived-interviewing',
      title: 'Archived interviewing',
      type: 'general',
      source_link: '',
      contact: '',
      deadline: '',
      status: 'interviewing',
      tags: [],
      notes: '',
      archived: true,
    },
  ];

  const { win, doc, nodes, storage } = makeDashboardHarness({
    storedFilters: { view: 'active', status: 'applied', sort: 'title_az' },
  });

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId: 'dev-user', email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: () => items,
    createOpportunityForUser: () => {
      throw new Error('createOpportunityForUser should not run in filter render test');
    },
    updateOpportunityForUser: () => {
      throw new Error('updateOpportunityForUser should not run in filter render test');
    },
    archiveOpportunityForUser: () => {
      throw new Error('archiveOpportunityForUser should not run in filter render test');
    },
    deleteOpportunityForUser: () => {
      throw new Error('deleteOpportunityForUser should not run in filter render test');
    },
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  assert.strictEqual(nodes.viewFilter.value, 'active');
  assert.strictEqual(nodes.statusFilter.value, 'applied');
  assert.strictEqual(nodes.sortFilter.value, 'title_az');
  assert.deepStrictEqual(renderedCardIds(nodes.list), ['active-applied-alpha', 'active-applied-zulu']);
  assert.strictEqual(nodes.summary.textContent, 'Active: 3 | Archived: 1 | Showing: 2');

  nodes.sortFilter.value = 'updated_recent';
  nodes.sortFilter.trigger('change');
  assert.deepStrictEqual(renderedCardIds(nodes.list), ['active-applied-zulu', 'active-applied-alpha']);
  assert.strictEqual(nodes.summary.textContent, 'Active: 3 | Archived: 1 | Showing: 2');

  const lastWrite = storage._setCalls[storage._setCalls.length - 1];
  assert.strictEqual(lastWrite.key, 'opportunityOsDashboardFilters');
  assert.deepStrictEqual(JSON.parse(lastWrite.value), { view: 'active', status: 'applied', sort: 'updated_recent' });
})();

(function testDashboardInvalidPersistedStatusFallsBackToAll() {
  const items = [
    {
      id: 'active-applied',
      title: 'Active applied',
      type: 'general',
      source_link: '',
      contact: '',
      deadline: '',
      status: 'applied',
      tags: [],
      notes: '',
      archived: false,
    },
    {
      id: 'active-new',
      title: 'Active new',
      type: 'general',
      source_link: '',
      contact: '',
      deadline: '',
      status: 'new',
      tags: [],
      notes: '',
      archived: false,
    },
  ];

  const { win, doc, nodes, storage } = makeDashboardHarness({
    storedFilters: { view: 'active', status: 'not-present' },
  });

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId: 'dev-user', email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: () => items,
    createOpportunityForUser: () => {},
    updateOpportunityForUser: () => {},
    archiveOpportunityForUser: () => {},
    deleteOpportunityForUser: () => {},
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  assert.strictEqual(nodes.statusFilter.value, 'all');
  assert.deepStrictEqual(renderedCardIds(nodes.list), ['active-applied', 'active-new']);
  assert.strictEqual(nodes.summary.textContent, 'Active: 2 | Archived: 0 | Showing: 2');
  assert.ok(
    storage._setCalls.some((entry) => {
      if (entry.key !== 'opportunityOsDashboardFilters') {
        return false;
      }
      const parsed = JSON.parse(entry.value);
      return parsed.view === 'active' && parsed.status === 'all' && parsed.sort === 'deadline_nearest';
    }),
    'expected invalid persisted status to be rewritten as all'
  );
})();

(function testDashboardQuickStatusChangeUpdatesItemAndPersists() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';
  const created = model.createOpportunityForUser(
    userId,
    {
      title: 'Quick status target',
      status: 'new',
      contact: 'person@example.com',
    },
    { storage }
  );

  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  clickCardAction(nodes.list, created.id, 'quick_status', 'done');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage }).find((item) => item.id === created.id);
  assert.ok(persisted, 'expected updated opportunity to remain persisted');
  assert.strictEqual(persisted.status, 'done');

  const rendered = findRenderedCard(nodes.list, created.id);
  const statusNode = findFirstNode(
    rendered,
    (node) => node.tagName === 'span' && String(node.className || '').includes('opportunity-card__status')
  );
  assert.ok(statusNode, 'expected rendered status node');
  assert.strictEqual(statusNode.textContent, 'done');
})();

(function testDashboardQuickStatusChangeKeepsFilteredSortedViewCoherent() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const zulu = model.createOpportunityForUser(userId, { title: 'Zulu', status: 'in progress' }, { storage });
  const alpha = model.createOpportunityForUser(userId, { title: 'Alpha', status: 'in progress' }, { storage });
  model.createOpportunityForUser(userId, { title: 'Beta', status: 'new' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness({
    storedFilters: { view: 'active', status: 'in progress', sort: 'title_az' },
  });

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  assert.deepStrictEqual(renderedCardIds(nodes.list), [alpha.id, zulu.id]);
  clickCardAction(nodes.list, zulu.id, 'quick_status', 'done');

  assert.strictEqual(nodes.statusFilter.value, 'in progress');
  assert.deepStrictEqual(renderedCardIds(nodes.list), [alpha.id]);
  assert.strictEqual(nodes.summary.textContent, 'Active: 3 | Archived: 0 | Showing: 1');
})();

(function testDashboardBehaviorStillWorksAfterMergedImport() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';
  const { mergeImportedOpportunitiesForUser } = loadDashboardModule({});

  mergeImportedOpportunitiesForUser(
    userId,
    [
      { title: 'Imported one', status: 'new', archived: false },
      { title: 'Imported two', status: 'new', archived: false },
    ],
    {
      listOpportunitiesForUser: (sessionUserId, options = {}) =>
        model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
      createOpportunityForUser: (sessionUserId, seed) =>
        model.createOpportunityForUser(sessionUserId, seed, { storage }),
      archiveOpportunityForUser: (sessionUserId, opportunityId) =>
        model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    }
  );

  const imported = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  const targetId = imported[0].id;
  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  clickCardAction(nodes.list, targetId, 'quick_status', 'done');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  assert.strictEqual(
    persisted.find((item) => item.id === targetId).status,
    'done',
    'expected existing dashboard actions to work on imported records'
  );
})();

(function testDashboardBulkSelectionShowsSelectedCount() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const first = model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });
  const second = model.createOpportunityForUser(userId, { title: 'Second', status: 'new' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  assert.strictEqual(nodes.bulkActions.hidden, true, 'expected bulk controls hidden before selection');

  toggleCardSelection(nodes.list, first.id, true);
  toggleCardSelection(nodes.list, second.id, true);

  assert.strictEqual(nodes.bulkActions.hidden, false, 'expected bulk controls shown when items are selected');
  assert.strictEqual(nodes.selectedSummary.textContent, '2 selected');
})();

(function testDashboardBulkStatusOptionsIncludeQuickValuesAndObservedStatuses() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  model.createOpportunityForUser(userId, { title: 'Applied', status: 'applied' }, { storage });
  model.createOpportunityForUser(userId, { title: 'Interviewing', status: 'interviewing' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  const bulkStatuses = nodes.bulkStatusSelect.children
    .map((option) => option.value)
    .filter((value) => value);

  assert.deepStrictEqual(
    bulkStatuses,
    ['new', 'in progress', 'waiting', 'done', 'applied', 'interviewing']
  );
})();

(function testDashboardBulkArchiveUpdatesSelectedItemsAndClearsSelection() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const first = model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });
  const second = model.createOpportunityForUser(userId, { title: 'Second', status: 'waiting' }, { storage });
  const third = model.createOpportunityForUser(userId, { title: 'Third', status: 'done' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  toggleCardSelection(nodes.list, first.id, true);
  toggleCardSelection(nodes.list, second.id, true);
  nodes.bulkArchiveButton.trigger('click');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  const archivedIds = persisted.filter((item) => item.archived).map((item) => item.id);
  assert.ok(archivedIds.includes(first.id), 'expected first selected item archived');
  assert.ok(archivedIds.includes(second.id), 'expected second selected item archived');
  assert.ok(!archivedIds.includes(third.id), 'expected unselected item to stay active');
  assert.strictEqual(nodes.bulkActions.hidden, true, 'expected selection controls hidden after bulk archive');
  assert.strictEqual(nodes.summary.textContent, 'Active: 1 | Archived: 2 | Showing: 1');
})();

(function testDashboardBulkStatusUpdatesSelectedItemsAndClearsSelection() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const first = model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });
  const second = model.createOpportunityForUser(userId, { title: 'Second', status: 'new' }, { storage });
  model.createOpportunityForUser(userId, { title: 'Third', status: 'waiting' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness();

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  toggleCardSelection(nodes.list, first.id, true);
  toggleCardSelection(nodes.list, second.id, true);
  nodes.bulkStatusSelect.value = 'done';
  nodes.bulkStatusApplyButton.trigger('click');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  assert.strictEqual(
    persisted.find((item) => item.id === first.id).status,
    'done',
    'expected first selected item status updated'
  );
  assert.strictEqual(
    persisted.find((item) => item.id === second.id).status,
    'done',
    'expected second selected item status updated'
  );
  assert.strictEqual(nodes.bulkActions.hidden, true, 'expected selection controls hidden after bulk status apply');
  assert.strictEqual(nodes.bulkStatusSelect.value, '', 'expected bulk status chooser reset after apply');
})();

(function testDashboardArchivedViewBulkArchiveDisabledAndNoOp() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const archivedOne = model.createOpportunityForUser(userId, { title: 'Archived one', status: 'new' }, { storage });
  model.archiveOpportunityForUser(userId, archivedOne.id, { storage });
  const archivedTwo = model.createOpportunityForUser(userId, { title: 'Archived two', status: 'waiting' }, { storage });
  model.archiveOpportunityForUser(userId, archivedTwo.id, { storage });

  let archiveCalls = 0;
  const { win, doc, nodes } = makeDashboardHarness({
    storedFilters: { view: 'archived', status: 'all', sort: 'deadline_nearest' },
  });

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) => {
      archiveCalls += 1;
      return model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage });
    },
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  toggleCardSelection(nodes.list, archivedOne.id, true);
  assert.strictEqual(nodes.bulkArchiveButton.disabled, true, 'expected bulk archive disabled in archived view');

  nodes.bulkArchiveButton.trigger('click');
  assert.strictEqual(archiveCalls, 0, 'expected archived-view bulk archive click to be a no-op');
})();

(function testDashboardArchivedViewBulkStatusIsAllowed() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const archivedOne = model.createOpportunityForUser(userId, { title: 'Archived one', status: 'new' }, { storage });
  model.archiveOpportunityForUser(userId, archivedOne.id, { storage });
  const archivedTwo = model.createOpportunityForUser(userId, { title: 'Archived two', status: 'waiting' }, { storage });
  model.archiveOpportunityForUser(userId, archivedTwo.id, { storage });

  const { win, doc, nodes } = makeDashboardHarness({
    storedFilters: { view: 'archived', status: 'all', sort: 'deadline_nearest' },
  });

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  toggleCardSelection(nodes.list, archivedOne.id, true);
  nodes.bulkStatusSelect.value = 'done';
  nodes.bulkStatusApplyButton.trigger('click');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  assert.strictEqual(
    persisted.find((item) => item.id === archivedOne.id).status,
    'done',
    'expected archived-view bulk status to update selected item'
  );
  assert.strictEqual(nodes.bulkActions.hidden, true, 'expected selection cleared after archived-view bulk status apply');
  assert.strictEqual(nodes.bulkArchiveButton.disabled, true, 'expected bulk archive to remain disabled in archived view');
})();

(function testDashboardBulkActionsKeepFilteredSortedViewCoherent() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const alpha = model.createOpportunityForUser(userId, { title: 'Alpha', status: 'in progress' }, { storage });
  const zulu = model.createOpportunityForUser(userId, { title: 'Zulu', status: 'in progress' }, { storage });
  model.createOpportunityForUser(userId, { title: 'Beta', status: 'new' }, { storage });

  const { win, doc, nodes } = makeDashboardHarness({
    storedFilters: { view: 'active', status: 'in progress', sort: 'title_az' },
  });

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  assert.deepStrictEqual(renderedCardIds(nodes.list), [alpha.id, zulu.id]);

  toggleCardSelection(nodes.list, zulu.id, true);
  nodes.bulkStatusSelect.value = 'done';
  nodes.bulkStatusApplyButton.trigger('click');

  assert.strictEqual(nodes.statusFilter.value, 'in progress');
  assert.deepStrictEqual(renderedCardIds(nodes.list), [alpha.id]);
  assert.strictEqual(nodes.summary.textContent, 'Active: 3 | Archived: 0 | Showing: 1');
})();

(function testResolveLocalSubscriptionStateFromQuery() {
  const { resolveLocalSubscriptionState } = loadDashboardModule({});
  const freeState = resolveLocalSubscriptionState({ location: { search: '?mockAuth=1' } });
  const paidState = resolveLocalSubscriptionState({ location: { search: '?mockAuth=1&mockPlan=paid' } });
  const paidWithoutMockAuthState = resolveLocalSubscriptionState({ location: { search: '?mockPlan=paid' } });
  const unknownState = resolveLocalSubscriptionState({ location: { search: '?mockPlan=enterprise' } });

  assert.strictEqual(freeState.plan, 'free');
  assert.strictEqual(freeState.isPaid, false);
  assert.strictEqual(paidState.plan, 'paid');
  assert.strictEqual(paidState.isPaid, true);
  assert.strictEqual(paidWithoutMockAuthState.plan, 'free');
  assert.strictEqual(paidWithoutMockAuthState.isPaid, false);
  assert.strictEqual(unknownState.plan, 'free');
})();

(function testBuildSubscriptionBoundaryStateFreeTierCreateBoundaries() {
  const { buildSubscriptionBoundaryState } = loadDashboardModule({});
  const nineActive = Array.from({ length: 9 }, (_, index) => ({
    id: `active-nine-${index + 1}`,
    archived: false,
  }));
  const tenActive = Array.from({ length: 10 }, (_, index) => ({
    id: `active-ten-${index + 1}`,
    archived: false,
  }));
  const nineAfterArchive = tenActive.map((item, index) => (index === 0 ? { ...item, archived: true } : item));

  const atNine = buildSubscriptionBoundaryState(nineActive, {
    plan: 'free',
    isPaid: false,
    freeOpportunityLimit: 10,
  });
  const atTen = buildSubscriptionBoundaryState(tenActive, {
    plan: 'free',
    isPaid: false,
    freeOpportunityLimit: 10,
  });
  const afterArchive = buildSubscriptionBoundaryState(nineAfterArchive, {
    plan: 'free',
    isPaid: false,
    freeOpportunityLimit: 10,
  });
  const afterDelete = buildSubscriptionBoundaryState(tenActive.slice(1), {
    plan: 'free',
    isPaid: false,
    freeOpportunityLimit: 10,
  });

  assert.strictEqual(atNine.canCreateOpportunity, true);
  assert.strictEqual(atTen.canCreateOpportunity, false);
  assert.strictEqual(afterArchive.canCreateOpportunity, true);
  assert.strictEqual(afterDelete.canCreateOpportunity, true);
})();

(function testBuildSubscriptionBoundaryStateFreeLimit() {
  const { buildSubscriptionBoundaryState } = loadDashboardModule({});
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `active-${index + 1}`,
    archived: false,
  }));
  items.push({ id: 'archived-1', archived: true });

  const boundary = buildSubscriptionBoundaryState(items, {
    plan: 'free',
    isPaid: false,
    freeOpportunityLimit: 10,
  });

  assert.strictEqual(boundary.activeOpportunityCount, 10);
  assert.strictEqual(boundary.remainingFreeSlots, 0);
  assert.strictEqual(boundary.canCreateOpportunity, false);
  assert.strictEqual(boundary.isNextBestActionsLocked, true);
})();

(function testDashboardFreePlanLocksPaidSurfaces() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const created = model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });
  const { win, doc, nodes } = makeDashboardHarness();
  win.location.search = '?mockAuth=1';

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  assert.strictEqual(nodes.nextBestActionSummary.textContent, 'Locked on free plan.');
  assert.strictEqual(nodes.nextBestActionLockMessage.hidden, false);
  assert.strictEqual(nodes.exportJsonButton.disabled, true);
  assert.strictEqual(nodes.importJsonButton.disabled, true);
  assert.strictEqual(nodes.upgradeCtaButton.disabled, false);
  assert.ok(nodes.subscriptionSummary.textContent.includes('Free plan'));
  assert.ok(
    nodes.subscriptionFeatureList.children.some(
      (node) => node.textContent.includes('Price:')
    ),
    'expected monthly price row in subscription features'
  );
  assert.ok(
    nodes.subscriptionFeatureList.children.some(
      (node) => node.textContent.includes('Founder Lifetime') && node.textContent.includes('first 50 founders')
    ),
    'expected founder lifetime row in subscription features'
  );
  const renderedCard = findRenderedCard(nodes.list, created.id);
  const selectionInput = findFirstNode(
    renderedCard,
    (node) => node && node.tagName === 'input' && node.dataset && node.dataset.bulkSelect
  );
  assert.strictEqual(selectionInput, null, 'expected free plan cards to hide bulk selection checkboxes');
})();

(function testDashboardFreePlanBlocksBulkArchiveHandlerMutationAndShowsLockFeedback() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const first = model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });
  const second = model.createOpportunityForUser(userId, { title: 'Second', status: 'waiting' }, { storage });
  const { win, doc, nodes } = makeDashboardHarness();
  win.location.search = '?mockAuth=1';

  let archiveCalls = 0;
  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) => {
      archiveCalls += 1;
      return model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage });
    },
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  nodes.bulkArchiveButton.trigger('click');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  assert.strictEqual(archiveCalls, 0, 'expected free-plan bulk archive handler to short-circuit before mutation');
  assert.strictEqual(
    persisted.find((item) => item.id === first.id).archived,
    false,
    'expected first item to remain active when free-plan bulk archive is clicked'
  );
  assert.strictEqual(
    persisted.find((item) => item.id === second.id).archived,
    false,
    'expected second item to remain active when free-plan bulk archive is clicked'
  );
  assert.strictEqual(nodes.subscriptionFeedback.hidden, false, 'expected lock feedback to be shown for free-plan bulk archive');
  assert.strictEqual(nodes.subscriptionFeedback.textContent, 'Bulk actions are available on paid plans.');
})();

(function testDashboardFreePlanBlocksBulkStatusHandlerMutationAndShowsLockFeedback() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const first = model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });
  const second = model.createOpportunityForUser(userId, { title: 'Second', status: 'waiting' }, { storage });
  const { win, doc, nodes } = makeDashboardHarness();
  win.location.search = '?mockAuth=1';

  let statusUpdateCalls = 0;
  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) => {
      statusUpdateCalls += 1;
      return model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage });
    },
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);
  nodes.bulkStatusSelect.value = 'done';
  nodes.bulkStatusApplyButton.trigger('click');

  const persisted = model.listOpportunitiesForUser(userId, { includeArchived: true, storage });
  assert.strictEqual(statusUpdateCalls, 0, 'expected free-plan bulk status handler to short-circuit before mutation');
  assert.strictEqual(
    persisted.find((item) => item.id === first.id).status,
    'new',
    'expected first item status to remain unchanged when free-plan bulk status is applied'
  );
  assert.strictEqual(
    persisted.find((item) => item.id === second.id).status,
    'waiting',
    'expected second item status to remain unchanged when free-plan bulk status is applied'
  );
  assert.strictEqual(nodes.subscriptionFeedback.hidden, false, 'expected lock feedback to be shown for free-plan bulk status');
  assert.strictEqual(nodes.subscriptionFeedback.textContent, 'Bulk actions are available on paid plans.');
})();

(function testDashboardPaidPlanUnlocksPaidSurfaces() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });
  const { win, doc, nodes } = makeDashboardHarness();
  win.location.search = '?mockAuth=1&mockPlan=paid';

  const { initializeDashboard } = loadDashboardModule({
    getMockSession: () => ({ userId, email: 'dev@example.com' }),
    isMockAuthEnabled: () => false,
    signOut: () => {},
    listOpportunitiesForUser: (sessionUserId, options = {}) =>
      model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
    createOpportunityForUser: (sessionUserId, seed) =>
      model.createOpportunityForUser(sessionUserId, seed, { storage }),
    updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
      model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
    archiveOpportunityForUser: (sessionUserId, opportunityId) =>
      model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
    deleteOpportunityForUser: (sessionUserId, opportunityId) =>
      model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
    window: win,
    document: doc,
  });

  initializeDashboard(win, doc);

  assert.notStrictEqual(nodes.nextBestActionSummary.textContent, 'Locked on free plan.');
  assert.strictEqual(nodes.nextBestActionLockMessage.hidden, true);
  assert.strictEqual(nodes.exportJsonButton.disabled, false);
  assert.strictEqual(nodes.importJsonButton.disabled, false);
  assert.strictEqual(nodes.upgradeCtaButton.disabled, true);
  assert.ok(nodes.subscriptionSummary.textContent.includes('Paid plan active'));
})();

pendingAsyncTests.push(
  (async function testDashboardServerUnknownEntitlementFailsClosedToFree() {
    const model = loadOpportunityModel();
    const storage = makeSessionStorage();
    const userId = 'dev-user';
    model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });

    const { win, doc, nodes } = makeDashboardHarness();
    win.location.search = '?mockAuth=1';
    win.fetch = async (requestPath) => {
      if (requestPath === '/api/entitlements') {
        return {
          ok: true,
          async json() {
            return { entitlementState: 'unknown' };
          },
        };
      }
      throw new Error(`unexpected fetch path: ${requestPath}`);
    };

    const { initializeDashboard } = loadDashboardModule({
      getMockSession: () => ({ userId, email: 'dev@example.com' }),
      isMockAuthEnabled: () => false,
      signOut: () => {},
      listOpportunitiesForUser: (sessionUserId, options = {}) =>
        model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
      createOpportunityForUser: (sessionUserId, seed) =>
        model.createOpportunityForUser(sessionUserId, seed, { storage }),
      updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
        model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
      archiveOpportunityForUser: (sessionUserId, opportunityId) =>
        model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
      deleteOpportunityForUser: (sessionUserId, opportunityId) =>
        model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
      window: win,
      document: doc,
    });

    initializeDashboard(win, doc);
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(nodes.exportJsonButton.disabled, true);
    assert.strictEqual(nodes.importJsonButton.disabled, true);
    assert.strictEqual(nodes.nextBestActionSummary.textContent, 'Locked on free plan.');
    assert.ok(nodes.subscriptionSummary.textContent.includes('Free plan'));
  })()
);

pendingAsyncTests.push(
  (async function testDashboardUpgradeStartsMonthlyCheckoutSession() {
    const model = loadOpportunityModel();
    const storage = makeSessionStorage();
    const userId = 'dev-user';
    model.createOpportunityForUser(userId, { title: 'First', status: 'new' }, { storage });

    const { win, doc, nodes } = makeDashboardHarness();
    win.location.search = '?mockAuth=1';
    let redirectedTo = null;
    win.location.assign = (target) => {
      redirectedTo = target;
    };
    const fetchCalls = [];
    win.fetch = async (requestPath, options = {}) => {
      fetchCalls.push({ requestPath, options });
      if (requestPath === '/api/entitlements') {
        return {
          ok: true,
          async json() {
            return { entitlementState: 'free' };
          },
        };
      }
      if (requestPath === '/api/billing/checkout-session') {
        return {
          ok: true,
          async json() {
            return { checkoutUrl: 'https://checkout.stripe.test/session/cs_live_path' };
          },
        };
      }
      throw new Error(`unexpected fetch path: ${requestPath}`);
    };

    const { initializeDashboard } = loadDashboardModule({
      getMockSession: () => ({ userId, email: 'dev@example.com' }),
      isMockAuthEnabled: () => false,
      signOut: () => {},
      listOpportunitiesForUser: (sessionUserId, options = {}) =>
        model.listOpportunitiesForUser(sessionUserId, { ...options, storage }),
      createOpportunityForUser: (sessionUserId, seed) =>
        model.createOpportunityForUser(sessionUserId, seed, { storage }),
      updateOpportunityForUser: (sessionUserId, opportunityId, updates) =>
        model.updateOpportunityForUser(sessionUserId, opportunityId, updates, { storage }),
      archiveOpportunityForUser: (sessionUserId, opportunityId) =>
        model.archiveOpportunityForUser(sessionUserId, opportunityId, { storage }),
      deleteOpportunityForUser: (sessionUserId, opportunityId) =>
        model.deleteOpportunityForUser(sessionUserId, opportunityId, { storage }),
      window: win,
      document: doc,
    });

    initializeDashboard(win, doc);
    await Promise.resolve();
    await Promise.resolve();

    await nodes.upgradeCtaButton.trigger('click');

    assert.strictEqual(redirectedTo, 'https://checkout.stripe.test/session/cs_live_path');
    const checkoutCall = fetchCalls.find((entry) => entry.requestPath === '/api/billing/checkout-session');
    assert.ok(checkoutCall, 'expected checkout-session request on upgrade click');
    assert.strictEqual(checkoutCall.options.method, 'POST');
  })()
);

(function testOpportunityModelCrud() {
  const model = loadOpportunityModel();
  const storage = makeSessionStorage();
  const userId = 'dev-user';

  const first = model.createOpportunityForUser(
    userId,
    {
      title: 'Find apartment lead',
      type: 'housing',
      contact: 'owner@example.com',
      deadline: '2026-04-01',
      status: 'new',
      notes: 'Call after 5pm',
      tags: ['housing', 'urgent'],
    },
    { storage }
  );

  assert.ok(first.id, 'expected created opportunity to have id');

  const second = model.createOpportunityForUser(
    'dev-other',
    { title: 'Other user record' },
    { storage }
  );

  const activeForUser = model.listOpportunitiesForUser(userId, { storage });
  assert.strictEqual(activeForUser.length, 1);
  assert.strictEqual(activeForUser[0].title, 'Find apartment lead');
  assert.notStrictEqual(activeForUser[0].id, second.id);

  const updated = model.updateOpportunityForUser(
    userId,
    first.id,
    { status: 'applied', notes: 'Sent application' },
    { storage }
  );

  assert.strictEqual(updated.status, 'applied');
  assert.strictEqual(updated.notes, 'Sent application');

  model.archiveOpportunityForUser(userId, first.id, { storage });
  assert.strictEqual(model.listOpportunitiesForUser(userId, { storage }).length, 0);
  assert.strictEqual(model.listOpportunitiesForUser(userId, { includeArchived: true, storage }).length, 1);

  const deleted = model.deleteOpportunityForUser(userId, first.id, { storage });
  assert.strictEqual(deleted, true);
  assert.strictEqual(model.listOpportunitiesForUser(userId, { includeArchived: true, storage }).length, 0);
})();

Promise.all(pendingAsyncTests)
  .then(() => {
    console.log('test placeholder: pass');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
// scripts/node-test-placeholder.js EOF
