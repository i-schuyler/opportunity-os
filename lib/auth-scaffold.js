const MOCK_SESSION_KEY = 'opportunityOsMockSession';

export function getMockSession() {
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
  const normalized = String(email || '').trim().toLowerCase();

  if (!normalized) {
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
  window.sessionStorage.removeItem(MOCK_SESSION_KEY);
}
