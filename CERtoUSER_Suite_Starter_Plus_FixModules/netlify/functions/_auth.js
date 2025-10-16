const admin = require('firebase-admin');
const { json } = require('./_cors');

const ROLE_ALIASES = new Map([
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
  ['utente', 'consumer'],
  ['authenticated', 'authenticated']
]);

const ROLE_INHERITANCE = {
  superadmin: ['admin', 'agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
  admin: ['agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
  agente: ['resp-cer', 'prosumer', 'produttore', 'consumer']
};

let firebaseApp = null;

function normalizeToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function canonicalizeRole(value) {
  const token = normalizeToken(String(value).replace(/[._]/g, ' '));
  if (!token) return null;
  if (ROLE_ALIASES.has(token)) {
    return ROLE_ALIASES.get(token);
  }
  return token;
}

function expandRoles(roleSet) {
  const expanded = new Set(roleSet);
  roleSet.forEach((role) => {
    const inherited = ROLE_INHERITANCE[role];
    if (inherited) {
      inherited.forEach((child) => expanded.add(child));
    }
  });
  return expanded;
}

function extractServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT non configurata');
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (parseError) {
      const err = new Error('Impossibile parsare FIREBASE_SERVICE_ACCOUNT');
      err.cause = parseError;
      throw err;
    }
  }
}

function getFirebaseAdmin() {
  if (firebaseApp) {
    return firebaseApp;
  }
  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }
  const serviceAccount = extractServiceAccount();
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  return firebaseApp;
}

async function verifyToken(idToken) {
  if (!idToken) {
    const error = new Error('Token mancante');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  const app = getFirebaseAdmin();
  return app.auth().verifyIdToken(idToken, true);
}

function extractAuthToken(event) {
  const header = event?.headers?.authorization || event?.headers?.Authorization;
  if (!header) return null;
  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return header.trim();
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
    claims['custom:roles']
  ];

  const hasuraClaims = claims['https://hasura.io/jwt/claims'];
  if (hasuraClaims) {
    sources.push(hasuraClaims['x-hasura-default-role']);
    sources.push(hasuraClaims['x-hasura-allowed-roles']);
  }

  sources.forEach((source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach((item) => {
        const canonical = canonicalizeRole(item);
        if (canonical) tokens.add(canonical);
      });
    } else if (source instanceof Set) {
      source.forEach((item) => {
        const canonical = canonicalizeRole(item);
        if (canonical) tokens.add(canonical);
      });
    } else {
      const canonical = canonicalizeRole(source);
      if (canonical) tokens.add(canonical);
    }
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

  return expandRoles(tokens);
}

function unauthorized(message) {
  return json(401, {
    ok: false,
    error: { code: 'UNAUTHORIZED', message }
  });
}

function forbidden(message) {
  return json(403, {
    ok: false,
    error: { code: 'FORBIDDEN', message }
  });
}

function serverError(message) {
  return json(500, {
    ok: false,
    error: { code: 'AUTH_ERROR', message }
  });
}

async function verifyRequest(event, options = {}) {
  const token = extractAuthToken(event);
  if (!token) {
    return { ok: false, response: unauthorized('Intestazione Authorization mancante.') };
  }

  try {
    const decoded = await verifyToken(token);
    const roles = Array.from(extractRolesFromClaims(decoded));
    if (!roles.includes('authenticated')) {
      roles.push('authenticated');
    }

    const allowedRoles = Array.isArray(options.allowedRoles)
      ? options.allowedRoles.map(canonicalizeRole).filter(Boolean)
      : [];

    if (allowedRoles.length) {
      const hasRole = allowedRoles.some((role) => roles.includes(role));
      if (!hasRole) {
        return { ok: false, response: forbidden('Il tuo ruolo non ha accesso a questa risorsa.') };
      }
    }

    return {
      ok: true,
      roles,
      claims: decoded,
      user: {
        uid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || decoded.email || decoded.uid || 'utente',
        roles
      },
      token
    };
  } catch (error) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return { ok: false, response: unauthorized('Token Firebase non valido o scaduto.') };
    }
    if (error.message && error.message.includes('FIREBASE_SERVICE_ACCOUNT')) {
      return { ok: false, response: serverError('Service account Firebase non configurato correttamente.') };
    }
    console.error('[auth] verifica token fallita:', error);
    return { ok: false, response: serverError('Verifica token fallita.') };
  }
}

async function requireRole(event, allowedRoles = []) {
  return verifyRequest(event, { allowedRoles });
}

module.exports = { requireRole, verifyRequest, getFirebaseAdmin, canonicalizeRole };
