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
    const { entity_type, entity_id, phase, filename } = body;
    if (!entity_type || !entity_id) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'entity_type ed entity_id sono obbligatori' } })
      };
    }
    const safeFilename = (filename || 'documento').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadUrl = `https://storage.certouser.mock/${entity_type}/${entity_id}/${Date.now()}_${safeFilename}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const response = {
      upload_url: uploadUrl,
      method: 'PUT',
      expires_at: expiresAt,
      phase: phase ?? null
    };
    return {
      statusCode: 200,
      headers: headers(),
      body: JSON.stringify({ ok: true, data: response })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});
