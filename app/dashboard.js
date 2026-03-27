import { getMockSession, isMockAuthEnabled, signOut } from '../lib/auth-scaffold.js';
import { createOpportunity } from '../lib/opportunity-model.js';

function withCurrentSearch(path, win = window) {
  return `${path}${win.location.search || ''}`;
}

function applyMockAuthFlagFromQuery(win) {
  const params = new URLSearchParams(win.location.search);
  win.OPPORTUNITY_OS_ENABLE_MOCK_AUTH = params.get('mockAuth') === '1';
}

function addMockModeBanner(doc) {
  const banner = doc.createElement('p');
  banner.className = 'mock-banner';
  banner.textContent = 'Mock auth mode is enabled for development.';
  doc.body.prepend(banner);
}

export function initializeDashboard(win = window, doc = document) {
  applyMockAuthFlagFromQuery(win);
  const session = getMockSession();

  if (!session) {
    win.location.replace(withCurrentSearch('./auth.html', win));
    return;
  }

  if (isMockAuthEnabled()) {
    addMockModeBanner(doc);
  }

  const emailNode = doc.getElementById('session-email');
  const listNode = doc.getElementById('opportunity-list');
  const signOutButton = doc.getElementById('sign-out-button');

  if (emailNode) {
    emailNode.textContent = `Signed in as ${session.email}`;
  }

  const placeholderOpportunity = createOpportunity({
    user_id: session.userId,
    title: 'Example opportunity',
    type: 'housing',
    source_link: 'https://example.com/opportunity',
    contact: 'sample-contact@example.com',
    deadline: '',
    status: 'new',
    notes: 'Replace this mock item with real user-created opportunities in the next CRUD slice.',
    tags: ['example', 'placeholder'],
  });

  if (listNode) {
    const emptyState = doc.createElement('p');
    emptyState.className = 'panel panel--muted';
    emptyState.textContent =
      'No saved opportunities yet. Create, edit, and archive flows will be added in follow-up slices.';

    const pre = doc.createElement('pre');
    pre.className = 'code-block';
    pre.textContent = JSON.stringify(placeholderOpportunity, null, 2);

    listNode.append(emptyState, pre);
  }

  if (signOutButton) {
    signOutButton.addEventListener('click', () => {
      signOut();
      win.location.assign(withCurrentSearch('./auth.html', win));
    });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initializeDashboard(window, document);
}
