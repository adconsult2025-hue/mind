const { json, preflight } = require('./_cors');
const { requireRole, getFirebaseAdmin, canonicalizeRole } = require('./_auth');

const ALLOWED_ROLE_VALUES = ['superadmin', 'admin', 'agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'];
const ROLE_ORDER = new Map(ALLOWED_ROLE_VALUES.map((role, index) => [role, index]));

function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return [];
}

function normalizeRoles(input) {
  const tokens = new Set();
  ensureArray(input).forEach((item) => {
    const canonical = canonicalizeRole(item);
    if (canonical && ALLOWED_ROLE_VALUES.includes(canonical)) {
      tokens.add(canonical);
    }
  });
  return Array.from(tokens).sort((a, b) => {
    const orderA = ROLE_ORDER.has(a) ? ROLE_ORDER.get(a) : Number.MAX_SAFE_INTEGER;
    const orderB = ROLE_ORDER.has(b) ? ROLE_ORDER.get(b) : Number.MAX_SAFE_INTEGER;
    return orderA - orderB || a.localeCompare(b);
  });
}

function normalizeTerritories(input) {
  const territories = new Set();
  ensureArray(input).forEach((item) => {
    if (!item) return;
    if (typeof item === 'string') {
      const value = item.trim();
      if (value) {
        territories.add(value);
      }
    } else {
      territories.add(item);
    }
  });
  return Array.from(territories);
}

function serializeUser(record) {
  if (!record) return null;
  const claims = record.customClaims || {};
  const roles = normalizeRoles([
    claims.roles,
    claims.role,
    claims.user_role,
    claims.allowedRoles,
    claims.allowed_roles
  ].flat());
  const territories = normalizeTerritories(
    claims.territories || claims.territori || claims.cabine || claims.areas
  );

  return {
    uid: record.uid,
    email: record.email || null,
    displayName: record.displayName || record.email || record.uid || '',
    disabled: record.disabled === true,
    emailVerified: record.emailVerified === true,
    metadata: {
      creationTime: record.metadata?.creationTime || null,
      lastSignInTime: record.metadata?.lastSignInTime || null
    },
    roles,
    territories
  };
}

function applyClaims(currentClaims, { roles, territories }) {
  const claims = { ...currentClaims };

  delete claims.roles;
  delete claims.role;
  delete claims.allowedRoles;
  delete claims.allowed_roles;
  delete claims.user_role;
  delete claims.permissions;

  if (roles.length) {
    claims.roles = roles;
    claims.role = roles[0];
    if (roles.includes('superadmin')) {
      claims.isSuperAdmin = true;
      claims.isAdmin = true;
    } else {
      delete claims.isSuperAdmin;
      if (roles.includes('admin')) {
        claims.isAdmin = true;
      } else {
        delete claims.isAdmin;
      }
    }
  } else {
    delete claims.isSuperAdmin;
    delete claims.isAdmin;
  }

  delete claims.territories;
  delete claims.territori;
  delete claims.cabine;
  delete claims.areas;

  if (territories.length) {
    claims.territories = territories;
  }

  return claims;
}

async function listUsers(auth, limit = 200) {
  const resolvedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 1000)) : 200;
  const users = [];
  let nextPageToken;
  do {
    const remaining = resolvedLimit - users.length;
    if (remaining <= 0) break;
    const page = await auth.listUsers(Math.min(remaining, 1000), nextPageToken);
    page.users.forEach((userRecord) => {
      users.push(serializeUser(userRecord));
    });
    nextPageToken = page.pageToken;
  } while (nextPageToken && users.length < resolvedLimit);

  return users;
}

function filterUsers(users, query) {
  if (!query) return users;
  const token = query.trim().toLowerCase();
  if (!token) return users;
  return users.filter((user) => {
    return [user.email, user.displayName, user.uid]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(token));
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return preflight();
  }

  const authz = await requireRole(event, ['superadmin']);
  if (!authz.ok) {
    return authz.response;
  }

  const method = (event.httpMethod || 'GET').toUpperCase();
  const app = getFirebaseAdmin();
  const auth = app.auth();

  try {
    if (method === 'GET') {
      const limit = event.queryStringParameters?.limit
        ? Number.parseInt(event.queryStringParameters.limit, 10)
        : undefined;
      const search = event.queryStringParameters?.search || '';
      const users = filterUsers(await listUsers(auth, limit), search);
      return json(200, { ok: true, users });
    }

    if (method === 'POST') {
      if (!event.body) {
        return json(400, {
          ok: false,
          error: { code: 'INVALID_BODY', message: 'Payload mancante.' }
        });
      }

      const payload = JSON.parse(event.body);
      const email = typeof payload.email === 'string' ? payload.email.trim() : '';
      if (!email) {
        return json(400, {
          ok: false,
          error: { code: 'INVALID_EMAIL', message: 'Email obbligatoria per creare un utente.' }
        });
      }

      const password = typeof payload.password === 'string' ? payload.password : null;
      if (password && password.length < 6) {
        return json(400, {
          ok: false,
          error: { code: 'INVALID_PASSWORD', message: 'La password deve contenere almeno 6 caratteri.' }
        });
      }

      const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
      const roles = normalizeRoles(payload.roles);
      const territories = normalizeTerritories(payload.territories);

      const userRecord = await auth.createUser({
        email,
        password: password || undefined,
        displayName: displayName || undefined,
        emailVerified: false,
        disabled: false
      });

      if (roles.length || territories.length) {
        const claims = applyClaims(userRecord.customClaims || {}, { roles, territories });
        await auth.setCustomUserClaims(userRecord.uid, claims);
      }

      const created = serializeUser(await auth.getUser(userRecord.uid));
      return json(201, { ok: true, user: created });
    }

    if (method === 'PATCH' || method === 'PUT') {
      if (!event.body) {
        return json(400, {
          ok: false,
          error: { code: 'INVALID_BODY', message: 'Payload mancante.' }
        });
      }

      const payload = JSON.parse(event.body);
      const identifier = typeof payload.uid === 'string' && payload.uid.trim()
        ? payload.uid.trim()
        : null;
      const email = !identifier && typeof payload.email === 'string' ? payload.email.trim() : null;
      if (!identifier && !email) {
        return json(400, {
          ok: false,
          error: { code: 'INVALID_IDENTIFIER', message: 'Specificare uid o email dell\'utente.' }
        });
      }

      const disabled = payload.disabled === true;

      const userRecord = identifier ? await auth.getUser(identifier) : await auth.getUserByEmail(email);
      const hasRoles = Object.prototype.hasOwnProperty.call(payload, 'roles');
      const hasTerritories = Object.prototype.hasOwnProperty.call(payload, 'territories');
      const currentRoles = normalizeRoles([
        userRecord.customClaims?.roles,
        userRecord.customClaims?.role
      ].flat());
      const currentTerritories = normalizeTerritories(
        userRecord.customClaims?.territories ||
          userRecord.customClaims?.territori ||
          userRecord.customClaims?.cabine ||
          userRecord.customClaims?.areas
      );
      const roles = hasRoles ? normalizeRoles(payload.roles) : currentRoles;
      const territories = hasTerritories ? normalizeTerritories(payload.territories) : currentTerritories;
      const updates = {};
      if (typeof payload.displayName === 'string') {
        const value = payload.displayName.trim();
        updates.displayName = value || undefined;
      }
      if (typeof payload.password === 'string' && payload.password.length >= 6) {
        updates.password = payload.password;
      }
      if (Object.keys(updates).length) {
        await auth.updateUser(userRecord.uid, updates);
      }

      if (payload.disabled === true || payload.disabled === false) {
        await auth.updateUser(userRecord.uid, { disabled });
      }

      const claims = applyClaims(userRecord.customClaims || {}, { roles, territories });
      await auth.setCustomUserClaims(userRecord.uid, claims);
      await auth.revokeRefreshTokens(userRecord.uid);

      const refreshed = serializeUser(await auth.getUser(userRecord.uid));
      return json(200, { ok: true, user: refreshed });
    }

    return json(405, {
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: `Metodo ${method} non supportato.` }
    });
  } catch (error) {
    console.error('[admin-users] errore gestione utenti:', error);
    const message = error?.message || 'Operazione fallita.';
    const status = error?.statusCode || (error?.code === 'auth/uid-already-exists' ? 400 : 500);
    return json(status, { ok: false, error: { code: error.code || 'ADMIN_USERS_ERROR', message } });
  }
};
