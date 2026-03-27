// scripts/node-test-placeholder.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const appDir = path.join(__dirname, '..', 'app');
const requiredFiles = ['index.html', 'styles.css', 'main.js'];

for (const file of requiredFiles) {
  const filePath = path.join(appDir, file);
  assert.ok(fs.existsSync(filePath), `expected app shell file to exist: ${file}`);
}

const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
assert.ok(html.includes('<title>Opportunity OS</title>'), 'expected shell title in index.html');
assert.ok(
  html.includes('opportunity seekers') || html.includes('Opportunity seekers'),
  'expected opportunity-seekers messaging in index.html'
);

function makeSessionStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
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

function loadDashboardInitialize(mocks) {
  const filePath = path.join(__dirname, '..', 'app', 'dashboard.js');
  let source = fs.readFileSync(filePath, 'utf8');

  source = source.replace(/^import .*;\n/gm, '');
  source = source.replace('export function initializeDashboard', 'function initializeDashboard');
  source = source.replace(
    /\nif \(typeof window !== 'undefined' && typeof document !== 'undefined'\) \{\n  initializeDashboard\(window, document\);\n\}\n?$/,
    '\n'
  );
  source += '\nmodule.exports = { initializeDashboard };\n';

  const context = {
    ...mocks,
    module: { exports: {} },
    exports: {},
    JSON,
    URLSearchParams,
  };

  vm.createContext(context);
  new vm.Script(source, { filename: filePath }).runInContext(context);
  return context.module.exports.initializeDashboard;
}

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

  const initializeDashboard = loadDashboardInitialize({
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

console.log('test placeholder: pass');
// scripts/node-test-placeholder.js EOF
