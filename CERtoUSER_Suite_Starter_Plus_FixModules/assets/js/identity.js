import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  getIdTokenResult
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

const FALLBACK_SESSION = Object.freeze({
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
  createdAt: Date.now(),
  user: null,
  claims: {},
  roles: [],
  territories: [],
  source: 'firebase-auth'
});

let firebaseApp = null;
let firebaseAuth = null;
let currentSession = { ...FALLBACK_SESSION };
let readyResolve;
let readyReject;
let readySettled = false;

export const identityReady = new Promise((resolve, reject) => {
  readyResolve = resolve;
  readyReject = reject;
});

export const waitIdentity = identityReady.then((session) => session?.user ?? null);

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

function canonicalizeRole(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase().replace(/[._]/g, '-');
  const aliases = {
    'super-admin': 'superadmin',
    'super admin': 'superadmin',
    owner: 'superadmin',
    root: 'superadmin',
    administrator: 'admin',
    agent: 'agente',
    sales: 'agente',
    'resp cer': 'resp-cer',
    'resp_cer': 'resp-cer',
    'resp-cer': 'resp-cer',
    responsabilecer: 'resp-cer',
    producer: 'produttore',
    member: 'consumer',
    utente: 'consumer'
  };
  return aliases[normalized] || normalized;
}

function extractRolesFromClaims(claims = {}) {
  const tokens = new Set();
  const sources = [
    claims.role,
    claims.roles,
    claims.user_role,
    claims.user_roles,
    claims.allowedRoles,
    claims.allowed_roles,
    claims.app_metadata?.roles,
    claims.user_metadata?.roles
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
  if (claims.isSuperAdmin === true) tokens.add('superadmin');
  if (claims.isAdmin === true) tokens.add('admin');
  if (tokens.size > 0) tokens.add('authenticated');
  return Array.from(tokens);
}

function extractTerritoriesFromClaims(claims = {}) {
  const keys = ['territories', 'territori', 'territory', 'cabine', 'cabine_primarie', 'areas'];
  const values = new Set();
  keys.forEach((key) => {
    ensureArray(claims[key]).forEach((item) => {
      const normalized = typeof item === 'string' ? item.trim() : item;
      if (normalized) values.add(normalized);
    });
  });
  return Array.from(values);
}

function ensureFirebaseConfig() {
  const config = (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) || null;
  if (!config || !config.apiKey || !config.projectId || !config.appId) {
    throw new Error('[identity] Configurazione Firebase mancante o incompleta.');
  }
  return config;
}

function ensureFirebase() {
  if (firebaseAuth) return firebaseAuth;
  const config = ensureFirebaseConfig();
  if (!getApps().length) {
    firebaseApp = initializeApp(config);
  } else {
    firebaseApp = getApp();
  }
  firebaseAuth = getAuth(firebaseApp);
  if (typeof window !== 'undefined') {
    if (!window.firebaseApp) window.firebaseApp = firebaseApp;
    if (!window.firebaseAuth) window.firebaseAuth = firebaseAuth;
  }
  setPersistence(firebaseAuth, browserLocalPersistence).catch(() =>
    setPersistence(firebaseAuth, browserSessionPersistence).catch(() => undefined)
  );
  return firebaseAuth;
}

function buildSession(user, claims = {}, tokenResult = null) {
  if (!user) {
    return { ...FALLBACK_SESSION, createdAt: Date.now(), reason: 'unauthenticated' };
  }
  const roles = extractRolesFromClaims(claims);
  const territories = extractTerritoriesFromClaims(claims);
  const accessToken = tokenResult?.token || null;
  const refreshToken = user.stsTokenManager?.refreshToken || user.refreshToken || null;
  const expiresAt = tokenResult?.expirationTime ? Date.parse(tokenResult.expirationTime) : 0;
  const profile = {
    id: user.uid,
    uid: user.uid,
    email: user.email || null,
    email_verified: user.emailVerified,
    phone_number: user.phoneNumber || null,
    full_name: user.displayName || user.email || user.phoneNumber || 'Account',
    displayName: user.displayName || user.email || user.phoneNumber || 'Account',
    photoURL: user.photoURL || null,
    roles,
    territories,
    claims,
    metadata: {
      creationTime: user.metadata?.creationTime || null,
      lastSignInTime: user.metadata?.lastSignInTime || null
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
  return {
    accessToken,
    refreshToken,
    expiresAt,
    createdAt: Date.now(),
    user: profile,
    claims,
    roles,
    territories,
    source: 'firebase-auth'
  };
}

function dispatchIdentityEvent(session, type = 'update') {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    const detail = { session, type };
    window.dispatchEvent(new CustomEvent('mind:identity', { detail }));
  } catch (error) {
    console.warn('[identity] impossibile emettere evento identity:', error);
  }
}

function settleReady(session) {
  if (readySettled) return;
  readySettled = true;
  if (typeof readyResolve === 'function') {
    readyResolve(session);
    readyResolve = null;
    readyReject = null;
  }
}

function rejectReady(error) {
  if (readySettled) return;
  readySettled = true;
  if (typeof readyReject === 'function') {
    readyReject(error);
  }
}

function updateSession(session, eventType = 'update') {
  currentSession = session;
  if (typeof window !== 'undefined') {
    window.MIND_IDENTITY = session;
    window.MIND_IDENTITY_READY = identityReady;
    window.MIND_IDENTITY_ROLES = session?.roles || [];
    window.currentUser = session?.user || null;
  }
  dispatchIdentityEvent(session, eventType);
  settleReady(session);
  return session;
}

function handleAuthChange(user) {
  if (!user) {
    updateSession(buildSession(null), 'signed-out');
    return;
  }
  getIdTokenResult(user, true)
    .then((tokenResult) => {
      const claims = tokenResult?.claims || {};
      updateSession(buildSession(user, claims, tokenResult), 'session');
    })
    .catch((error) => {
      console.warn('[identity] impossibile recuperare i claims Firebase:', error);
      updateSession(buildSession(user), 'session-error');
    });
}

function initializeIdentity() {
  try {
    const auth = ensureFirebase();
    onAuthStateChanged(auth, handleAuthChange, (error) => {
      console.error('[identity] errore listener auth:', error);
      rejectReady(error);
    });
  } catch (error) {
    console.error('[identity] inizializzazione Firebase fallita:', error);
    const session = { ...FALLBACK_SESSION, reason: 'config-missing', error };
    updateSession(session, 'error');
  }
}

initializeIdentity();

export function getSessionSync() {
  return currentSession;
}

export function loadSession() {
  if (readySettled) {
    return Promise.resolve(currentSession);
  }
  return identityReady;
}

export function isSessionValid() {
  return Boolean(currentSession?.user);
}

export async function saveSession(session = currentSession) {
  updateSession(session, 'manual');
  return currentSession;
}

export function clearSession() {
  return updateSession(buildSession(null), 'clear');
}

export async function logout() {
  try {
    const auth = ensureFirebase();
    await signOut(auth);
    clearSession();
  } catch (error) {
    console.warn('[identity] logout fallito:', error);
    throw error;
  }
}

export async function signInWithEmailPassword(email, password) {
  const auth = ensureFirebase();
  if (!email || !password) {
    throw new Error('Email e password sono obbligatorie.');
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return getSessionSync();
  } catch (error) {
    console.warn('[identity] autenticazione fallita:', error);
    throw error;
  }
}

export async function authFetch(input, init = {}) {
  const session = await loadSession();
  const headers = new Headers(init.headers || {});
  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  return fetch(input, { ...init, headers });
}

export async function fetchIdentityUser() {
  const session = await loadSession();
  return session?.user || null;
}

if (typeof window !== 'undefined') {
  window.identity = window.identity || { init() {}, ready: true };
}

export default {
  waitIdentity,
  identityReady,
  getSessionSync,
  loadSession,
  saveSession,
  isSessionValid,
  clearSession,
  logout,
  signInWithEmailPassword,
  authFetch,
  fetchIdentityUser
};
