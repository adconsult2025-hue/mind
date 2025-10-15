const STORAGE_KEY = 'mind.identity.session';
const LOGIN_PATH = '/login/';

function exposeSession(session) {
  if (typeof window === 'undefined') return;
  if (session) {
    window.MIND_IDENTITY = session;
  } else {
    try {
      delete window.MIND_IDENTITY;
    } catch (error) {
      window.MIND_IDENTITY = null;
    }
  }
}

function loadSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Impossibile leggere la sessione Identity:', error);
    return null;
  }
}

function isSessionValid(session) {
  if (!session || typeof session !== 'object') return false;
  if (!session.accessToken || !session.expiresAt) return false;
  return Number(session.expiresAt) > Date.now() + 5_000;
}

function saveSession(session) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn('Impossibile salvare la sessione Identity:', error);
  }
  exposeSession(session);
}

function clearSession() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Impossibile eliminare la sessione Identity:', error);
  }
  exposeSession(null);
}

function currentPath() {
  if (typeof window === 'undefined') return '/';
  const { pathname = '/', search = '', hash = '' } = window.location || {};
  return `${pathname}${search}${hash}` || '/';
}

function redirectToLogin(returnTo) {
  if (typeof window === 'undefined') return;

  let loginUrl;
  try {
    loginUrl = new URL(LOGIN_PATH, window.location.origin);
  } catch (error) {
    loginUrl = null;
  }

  const target = returnTo ?? currentPath();
  const shouldAttachRedirect = target && target.startsWith('/');

  if (loginUrl) {
    if (shouldAttachRedirect) {
      loginUrl.searchParams.set('redirect', target);
    }
    window.location.replace(loginUrl.toString());
    return;
  }

  const redirectSuffix = shouldAttachRedirect ? `?redirect=${encodeURIComponent(target)}` : '';
  window.location.replace(`${LOGIN_PATH}${redirectSuffix}`);
}

function requireSession(options = {}) {
  if (typeof window === 'undefined') return null;
  const session = loadSession();
  if (isSessionValid(session)) {
    exposeSession(session);
    return session;
  }

  clearSession();

  if (options.redirect !== false) {
    redirectToLogin(options.returnTo);
  }

  return null;
}

export {
  STORAGE_KEY,
  LOGIN_PATH,
  exposeSession,
  loadSession,
  saveSession,
  isSessionValid,
  clearSession,
  redirectToLogin,
  requireSession
};
