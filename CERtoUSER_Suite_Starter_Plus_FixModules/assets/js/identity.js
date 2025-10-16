const STORAGE_KEY = 'mind.identity.session';
const LOGIN_PATHS = ['/login', '/login/', '/login/index.html'];
const LOGIN_REDIRECT_TARGET = '/login/index.html';
const REFRESH_THRESHOLD_MS = 60_000;
const IDENTITY_EVENT = 'mind:identity';

let currentSession = null;
let readyResolver;
let readySettled = false;
let loginButton = null;
let logoutButton = null;
let whoamiBadge = null;
let sessionControlsBound = false;
let identityInitialized = false;
let widgetRetryTimer = null;
let widgetRetryAttempts = 0;

const MAX_WIDGET_RETRY_ATTEMPTS = 20;
const WIDGET_RETRY_DELAY_MS = 150;
let widgetListenersBound = false;

export const identityReady = new Promise((resolve) => {
  readyResolver = resolve;
});

export const waitIdentity = identityReady.then((session) => session?.user ?? null);

const globalScope = typeof window !== 'undefined'
  ? window
  : (typeof globalThis !== 'undefined' ? globalThis : undefined);

const originalFetch = typeof globalScope?.fetch === 'function'
  ? globalScope.fetch.bind(globalScope)
  : null;

if (typeof window !== 'undefined') {
  window.MIND_IDENTITY_READY = identityReady;
  window.MIND_IDENTITY_STORAGE_KEY = STORAGE_KEY;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSessionControls);
  } else {
    bindSessionControls();
  }
}

function settleReady(value) {
  if (!readySettled && typeof readyResolver === 'function') {
    readySettled = true;
    readyResolver(value);
  }
}

function getWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function scheduleWidgetRetry() {
  if (widgetListenersBound || identityInitialized) {
    widgetRetryAttempts = 0;
    if (widgetRetryTimer) {
      clearTimeout(widgetRetryTimer);
      widgetRetryTimer = null;
    }
    return;
  }
  if (widgetRetryAttempts >= MAX_WIDGET_RETRY_ATTEMPTS) return;
  if (widgetRetryTimer) return;
  widgetRetryTimer = setTimeout(() => {
    widgetRetryTimer = null;
    widgetRetryAttempts += 1;
    initNetlifyIdentity();
    ensureWidgetHandlers();
  }, WIDGET_RETRY_DELAY_MS * Math.max(1, widgetRetryAttempts + 1));
}

function initNetlifyIdentity() {
  if (identityInitialized) return;
  const w = getWindow();
  const widget = w?.netlifyIdentity;
  if (!widget?.init) {
    scheduleWidgetRetry();
    return;
  }
  identityInitialized = true;
  try {
    const apiUrl = `${w.location.origin}/.netlify/identity`;
    widget.init({ APIUrl: apiUrl });
  } catch (error) {
    console.warn('Impossibile inizializzare Netlify Identity:', error);
  }
  scheduleWidgetRetry();
}

function safeLocalStorage() {
  const w = getWindow();
  if (!w) return null;
  try {
    return w.localStorage || null;
  } catch (error) {
    console.warn('Accesso a localStorage non riuscito:', error);
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function readStoredSession() {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Impossibile leggere la sessione Identity salvata:', error);
    return null;
  }
}

function isLoginRoute(pathname = getWindow()?.location?.pathname ?? '') {
  if (!pathname) return false;
  return LOGIN_PATHS.some((route) => {
    if (route.endsWith('/')) {
      const normalized = route.replace(/\/+$/, '');
      return pathname === normalized || pathname.startsWith(route);
    }
    return pathname === route;
  });
}

function emitIdentityEvent(type, detail = {}) {
  const w = getWindow();
  if (!w) return;
  try {
    const event = new CustomEvent(IDENTITY_EVENT, {
      detail: {
        type,
        session: currentSession,
        ...detail
      }
    });
    w.dispatchEvent(event);
  } catch (error) {
    // CustomEvent potrebbe non essere definito in alcuni ambienti legacy
    if (typeof w.dispatchEvent === 'function') {
      try {
        const event = document.createEvent('CustomEvent');
        event.initCustomEvent(IDENTITY_EVENT, false, false, {
          type,
          session: currentSession,
          ...detail
        });
        w.dispatchEvent(event);
      } catch (fallbackError) {
        console.warn('Impossibile emettere evento Identity:', fallbackError);
      }
    }
  }
}

function mergeDeep(target, source) {
  if (!isObject(source)) return target;
  const output = target || {};
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      output[key] = value.slice();
    } else if (isObject(value)) {
      output[key] = mergeDeep(isObject(output[key]) ? output[key] : {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function deriveFeatureFlags(user) {
  if (!isObject(user)) return {};
  const sources = [user.app_metadata, user.user_metadata, user.metadata, user.data];
  const flags = {};
  const candidateKeys = ['featureFlags', 'feature_flags', 'features', 'flags'];
  for (const source of sources) {
    if (!isObject(source)) continue;
    for (const key of candidateKeys) {
      if (!(key in source)) continue;
      const candidate = source[key];
      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          if (typeof entry === 'string') {
            flags[entry] = true;
          } else if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string') {
            flags[entry[0]] = entry[1];
          } else if (isObject(entry)) {
            const name = entry.name ?? entry.key;
            if (typeof name === 'string') {
              flags[name] = Object.prototype.hasOwnProperty.call(entry, 'value')
                ? entry.value
                : (entry.enabled ?? true);
            }
          }
        }
      } else if (isObject(candidate)) {
        Object.assign(flags, candidate);
      } else if (typeof candidate === 'string') {
        flags[candidate] = true;
      }
    }
  }
  return flags;
}

function mergePermissionObjects(objects) {
  const result = {};
  for (const obj of objects) {
    mergeDeep(result, obj);
  }
  return result;
}

function derivePermissions(user) {
  if (!isObject(user)) return [];
  const sources = [user.app_metadata, user.user_metadata, user.metadata, user.data];
  const list = [];
  const structured = [];
  const candidateKeys = ['permissions', 'perms', 'allowed', 'scopes', 'roles'];

  for (const source of sources) {
    if (!isObject(source)) continue;
    for (const key of candidateKeys) {
      if (!(key in source)) continue;
      const candidate = source[key];
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          if (typeof item === 'string') {
            list.push(item);
          } else if (isObject(item)) {
            structured.push(item);
          }
        }
      } else if (isObject(candidate)) {
        structured.push(candidate);
      } else if (typeof candidate === 'string') {
        list.push(candidate);
      }
    }
  }

  if (structured.length > 0) {
    return mergePermissionObjects(structured);
  }

  if (list.length > 0) {
    return Array.from(new Set(list.filter((item) => typeof item === 'string' && item.length > 0)));
  }

  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return Array.from(new Set(user.roles.filter((role) => typeof role === 'string' && role.length > 0)));
  }

  return [];
}

function applySessionGlobals(session) {
  const w = getWindow();
  if (!w) return;
  if (session && isObject(session)) {
    const user = session.user;
    w.USER_PERMISSIONS = derivePermissions(user);
    w.FEATURE_FLAGS = deriveFeatureFlags(user);
  } else {
    w.USER_PERMISSIONS = [];
    w.FEATURE_FLAGS = {};
  }
}

function formatUserDisplay(user) {
  if (!isObject(user)) return '';
  const metadata = [user, user.user_metadata, user.app_metadata, user.data].filter(isObject);
  const nameCandidates = [
    user.full_name,
    user.fullName,
    user.name,
    user.email,
    user.username
  ];
  for (const meta of metadata) {
    if (typeof meta.full_name === 'string') nameCandidates.push(meta.full_name);
    if (typeof meta.fullName === 'string') nameCandidates.push(meta.fullName);
    if (typeof meta.name === 'string') nameCandidates.push(meta.name);
  }
  return nameCandidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

function syncSessionControls(session) {
  if (!sessionControlsBound) return;
  const hasValidSession = isSessionValid(session);
  if (loginButton) {
    loginButton.hidden = hasValidSession;
  }
  if (logoutButton) {
    logoutButton.hidden = !hasValidSession;
  }
  if (whoamiBadge) {
    if (hasValidSession) {
      const displayName = formatUserDisplay(session?.user);
      whoamiBadge.hidden = false;
      whoamiBadge.textContent = displayName || 'Account attivo';
      whoamiBadge.title = displayName || 'Account attivo';
    } else {
      whoamiBadge.hidden = true;
      whoamiBadge.textContent = '';
      whoamiBadge.removeAttribute('title');
    }
  }
}

function handleLoginButtonClick(event) {
  event?.preventDefault?.();
  redirectToLogin('ui', { replace: false });
}

function bindSessionControls() {
  if (sessionControlsBound) return;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;
  loginButton = doc.getElementById('btn-login');
  logoutButton = doc.getElementById('btn-logout');
  whoamiBadge = doc.getElementById('whoami');
  if (!loginButton && !logoutButton && !whoamiBadge) {
    return;
  }
  sessionControlsBound = true;
  loginButton?.addEventListener('click', handleLoginButtonClick);
  logoutButton?.addEventListener('click', () => logout('ui'));
  syncSessionControls(currentSession);
}

function applySession(session) {
  currentSession = session && isObject(session) ? session : null;
  const w = getWindow();
  if (w) {
    w.MIND_IDENTITY = currentSession;
  }
  applySessionGlobals(currentSession);
  syncSessionControls(currentSession);
  return currentSession;
}

export function getSessionSync() {
  return currentSession;
}

function isSameOriginRequest(url) {
  if (!url) return false;
  if (typeof window === 'undefined') return false;
  try {
    const target = new URL(url, window.location.origin);
    return target.origin === window.location.origin;
  } catch (error) {
    return false;
  }
}

const AUTH_PATH_PREFIXES = ['/api', '/api2', '/.netlify/functions'];

function shouldBypassAuth(url) {
  if (!isSameOriginRequest(url)) return true;
  try {
    const target = new URL(url, window.location.origin);
    if (target.pathname.startsWith('/.netlify/identity')) {
      return true;
    }
    if (target.pathname.startsWith('/login')) {
      return true;
    }
    return !AUTH_PATH_PREFIXES.some((prefix) => target.pathname.startsWith(prefix));
  } catch (error) {
    return true;
  }
}

async function resolveAuthSession() {
  const sync = getSessionSync();
  if (isSessionValid(sync)) {
    return sync;
  }
  try {
    const ready = await identityReady;
    if (isSessionValid(ready)) {
      return ready;
    }
  } catch (error) {
    // ignore settle errors, handled elsewhere
  }
  return null;
}

function buildRequest(input, init) {
  if (input instanceof Request) {
    if (init && Object.keys(init).length > 0) {
      return new Request(input, init);
    }
    return input;
  }
  return new Request(input, init);
}

export function loadSession() {
  const stored = readStoredSession();
  if (!isSessionValid(stored)) {
    return null;
  }
  return stored;
}

export function isSessionValid(session) {
  if (!session || typeof session !== 'object') return false;
  if (!session.accessToken || !session.expiresAt) return false;
  const expiresAt = Number(session.expiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt > Date.now() + 5000;
}

export function saveSession(session, options = {}) {
  const storage = safeLocalStorage();
  const persist = options.persist !== false;
  if (persist && storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.warn('Impossibile salvare la sessione Identity:', error);
    }
  }
  applySession(session);
  emitIdentityEvent('update', { source: options.source ?? 'saveSession' });
  return currentSession;
}

export function clearSession(reason = 'manual') {
  const storage = safeLocalStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Impossibile rimuovere la sessione Identity:', error);
    }
  }
  applySession(null);
  emitIdentityEvent('clear', { reason });
}

export function logout(reason = 'manual') {
  const w = getWindow();
  clearSession(reason);
  try {
    w?.netlifyIdentity?.logout?.();
  } catch (error) {
    console.warn('Errore durante il logout Netlify Identity:', error);
  }
  if (w && !isLoginRoute()) {
    redirectToLogin(reason);
  }
}

export async function authFetch(input, init = {}) {
  if (!originalFetch) {
    return fetch(input, init);
  }

  const request = buildRequest(input, init);
  if (shouldBypassAuth(request.url)) {
    return originalFetch(request);
  }

  const session = await resolveAuthSession();
  const token = session?.accessToken;

  if (!token) {
    return originalFetch(request);
  }

  const headers = new Headers(request.headers || undefined);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', headers.get('Accept') || 'application/json');
  }

  const finalInit = {
    ...init,
    headers,
    credentials: init?.credentials ?? request.credentials ?? 'include',
    signal: init?.signal ?? request.signal ?? undefined
  };

  const finalRequest = new Request(request, finalInit);
  return originalFetch(finalRequest);
}

export async function fetchIdentityUser(accessToken) {
  if (!accessToken) return null;
  try {
    const response = await fetch('/.netlify/identity/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn('Impossibile recuperare i dettagli utente Identity:', error);
    return null;
  }
}

function shouldRefresh(session) {
  if (!session || typeof session !== 'object') return false;
  const expiresAt = Number(session.expiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - Date.now() < REFRESH_THRESHOLD_MS;
}

async function refreshIdentitySession(session) {
  if (!session || typeof session !== 'object' || !session.refreshToken) {
    return session;
  }
  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', session.refreshToken);
  try {
    const response = await fetch('/.netlify/identity/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      // ignore parse errors, handled below
    }
    if (!response.ok) {
      const message = data.error_description || data.error || 'Refresh token non valido.';
      throw new Error(message);
    }
    const now = Date.now();
    const updated = {
      ...session,
      accessToken: data.access_token || session.accessToken,
      tokenType: data.token_type || session.tokenType || 'Bearer',
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAt: now + (Number(data.expires_in) || 3600) * 1000,
      createdAt: now
    };
    const profile = await fetchIdentityUser(updated.accessToken);
    if (profile) {
      updated.user = profile;
    }
    saveSession(updated, { source: 'refresh' });
    return updated;
  } catch (error) {
    console.warn('Impossibile aggiornare la sessione Identity:', error);
    clearSession('refresh_failed');
    const w = getWindow();
    if (w && !isLoginRoute()) {
      redirectToLogin('refresh_failed');
    }
    settleReady(null);
    return null;
  }
}

function redirectToLogin(reason, options = {}) {
  const w = getWindow();
  if (!w) return;
  if (isLoginRoute()) return;
  const loginUrl = new URL(LOGIN_REDIRECT_TARGET, w.location.origin);
  const pathname = w.location.pathname || '';
  const search = w.location.search || '';
  const hash = w.location.hash || '';
  const returnTo = `${pathname}${search}${hash}`;
  if (returnTo && !isLoginRoute(pathname)) {
    loginUrl.searchParams.set('redirect', returnTo);
  }
  if (reason) {
    loginUrl.searchParams.set('reason', reason);
  }
  const shouldReplace = options.replace !== false;
  if (shouldReplace) {
    w.location.replace(loginUrl.toString());
  } else {
    w.location.assign(loginUrl.toString());
  }
}

function handleMissingSession(reason) {
  clearSession(reason);
  const w = getWindow();
  if (w && !isLoginRoute()) {
    redirectToLogin(reason);
  }
  settleReady(null);
}

function handleStorageEvent(event) {
  if (!event || event.key !== STORAGE_KEY) return;
  if (!event.newValue) {
    clearSession('storage_cleared');
    const w = getWindow();
    if (w && !isLoginRoute()) {
      redirectToLogin('storage_cleared');
    }
    return;
  }
  try {
    const session = JSON.parse(event.newValue);
    if (isSessionValid(session)) {
      saveSession(session, { persist: false, source: 'storage' });
    } else {
      clearSession('storage_invalid');
      const w = getWindow();
      if (w && !isLoginRoute()) {
        redirectToLogin('storage_invalid');
      }
    }
  } catch (error) {
    console.warn('Impossibile interpretare la sessione Identity da storage:', error);
  }
}

function ensureWidgetHandlers() {
  const w = getWindow();
  const widget = w?.netlifyIdentity;
  if (!widget) {
    scheduleWidgetRetry();
    return;
  }
  if (widgetListenersBound) return;
  widgetListenersBound = true;

  widget.on?.('logout', () => {
    logout('widget');
  });

  widget.on?.('login', async (user) => {
    if (!user) return;
    const plain = sanitizeIdentityUser(user);
    let accessToken = null;
    let refreshToken = null;
    let expiresAt = null;
    let tokenType = 'Bearer';

    try {
      accessToken = await user.jwt?.();
    } catch (error) {
      console.warn('Impossibile ottenere JWT da Netlify Identity:', error);
    }

    const userToken = user.token && typeof user.token === 'object' ? user.token : null;
    if (userToken) {
      refreshToken = userToken.refresh_token ?? null;
      tokenType = userToken.token_type || tokenType;
      if (typeof userToken.expires_at === 'number') {
        expiresAt = userToken.expires_at;
      } else if (typeof userToken.expires_in === 'number') {
        expiresAt = Date.now() + userToken.expires_in * 1000;
      }
      if (!accessToken && typeof userToken.access_token === 'string') {
        accessToken = userToken.access_token;
      }
    }

    if (!accessToken) return;

    const now = Date.now();
    const session = {
      accessToken,
      tokenType,
      refreshToken: refreshToken ?? currentSession?.refreshToken ?? null,
      expiresAt: typeof expiresAt === 'number' ? expiresAt : now + 3600 * 1000,
      createdAt: now,
      user: plain || null
    };

    saveSession(session, { source: 'widget-login' });
    settleReady(session);
  });

  widget.on?.('init', (user) => {
    if (!user) return;
    const plain = sanitizeIdentityUser(user);
    if (!plain) return;
    const session = currentSession ? { ...currentSession, user: plain } : { user: plain };
    saveSession(session, { persist: false, source: 'widget-init' });
  });
}

function sanitizeIdentityUser(user) {
  if (!isObject(user)) return null;
  if (typeof user.toJSON === 'function') {
    try {
      return user.toJSON();
    } catch (error) {
      console.warn('Impossibile serializzare utente Identity:', error);
    }
  }
  const plain = {};
  for (const key of Object.keys(user)) {
    const value = user[key];
    if (typeof value === 'function') continue;
    plain[key] = value;
  }
  return plain;
}

async function bootstrap(initialSession) {
  const w = getWindow();
  if (!w) {
    settleReady(null);
    return null;
  }

  initNetlifyIdentity();

  if (!isSessionValid(initialSession)) {
    handleMissingSession('missing');
    return null;
  }

  applySession(initialSession);

  if (isLoginRoute()) {
    settleReady(initialSession);
    return initialSession;
  }

  let session = initialSession;
  if (shouldRefresh(session)) {
    session = await refreshIdentitySession(session);
    if (!session) {
      return null;
    }
  } else if (!session.user) {
    const profile = await fetchIdentityUser(session.accessToken);
    if (profile) {
      session = { ...session, user: profile };
      saveSession(session, { source: 'profile' });
    } else {
      saveSession(session, { persist: false, source: 'bootstrap' });
    }
  } else {
    saveSession(session, { persist: false, source: 'bootstrap' });
  }

  ensureWidgetHandlers();
  settleReady(session);
  return session;
}

const storedSession = readStoredSession();
if (isSessionValid(storedSession)) {
  applySession(storedSession);
} else {
  applySession(null);
  if (storedSession) {
    clearSession('invalid_cached');
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', handleStorageEvent);
}

bootstrap(storedSession).catch((error) => {
  console.warn('Bootstrap Identity fallito:', error);
  settleReady(null);
});

if (typeof window !== 'undefined') {
  if (originalFetch && !window.__ORIGINAL_FETCH__) {
    window.__ORIGINAL_FETCH__ = originalFetch;
  }
  window.authFetch = authFetch;
}

export default {
  loadSession,
  saveSession,
  isSessionValid,
  getSessionSync,
  clearSession,
  logout,
  authFetch,
  identityReady,
  fetchIdentityUser
};
