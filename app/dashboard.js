import { getMockSession, signOut } from '../lib/auth-scaffold.js';
import { createOpportunity } from '../lib/opportunity-model.js';

const session = getMockSession();

if (!session) {
  window.location.replace('./auth.html');
}

const emailNode = document.getElementById('session-email');
const listNode = document.getElementById('opportunity-list');
const signOutButton = document.getElementById('sign-out-button');

if (emailNode && session) {
  emailNode.textContent = `Signed in as ${session.email}`;
}

const placeholderOpportunity = createOpportunity({
  user_id: session ? session.userId : '',
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
  const emptyState = document.createElement('p');
  emptyState.className = 'panel panel--muted';
  emptyState.textContent = 'No saved opportunities yet. Create, edit, and archive flows will be added in follow-up slices.';

  const pre = document.createElement('pre');
  pre.className = 'code-block';
  pre.textContent = JSON.stringify(placeholderOpportunity, null, 2);

  listNode.append(emptyState, pre);
}

if (signOutButton) {
  signOutButton.addEventListener('click', () => {
    signOut();
    window.location.assign('./auth.html');
  });
}
