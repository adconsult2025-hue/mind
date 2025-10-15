const { guard } = require('./_safe');
const { listClients, createClient, updateClient, deleteClient } = require('./_data');
const { uid } = require('./_store');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function parseId(event) {
  const patterns = [/\/api\/clients\/([^/?#]+)/, /\/\.netlify\/functions\/clients\/([^/?#]+)/];
  const sources = [event.path, event.rawUrl];
  for (const source of sources) {
    if (!source) continue;
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    }
  }
  const params = event.queryStringParameters || {};
  if (params.id) return params.id;
  return null;
}

function sanitizePayload(payload = {}) {
  const normalized = { ...payload };
  if (normalized.id) normalized.id = String(normalized.id);
  if (normalized.nome === undefined && normalized.name !== undefined) normalized.nome = normalized.name;
  if (normalized.tipo === undefined && normalized.subject_type !== undefined) normalized.tipo = normalized.subject_type;
  if (normalized.comune === undefined && normalized.city !== undefined) normalized.comune = normalized.city;
  if (normalized.cabina === undefined) {
    normalized.cabina = normalized.cabina_primaria || normalized.cp || '';
  }
  if (normalized.tel === undefined) {
    normalized.tel = normalized.phone || normalized.telefono || '';
  }
  if (!Array.isArray(normalized.pods) && normalized.pod) {
    normalized.pods = [normalized.pod];
  }
  return normalized;
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const data = listClients();
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const payload = sanitizePayload(body);
      if (!payload.id) payload.id = uid('client');
      const created = createClient(payload);
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: created }) };
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      const id = parseId(event);
      if (!id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'ID cliente mancante' } })
        };
      }
      const body = JSON.parse(event.body || '{}');
      const payload = sanitizePayload(body);
      const updated = updateClient(id, payload);
      if (!updated) {
        return {
          statusCode: 404,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Cliente non trovato' } })
        };
      }
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: updated }) };
    }

    if (event.httpMethod === 'DELETE') {
      const id = parseId(event);
      if (!id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'ID cliente mancante' } })
        };
      }
      const removed = deleteClient(id);
      if (!removed) {
        return {
          statusCode: 404,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Cliente non trovato' } })
        };
      }
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true }) };
    }

    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});
