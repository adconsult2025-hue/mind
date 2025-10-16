const { json } = require('./_cors');
const { verifyRequest } = require('./_auth');

const isSafe = process.env.SAFE_MODE === 'true';

const guard = (fn, options = {}) => async (event, context) => {
  if (isSafe && event.httpMethod !== 'GET') {
    return json(200, { ok: true, dryRun: true });
  }

  try {
    const authResult = await verifyRequest(event, options);
    if (!authResult.ok) {
      return authResult.response;
    }

    const enhancedContext = { ...context, identity: authResult };
    const enhancedEvent = { ...event, identity: authResult };
    return await fn(enhancedEvent, enhancedContext);
  } catch (err) {
    const statusCode = err && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    const code = err && err.code ? err.code : statusCode === 500 ? 'SERVER_ERROR' : 'ERROR';
    const message = err && err.message ? err.message : 'Unexpected error';
    return json(statusCode, { ok: false, error: { code, message } });
  }
};

async function requireRole(event, allowedRoles = []) {
  return verifyRequest(event, { allowedRoles });
}

module.exports = { guard, requireRole };
