const { preflight, corsHeaders, json } = require('./_cors');
const { parseBody } = require('./_http');
const { listCER, createCER, updateCER } = require('./_data');

function normalizeCerPayload(body = {}) {
  const id = body.id || body.cer_id || `cer_${Date.now()}`;
  return {
    id,
    nome: body.nome || body.name || 'Comunità Energetica',
    cabina: body.cabina || body.cp || '',
    comune: body.comune || body.city || '',
    membri: Array.isArray(body.membri) ? body.membri : [],
    impianti: Array.isArray(body.impianti) ? body.impianti : [],
    created_at: body.created_at || new Date().toISOString()
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return preflight();
  }

  if (event.httpMethod === 'GET') {
    const data = listCER();
    return json(200, { ok: true, data });
  }

  if (event.httpMethod === 'POST') {
    const body = parseBody(event) || {};
    const payload = normalizeCerPayload(body);
    const existing = listCER().find((item) => item.id === payload.id);

    const stored = existing ? updateCER(payload.id, payload) : createCER(payload);
    return json(200, { ok: true, data: stored });
  }

  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Operazione non supportata' } })
  };
};

