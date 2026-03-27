import { getMockSession, isMockAuthEnabled, signInWithEmail } from '../lib/auth-scaffold.js';

const form = document.getElementById('auth-form');
const messageNode = document.getElementById('auth-message');
const submitButton = form ? form.querySelector('button[type="submit"]') : null;

function withCurrentSearch(path) {
  return `${path}${window.location.search || ''}`;
}

function applyMockAuthFlagFromQuery() {
  const params = new URLSearchParams(window.location.search);
  window.OPPORTUNITY_OS_ENABLE_MOCK_AUTH = params.get('mockAuth') === '1';
}

function showMockModeBanner() {
  const banner = document.createElement('p');
  banner.className = 'mock-banner';
  banner.textContent = 'Mock auth mode is enabled for development.';
  document.body.prepend(banner);
}

applyMockAuthFlagFromQuery();
const mockEnabled = isMockAuthEnabled();
if (mockEnabled) {
  showMockModeBanner();
}

const existingSession = getMockSession();
if (existingSession) {
  window.location.replace(withCurrentSearch('./dashboard.html'));
}

if (form) {
  if (!mockEnabled) {
    if (messageNode) {
      messageNode.textContent = 'Mock auth is disabled. Add ?mockAuth=1 to enable the dev scaffold.';
    }
    if (submitButton) {
      submitButton.disabled = true;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!mockEnabled) {
      return;
    }

    const formData = new FormData(form);
    const email = String(formData.get('email') || '');
    const session = signInWithEmail(email);

    if (!session && messageNode) {
      messageNode.textContent = 'Enter a valid email to continue.';
      return;
    }

    window.location.assign(withCurrentSearch('./dashboard.html'));
  });
}
