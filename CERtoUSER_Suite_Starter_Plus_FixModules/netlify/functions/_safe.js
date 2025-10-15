const { json } = require('./_cors');

const isSafe = process.env.SAFE_MODE === 'true';

const guard = (fn) => async (event, context) => {
  if (isSafe && event.httpMethod !== 'GET') {
    return json(200, { ok: true, dryRun: true });
  }

  try {
    return await fn(event, context);
  } catch (err) {
    const statusCode = err && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    const code = err && err.code ? err.code : statusCode === 500 ? 'SERVER_ERROR' : 'ERROR';
    const message = err && err.message ? err.message : 'Unexpected error';
    return json(statusCode, { ok: false, error: { code, message } });
  }
};

function requireRole(event, roles = []) {
  const user = event?.clientContext?.user;
  if (!user) return { ok: false, statusCode: 401, msg: 'Unauthenticated' };

  const userRoles = user.app_metadata?.roles || [];
  if (roles.length && !roles.some((role) => userRoles.includes(role))) {
    return { ok: false, statusCode: 403, msg: 'Forbidden' };
  }

  return { ok: true, user };
}

module.exports = { guard, requireRole };
