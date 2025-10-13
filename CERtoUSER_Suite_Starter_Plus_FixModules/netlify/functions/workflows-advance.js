const { upsertWorkflow } = require('./_data');
const { guard } = require('./_safe');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { entity_type, entity_id, phase, status, owner, due_date, notes } = body;
    if (!entity_type || !entity_id || phase === undefined || !status) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'entity_type, entity_id, phase e status sono obbligatori' } })
      };
    }
    const result = upsertWorkflow({ entity_type, entity_id, phase, status, owner, due_date, notes });
    return {
      statusCode: 200,
      headers: headers(),
      body: JSON.stringify({ ok: true, data: result })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});
