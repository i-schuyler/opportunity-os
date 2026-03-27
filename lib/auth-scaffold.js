const MOCK_SESSION_KEY = 'opportunityOsMockSession';
const MOCK_AUTH_FLAG = 'OPPORTUNITY_OS_ENABLE_MOCK_AUTH';

export function isMockAuthEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  const rawFlag = window[MOCK_AUTH_FLAG];
  return rawFlag === true || rawFlag === 'true' || rawFlag === 1 || rawFlag === '1';
}

export function getMockSession() {
  if (!isMockAuthEnabled()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(MOCK_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || !parsed.userId || !parsed.email) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function signInWithEmail(email) {
  if (!isMockAuthEnabled()) {
    return null;
  }

  const normalized = String(email || '').trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!normalized || !emailPattern.test(normalized)) {
    return null;
  }

  const session = {
    userId: `dev-${normalized.replace(/[^a-z0-9]+/g, '-')}`,
    email: normalized,
    createdAt: new Date().toISOString(),
  };

  window.sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  if (!isMockAuthEnabled()) {
    return;
  }

  window.sessionStorage.removeItem(MOCK_SESSION_KEY);
}
