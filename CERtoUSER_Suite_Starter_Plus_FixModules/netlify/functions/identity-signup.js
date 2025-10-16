const DEFAULT_ROLE = 'editor';
const SUPERADMIN_EMAILS = new Set(['adv.bg.david@gmail.com']);

function parseBody(event) {
  if (!event || !event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    console.warn('identity-signup: invalid JSON body', error);
    return {};
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.values(value)
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => typeof item === 'string' && item.length > 0);
}

function buildRoles(user, email) {
  const normalizedEmail = normalizeEmail(email);
  const inherited = toArray(user.app_metadata?.roles || user.roles);
  const nextRoles = new Set(inherited.map((role) => String(role).trim()).filter(Boolean));

  nextRoles.add(DEFAULT_ROLE);

  if (SUPERADMIN_EMAILS.has(normalizedEmail)) {
    nextRoles.add('superadmin');
  }

  return Array.from(nextRoles);
}

exports.handler = async (event) => {
  const payload = parseBody(event);
  const user = payload.user || {};

  const roles = buildRoles(user, user.email);
  const appMetadata = {
    ...(user.app_metadata || {}),
    roles
  };

  const body = {
    app_metadata: appMetadata,
    roles
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
};
