const { guard } = require('./_safe');
const { json, preflight } = require('./_cors');
const { listQuotes, getQuote, createQuote, updateQuote, deleteQuote } = require('./_quotes');

function parseId(event) {
  const patterns = [/\/api\/quotes\/([^/?#]+)/, /\/\.netlify\/functions\/quotes\/([^/?#]+)/];
  const sources = [event.path, event.rawUrl];
  for (const source of sources) {
    if (!source) continue;
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    }
  }
  const params = event.queryStringParameters || {};
  return params.id || params.quote_id || null;
}

function readBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch (error) {
    const err = new Error('Payload JSON non valido');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return preflight();
  }

  if (event.httpMethod === 'GET') {
    const id = parseId(event);
    if (id) {
      const quote = await getQuote(id);
      if (!quote) {
        return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Preventivo non trovato' } });
      }
      return json(200, { ok: true, data: quote });
    }
    const params = event.queryStringParameters || {};
    const limit = Number(params.limit);
    const data = await listQuotes({ limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
    return json(200, { ok: true, data });
  }

  if (event.httpMethod === 'POST') {
    const payload = readBody(event);
    const created = await createQuote(payload, { userEmail: event.clientContext?.user?.email });
    return json(201, { ok: true, data: created });
  }

  if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
    const id = parseId(event);
    if (!id) {
      return json(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'ID preventivo mancante' } });
    }
    const payload = readBody(event);
    const updated = await updateQuote(id, payload);
    if (!updated) {
      return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Preventivo non trovato' } });
    }
    return json(200, { ok: true, data: updated });
  }

  if (event.httpMethod === 'DELETE') {
    const id = parseId(event);
    if (!id) {
      return json(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'ID preventivo mancante' } });
    }
    const removed = await deleteQuote(id);
    if (!removed) {
      return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Preventivo non trovato' } });
    }
    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } });
});
