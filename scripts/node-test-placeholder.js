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
    '\nmodule.exports = { initializeDashboard, buildCard, normalizeSafeSourceLink, normalizeDashboardFilters, deriveStatusOptions, filterOpportunityItems };\n';

  const context = {
    ...mocks,
    module: { exports: {} },
    exports: {},
    JSON,
    URL,
    URLSearchParams,
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
      this.children.push(node);
    });
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

function testOpportunityItem(source_link) {
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
  };
}

(function testDashboardSourceLinkHttpsIsClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('  https://example.com/path  '), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');

  assert.ok(link, 'expected https source link to render as clickable anchor');
  assert.strictEqual(link.href, 'https://example.com/path');
})();

(function testDashboardSourceLinkHttpIsClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('http://example.com/path'), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');

  assert.ok(link, 'expected http source link to render as clickable anchor');
  assert.strictEqual(link.href, 'http://example.com/path');
})();

(function testDashboardSourceLinkJavascriptIsNotClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('javascript:alert(1)'), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');
  const sourceText = findFirstNode(card, (node) => node.tagName === 'p' && node.textContent.includes('Source:'));

  assert.strictEqual(link, null, 'expected javascript: source link to be blocked');
  assert.ok(sourceText, 'expected blocked javascript link to render as non-clickable source text');
})();

(function testDashboardSourceLinkMalformedIsNotClickable() {
  const { buildCard } = loadDashboardModule({});
  const doc = new FakeDocument();
  const card = buildCard(testOpportunityItem('not-a-valid-url'), doc);
  const link = findFirstNode(card, (node) => node.tagName === 'a');
  const sourceText = findFirstNode(card, (node) => node.tagName === 'p' && node.textContent.includes('Source:'));

  assert.strictEqual(link, null, 'expected malformed source link to be blocked');
  assert.ok(sourceText, 'expected malformed source link to render as non-clickable source text');
})();

(function testNormalizeDashboardFiltersDefaultsAndValidation() {
  const { normalizeDashboardFilters } = loadDashboardModule({});

  assert.strictEqual(normalizeDashboardFilters().view, 'active');
  assert.strictEqual(normalizeDashboardFilters().status, 'all');

  const normalized = normalizeDashboardFilters({
    view: 'archived',
    status: 'applied',
  });
  assert.strictEqual(normalized.view, 'archived');
  assert.strictEqual(normalized.status, 'applied');

  const fallback = normalizeDashboardFilters({
    view: 'invalid',
    status: '   ',
  });
  assert.strictEqual(fallback.view, 'active');
  assert.strictEqual(fallback.status, 'all');
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

console.log('test placeholder: pass');
// scripts/node-test-placeholder.js EOF
