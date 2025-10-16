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

exports.handler = async (event) => {
  const payload = parseBody(event);
  const user = payload.user || {};
  const email = normalizeEmail(user.email);

  let roles = [DEFAULT_ROLE];
  if (SUPERADMIN_EMAILS.has(email)) {
    roles = ['superadmin'];
  }

  const body = {
    app_metadata: {
      ...(user.app_metadata || {}),
      roles
    }
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
};
