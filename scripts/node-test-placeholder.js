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
    '\nmodule.exports = { initializeDashboard, buildCard, buildSampleOpportunitySeeds, normalizeSafeSourceLink, normalizeDashboardFilters, deriveStatusOptions, deriveBulkStatusOptions, filterOpportunityItems, sortOpportunityItems, classifyDeadlineUrgency, buildOpportunityExportPayload, parseOpportunityImportPayload, mergeImportedOpportunitiesForUser };\n';

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
    this.value = '';
    this.checked = false;
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
    handlers.forEach((handler) => {
      handler({
        target: this,
        preventDefault() {},
        ...eventOverrides,
      });
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

function makeDashboardHarness({ storedFilters = null } = {}) {
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
    viewFilter: new FakeElement('select'),
    statusFilter: new FakeElement('select'),
    sortFilter: new FakeElement('select'),
    summary: new FakeElement('p'),
    bulkActions: new FakeElement('div'),
    selectedSummary: new FakeElement('p'),
    bulkArchiveButton: new FakeElement('button'),
    bulkStatusSelect: new FakeElement('select'),
    bulkStatusApplyButton: new FakeElement('button'),
  };

  const nodeById = {
    'session-email': nodes.sessionEmail,
    'opportunity-list': nodes.list,
    'filter-view': nodes.viewFilter,
    'filter-status': nodes.statusFilter,
    'filter-sort': nodes.sortFilter,
    'filter-summary': nodes.summary,
    'bulk-actions': nodes.bulkActions,
    'selected-summary': nodes.selectedSummary,
    'bulk-archive-button': nodes.bulkArchiveButton,
    'bulk-status-select': nodes.bulkStatusSelect,
    'bulk-status-apply-button': nodes.bulkStatusApplyButton,
    'opportunity-form': null,
    'save-opportunity-button': null,
    'cancel-edit-button': null,
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
      search: '?mockAuth=1',
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
