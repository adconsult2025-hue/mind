const { json } = require('./_cors');

function toArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null);
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value)
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter((item) => typeof item === 'string' && item.length > 0);
  }
  return [];
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      return headers[key];
    }
  }
  return undefined;
}

function extractRoles(event = {}) {
  const roles = new Set();

  const contextRoles = toArray(event.clientContext?.user?.app_metadata?.roles || event.clientContext?.user?.roles);
  contextRoles.forEach((role) => roles.add(String(role)));

  const headers = event.headers || {};
  const headerCandidates = [
    'x-user-roles',
    'x-user-role',
    'x-roles',
    'x-role',
    'x-netlify-roles',
    'x-client-roles',
    'x-app-roles'
  ];
  for (const headerName of headerCandidates) {
    const value = getHeader(headers, headerName);
    if (!value) continue;
    toArray(value).forEach((role) => roles.add(String(role)));
  }

  return Array.from(roles).map((role) => role.trim()).filter((role) => role.length > 0);
}

function requireRole(event, allowedRoles = []) {
  const roles = extractRoles(event);
  if (allowedRoles.length === 0) {
    return { ok: true, roles };
  }

  if (!roles.length) {
    return {
      ok: false,
      response: json(401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Autenticazione richiesta.' }
      })
    };
  }

  const allowed = new Set(allowedRoles.map((role) => String(role).toLowerCase()));
  const hasRole = roles.some((role) => allowed.has(String(role).toLowerCase()));

  if (!hasRole) {
    return {
      ok: false,
      response: json(403, {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Permessi insufficienti.' }
      })
    };
  }

  return { ok: true, roles };
}

module.exports = { requireRole };
