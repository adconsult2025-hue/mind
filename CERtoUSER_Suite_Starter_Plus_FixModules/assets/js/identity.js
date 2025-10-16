import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const IDENTITY_EVENT = 'mind:identity';
const PERSISTENCE_FALLBACKS = [browserLocalPersistence, browserSessionPersistence];
const PLACEHOLDER_MARKERS = ['YOUR_FIREBASE_API_KEY', 'YOUR_FIREBASE_APP_ID', 'your-project-id'];
const ROLE_INHERITANCE = {
  superadmin: ['admin', 'agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
  admin: ['agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
  agente: ['resp-cer', 'prosumer', 'produttore', 'consumer']
};
const ROLE_LABEL_CANONICAL = new Map([
  ['superadmin', 'superadmin'],
  ['super-admin', 'superadmin'],
  ['super admin', 'superadmin'],
  ['owner', 'superadmin'],
  ['root', 'superadmin'],
  ['admin', 'admin'],
  ['administrator', 'admin'],
  ['agente', 'agente'],
  ['agent', 'agente'],
  ['sales', 'agente'],
  ['resp cer', 'resp-cer'],
  ['resp_cer', 'resp-cer'],
  ['resp-cer', 'resp-cer'],
  ['responsabilecer', 'resp-cer'],
  ['responsabile cer', 'resp-cer'],
  ['cer_manager', 'resp-cer'],
  ['cer-manager', 'resp-cer'],
  ['prosumer', 'prosumer'],
  ['producer', 'produttore'],
  ['produttore', 'produttore'],
  ['consumer', 'consumer'],
  ['member', 'consumer'],
  ['utente', 'consumer']
]);
const FALLBACK_SESSION = { reason: 'unauthenticated' };

let currentSession = createSession(FALLBACK_SESSION);
let currentFirebaseUser = null;
let firebaseApp = null;
let firebaseAuth = null;
let initializationPromise = null;
let readyResolver = null;

export const identityReady = new Promise((resolve) => {
  readyResolver = resolve;
});

export const waitIdentity = identityReady.then((session) => session?.user ?? null);

function normalizeToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function canonicalizeRole(rawRole) {
  const normalized = normalizeToken(String(rawRole).replace(/[._]/g, ' '));
  if (!normalized) return null;
  if (ROLE_LABEL_CANONICAL.has(normalized)) {
    return ROLE_LABEL_CANONICAL.get(normalized);
  }
  return normalized;
}

function expandRoleSet(roleSet) {
  const expanded = new Set(roleSet);
  for (const role of roleSet) {
    const inherited = ROLE_INHERITANCE[role];
    if (!inherited) continue;
    inherited.forEach((child) => expanded.add(child));
  }
  return expanded;
}

function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return [];
}

function extractRolesFromClaims(claims = {}) {
  const tokens = new Set();
  const sources = [
    claims.role,
    claims.roles,
    claims.user_role,
    claims.user_roles,
    claims.userRoles,
    claims.app_metadata?.roles,
    claims.user_metadata?.roles,
    claims['custom:role'],
    claims['custom:roles'],
    claims.permissions,
    claims.allowedRoles,
    claims.allowed_roles
  ];

  const hasuraClaims = claims['https://hasura.io/jwt/claims'];
  if (hasuraClaims) {
    sources.push(hasuraClaims['x-hasura-default-role']);
    sources.push(hasuraClaims['x-hasura-allowed-roles']);
  }

  sources.forEach((source) => {
    ensureArray(source).forEach((item) => {
      const canonical = canonicalizeRole(item);
      if (canonical) tokens.add(canonical);
    });
  });

  if (claims.isSuperAdmin === true) {
    tokens.add('superadmin');
  }
  if (claims.isAdmin === true) {
    tokens.add('admin');
  }

  if (tokens.size > 0) {
    tokens.add('authenticated');
  }

  return expandRoleSet(tokens);
}

function extractTerritories(claims = {}) {
  const territoryKeys = ['territories', 'territori', 'territory', 'cabine', 'cabine_primarie', 'areas'];
  const territories = new Set();
  territoryKeys.forEach((key) => {
    ensureArray(claims[key]).forEach((item) => {
      const normalized = typeof item === 'string' ? item.trim() : item;
      if (normalized) territories.add(normalized);
    });
  });
  return Array.from(territories);
}

function createSession(overrides = {}) {
  const session = {
    accessToken: null,
    refreshToken: null,
    tokenType: 'Bearer',
    createdAt: Date.now(),
    expiresAt: 0,
    user: null,
    claims: {},
    roles: [],
    territories: [],
    source: 'firebase-auth',
    ...overrides
  };

  if (session.user && typeof session.user === 'object') {
    const roles = ensureArray(session.user.roles);
    session.roles = roles;
    session.territories = ensureArray(session.user.territories);
  }

  return session;
}

function syncWindowSession() {
  if (typeof window === 'undefined') return;
  window.MIND_IDENTITY = currentSession;
  window.MIND_IDENTITY_READY = identityReady;
  window.MIND_IDENTITY_ROLES = currentSession.roles || [];
  window.dispatchEvent?.(new Event('mind:identity-sync'));
}

function emitIdentityEvent(type, detailSession = currentSession) {
  if (typeof window === 'undefined') return;
  const detail = { type, session: detailSession };
  try {
    const event = new CustomEvent(IDENTITY_EVENT, { detail });
    window.dispatchEvent(event);
  } catch (error) {
    try {
      const legacyEvent = document.createEvent('CustomEvent');
      legacyEvent.initCustomEvent(IDENTITY_EVENT, false, false, detail);
      window.dispatchEvent(legacyEvent);
    } catch (legacyError) {
      console.warn('[identity] impossibile emettere evento Identity:', legacyError || error);
    }
  }
}

function settleReady(session) {
  if (typeof readyResolver === 'function') {
    readyResolver(session);
    readyResolver = null;
  }
}

function updateSession(session, options = {}) {
  currentSession = createSession(session);
  syncWindowSession();
  emitIdentityEvent(options.type || 'update', currentSession);
  return currentSession;
}

function clearSession(reason = 'manual') {
  const session = createSession({ reason, user: null, roles: [], territories: [] });
  updateSession(session, { type: 'clear' });
  return session;
}

async function rebuildSessionFromUser(forceRefresh = false) {
  if (!currentFirebaseUser) {
    return clearSession('signed-out');
  }

  try {
    const tokenResult = await currentFirebaseUser.getIdTokenResult(forceRefresh);
    const claims = tokenResult?.claims || {};
    const roles = Array.from(extractRolesFromClaims(claims));
    const territories = extractTerritories(claims);
    const profile = {
      id: currentFirebaseUser.uid,
      uid: currentFirebaseUser.uid,
      email: currentFirebaseUser.email || null,
      email_verified: currentFirebaseUser.emailVerified,
      phone_number: currentFirebaseUser.phoneNumber || null,
      full_name:
        currentFirebaseUser.displayName || currentFirebaseUser.email || currentFirebaseUser.phoneNumber || 'Account',
      displayName:
        currentFirebaseUser.displayName || currentFirebaseUser.email || currentFirebaseUser.phoneNumber || 'Account',
      photoURL: currentFirebaseUser.photoURL || null,
      roles,
      territories,
      claims,
      metadata: {
        creationTime: currentFirebaseUser.metadata?.creationTime || null,
        lastSignInTime: currentFirebaseUser.metadata?.lastSignInTime || null
      },
      app_metadata: {
        roles,
        territories,
        claims
      },
      user_metadata: {
        territories
      }
    };

    const expiresAt = tokenResult?.expirationTime ? Date.parse(tokenResult.expirationTime) : 0;
    const refreshToken = currentFirebaseUser.stsTokenManager?.refreshToken || currentFirebaseUser.refreshToken || null;

    const session = createSession({
      accessToken: tokenResult?.token || null,
      refreshToken,
      expiresAt,
      createdAt: Date.now(),
      user: profile,
      claims,
      roles,
      territories
    });

    updateSession(session, { type: 'session' });
    return session;
  } catch (error) {
    console.error('[identity] impossibile aggiornare la sessione Firebase:', error);
    return clearSession('token-error');
  }
}

async function configurePersistence(auth) {
  if (!auth) return;
  let lastError = null;
  for (const strategy of PERSISTENCE_FALLBACKS) {
    try {
      await setPersistence(auth, strategy);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    console.warn('[identity] impossibile impostare la persistenza Firebase:', lastError);
  }
}

function isConfigValueValid(value) {
  if (!value || typeof value !== 'string') return false;
  return !PLACEHOLDER_MARKERS.some((marker) => value.includes(marker));
}

function isFirebaseConfigValid(config) {
  if (!config || typeof config !== 'object') return false;
  const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
  return requiredKeys.every((key) => isConfigValueValid(config[key]));
}

function resolveFirebaseConfig() {
  if (typeof window === 'undefined') return null;
  const directConfig = window.__FIREBASE_CONFIG__ || window.firebaseConfig || window._firebaseConfig;
  if (isFirebaseConfigValid(directConfig)) {
    return { ...directConfig };
  }

  const jsonScript = document.querySelector('script[type="application/json"][data-firebase-config]');
  if (jsonScript) {
    try {
      const parsed = JSON.parse(jsonScript.textContent || '{}');
      if (isFirebaseConfigValid(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('[identity] configurazione Firebase JSON non valida:', error);
    }
  }

  return null;
}

function initializeFirebase() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (typeof window === 'undefined') {
      settleReady(currentSession);
      return false;
    }

    const config = resolveFirebaseConfig();
    if (!config) {
      console.warn('[identity] configurazione Firebase mancante o incompleta. Accesso disabilitato finché non viene fornita.');
      clearSession('firebase-config-missing');
      settleReady(currentSession);
      return false;
    }

    try {
      if (getApps().length) {
        firebaseApp = getApp();
      } else {
        firebaseApp = initializeApp(config);
      }
      firebaseAuth = getAuth(firebaseApp);
      void configurePersistence(firebaseAuth);

      onAuthStateChanged(
        firebaseAuth,
        (user) => {
          currentFirebaseUser = user;
          if (!user) {
            const session = clearSession('signed-out');
            settleReady(session);
            return;
          }
          rebuildSessionFromUser(false)
            .then((session) => settleReady(session))
            .catch((error) => {
              console.error('[identity] errore durante l\'inizializzazione della sessione:', error);
              settleReady(currentSession);
            });
        },
        (error) => {
          console.error('[identity] osservatore Firebase interrotto:', error);
          settleReady(currentSession);
        }
      );

      return true;
    } catch (error) {
      console.error('[identity] inizializzazione Firebase fallita:', error);
      clearSession('firebase-init-error');
      settleReady(currentSession);
      return false;
    }
  })();

  return initializationPromise;
}

initializeFirebase();

export function getSessionSync() {
  return currentSession;
}

export function loadSession() {
  return currentSession;
}

export function isSessionValid() {
  return Boolean(currentSession?.user && currentSession?.accessToken);
}

export async function saveSession(session = currentSession, options = {}) {
  updateSession(session, options);
  return currentSession;
}

export { clearSession };

export async function logout(reason = 'manual') {
  await initializeFirebase();
  if (!firebaseAuth) {
    clearSession(reason);
    return;
  }
  try {
    await signOut(firebaseAuth);
  } catch (error) {
    console.warn('[identity] logout Firebase fallito:', error);
  } finally {
    clearSession(reason);
  }
}

export async function signInWithEmailPassword(email, password, options = {}) {
  await initializeFirebase();
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication non inizializzato.');
  }

  if (options.persistence === 'session') {
    try {
      await setPersistence(firebaseAuth, browserSessionPersistence);
    } catch (error) {
      console.warn('[identity] impossibile impostare la persistenza di sessione:', error);
    }
  }

  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  currentFirebaseUser = credential.user;
  return rebuildSessionFromUser(true);
}

async function ensureFreshToken() {
  if (!currentFirebaseUser) {
    return null;
  }

  const expiresAt = currentSession?.expiresAt || 0;
  const now = Date.now();
  if (!currentSession?.accessToken || !expiresAt || now > expiresAt - 60_000) {
    await rebuildSessionFromUser(true);
  }
  return currentSession?.accessToken || null;
}

export async function authFetch(input, init = {}) {
  const requestInit = { ...init };
  const headers = new Headers(requestInit.headers || {});
  const token = await ensureFreshToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  requestInit.headers = headers;
  return fetch(input, requestInit);
}

export async function fetchIdentityUser() {
  if (!currentSession?.user) {
    return null;
  }
  if (!currentFirebaseUser) {
    return currentSession.user;
  }
  await ensureFreshToken();
  return currentSession.user;
}

syncWindowSession();
emitIdentityEvent('boot', currentSession);

identityReady.then((session) => {
  if (!session) {
    clearSession('init');
  }
});

export default {
  identityReady,
  waitIdentity,
  getSessionSync,
  loadSession,
  saveSession,
  isSessionValid,
  clearSession,
  logout,
  authFetch,
  fetchIdentityUser,
  signInWithEmailPassword
};
