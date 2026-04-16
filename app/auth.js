import { getMockSession, isMockAuthEnabled, signInWithEmail } from '../lib/auth-scaffold.js';

const form = document.getElementById('auth-form');
const messageNode = document.getElementById('auth-message');
const submitButton = form ? form.querySelector('button[type="submit"]') : null;
const accessCodeInput = document.getElementById('access-code');

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

function setMessage(value) {
  if (!messageNode) {
    return;
  }

  messageNode.textContent = String(value || '').trim();
}

async function resolveRealSession() {
  if (!window || typeof window.fetch !== 'function') {
    return null;
  }

  try {
    const response = await window.fetch('/api/auth/session', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => ({}));
    const userId = String((payload && payload.userId) || '').trim();
    if (!userId) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function createRealSession({ email, accessCode } = {}) {
  if (!window || typeof window.fetch !== 'function') {
    return {
      ok: false,
      error: 'Secure sign-in is unavailable in this environment.',
    };
  }

  try {
    const response = await window.fetch('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: String(email || ''),
        accessCode: String(accessCode || ''),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: String((payload && payload.error) || 'Unable to sign in right now.'),
      };
    }

    const userId = String((payload && payload.userId) || '').trim();
    if (!userId) {
      return {
        ok: false,
        error: 'Unable to sign in right now.',
      };
    }

    return {
      ok: true,
    };
  } catch {
    return {
      ok: false,
      error: 'Unable to sign in right now.',
    };
  }
}

applyMockAuthFlagFromQuery();
const mockEnabled = isMockAuthEnabled();
if (mockEnabled) {
  showMockModeBanner();
  if (accessCodeInput) {
    accessCodeInput.value = '';
    accessCodeInput.required = false;
    accessCodeInput.disabled = true;
  }
} else {
  if (accessCodeInput) {
    accessCodeInput.required = true;
    accessCodeInput.disabled = false;
  }
  setMessage('Enter your email and access code to start a secure session.');
}

const existingMockSession = mockEnabled ? getMockSession() : null;
if (existingMockSession) {
  window.location.replace(withCurrentSearch('./dashboard.html'));
}

if (!mockEnabled) {
  Promise.resolve(resolveRealSession()).then((session) => {
    if (!session) {
      return;
    }

    window.location.replace(withCurrentSearch('./dashboard.html'));
  });
}

if (form) {
  if (!mockEnabled) {
    setMessage('Enter your email and access code to start a secure session.');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (submitButton) {
      submitButton.disabled = true;
    }

    if (mockEnabled) {
      const formData = new FormData(form);
      const email = String(formData.get('email') || '');
      const session = signInWithEmail(email);

      if (!session) {
        setMessage('Enter a valid email to continue.');
        if (submitButton) {
          submitButton.disabled = false;
        }
        return;
      }

      window.location.assign(withCurrentSearch('./dashboard.html'));
      return;
    }

    const formData = new FormData(form);
    const email = String(formData.get('email') || '');
    const accessCode = String(formData.get('accessCode') || '');
    const result = await createRealSession({ email, accessCode });

    if (!result.ok) {
      setMessage(result.error);
      if (submitButton) {
        submitButton.disabled = false;
      }
      return;
    }

    window.location.assign(withCurrentSearch('./dashboard.html'));
  });
}
