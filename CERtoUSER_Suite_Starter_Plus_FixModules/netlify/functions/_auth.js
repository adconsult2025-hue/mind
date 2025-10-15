function normalizeRoles(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((role) => (typeof role === 'string' ? role.trim().toLowerCase() : null))
    .filter((role) => role);
}

function mergeEntry(target, entry) {
  if (!entry || !entry.token) return target;
  const key = entry.token;
  const existing = target.get(key);
  if (existing) {
    const roles = new Set([...(existing.roles || []), ...(entry.roles || [])].map((r) => r.toLowerCase()));
    existing.roles = Array.from(roles);
    existing.user = existing.user || entry.user || null;
    existing.meta = { ...existing.meta, ...entry.meta };
  } else {
    target.set(key, {
      token: key,
      roles: normalizeRoles(entry.roles),
      user: entry.user || null,
      meta: entry.meta || {}
    });
  }
  return target;
}

function parseJsonConfig(raw) {
  try {
    const parsed = JSON.parse(raw);
    const result = new Map();
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        mergeEntry(result, {
          token: item.token || item.key || item.secret,
          roles: item.roles || item.role,
          user: item.user || item.id || null,
          meta: item.meta || {}
        });
      });
    } else if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([token, value]) => {
        if (!token) return;
        if (Array.isArray(value) || typeof value === 'string') {
          mergeEntry(result, { token, roles: value });
        } else if (value && typeof value === 'object') {
          mergeEntry(result, {
            token,
            roles: value.roles || value.role,
            user: value.user || value.id || null,
            meta: value.meta || {}
          });
        }
      });
    }
    if (result.size) return result;
  } catch (err) {
    // fallthrough to string parsing
  }
  return null;
}

function parseDelimitedConfig(raw) {
  const result = new Map();
  raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const [credPart, rolesPart] = chunk.split(':');
      if (!credPart) return;
      const [tokenPart, userPart] = credPart.split('@');
      const roles = rolesPart ? rolesPart.split('|').map((r) => r.trim()).filter(Boolean) : [];
      mergeEntry(result, {
        token: tokenPart,
        user: userPart || null,
        roles
      });
    });
  if (result.size) return result;
  return null;
}

function collectEnvConfig() {
  const acc = new Map();
  const direct =
    process.env.API_AUTH_TOKENS ||
    process.env.API_TOKENS ||
    process.env.AUTH_TOKENS ||
    process.env.AUTH_USERS;

  if (direct) {
    const fromJson = parseJsonConfig(direct);
    if (fromJson) fromJson.forEach((entry) => mergeEntry(acc, entry));
    else {
      const fromDelimited = parseDelimitedConfig(direct);
      if (fromDelimited) fromDelimited.forEach((entry) => mergeEntry(acc, entry));
    }
  }

  if (process.env.ADMIN_API_TOKEN) {
    mergeEntry(acc, {
      token: process.env.ADMIN_API_TOKEN,
      roles: ['admin', 'superadmin'],
      meta: { source: 'env:ADMIN_API_TOKEN' }
    });
  }
  if (process.env.SUPERADMIN_API_TOKEN) {
    mergeEntry(acc, {
      token: process.env.SUPERADMIN_API_TOKEN,
      roles: ['superadmin'],
      meta: { source: 'env:SUPERADMIN_API_TOKEN' }
    });
  }

  Object.entries(process.env)
    .filter(([key]) => key.startsWith('API_TOKEN_') || key.startsWith('AUTH_TOKEN_'))
    .forEach(([key, value]) => {
      if (!value) return;
      const suffix = key.replace(/^API_TOKEN_|^AUTH_TOKEN_/, '');
      const role = suffix.toLowerCase();
      mergeEntry(acc, {
        token: value,
        roles: [role],
        meta: { source: `env:${key}` }
      });
    });

  return Array.from(acc.values());
}

function parseAuthorizationHeader(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  const [scheme] = value.split(' ');
  if (/^bearer$/i.test(scheme)) {
    return { token: value.slice(scheme.length).trim() };
  }
  if (/^basic$/i.test(scheme)) {
    const encoded = value.slice(scheme.length).trim();
    if (!encoded) return null;
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const [user, token] = decoded.split(':');
      return { token: token || '', user: user || null };
    } catch (err) {
      return null;
    }
  }
  return { token: value };
}

function buildError(statusCode, code, message) {
  return {
    ok: false,
    statusCode,
    msg: JSON.stringify({ ok: false, error: { code, message } })
  };
}

const AUTH_CONFIG = collectEnvConfig();

function requireRole(event, allowedRoles = []) {
  const normalizedAllowed = normalizeRoles(allowedRoles);
  if (!AUTH_CONFIG.length) {
    return { ok: true, reason: 'AUTH_DISABLED' };
  }

  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || headers.AUTHORIZATION;
  const parsedHeader = parseAuthorizationHeader(authHeader);
  const headerToken = parsedHeader?.token;
  const headerUser = parsedHeader?.user || null;
  const altToken =
    headers['x-api-key'] ||
    headers['x-api-token'] ||
    headers['x-auth-token'] ||
    headers['X-API-Key'] ||
    headers['X-API-Token'] ||
    headers['X-Auth-Token'];
  const queryToken = event.queryStringParameters?.token || event.queryStringParameters?.apiKey;

  const credential = (headerToken || altToken || queryToken || '').trim();
  if (!credential) {
    return buildError(401, 'UNAUTHORIZED', 'Missing authentication credentials');
  }

  const entry = AUTH_CONFIG.find((item) => item.token === credential);
  if (!entry) {
    return buildError(403, 'FORBIDDEN', 'Invalid authentication token');
  }

  if (normalizedAllowed.length) {
    const hasRole = entry.roles.some((role) => normalizedAllowed.includes(role));
    if (!hasRole) {
      return buildError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
  }

  return {
    ok: true,
    user: {
      id: entry.user || headerUser || null,
      roles: entry.roles
    },
    meta: entry.meta || {}
  };
}

module.exports = { requireRole };
