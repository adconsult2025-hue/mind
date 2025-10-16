const { json } = require('./_cors');
const { verifyRequest } = require('./_auth');

exports.handler = async (event) => {
  const result = await verifyRequest(event);
  if (!result.ok) {
    return result.response;
  }

  const territories = result.claims?.territories || result.claims?.territori || result.claims?.cabine || [];

  return json(200, {
    ok: true,
    auth: true,
    uid: result.user.uid,
    email: result.user.email,
    name: result.user.name,
    roles: result.roles,
    territories
  });
};
