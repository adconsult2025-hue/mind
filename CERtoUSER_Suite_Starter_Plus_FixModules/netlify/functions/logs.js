const { logs } = require('./_store');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function response(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return response(405, { ok: false, error: 'Metodo non supportato' });
  }

  const params = event.queryStringParameters || {};
  const entity = params.entity || null;
  const entityId = params.id || null;
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));

  const filtered = logs
    .filter((entry) => (!entity || entry.entity === entity))
    .filter((entry) => (!entityId || entry.entity_id === entityId))
    .slice(-limit)
    .map((entry) => ({ ...entry }));

  return response(200, { ok: true, data: filtered });
};
