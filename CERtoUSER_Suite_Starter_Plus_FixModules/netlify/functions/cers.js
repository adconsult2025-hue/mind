const { listCER, createCER, updateCER } = require('./_data');
const { guard } = require('./_safe');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function parseId(event) {
  const patterns = [/\/api\/cers\/([^/?#]+)/, /\/\.netlify\/functions\/cers\/([^/?#]+)/];
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

function normalizeMembers(list) {
  if (!Array.isArray(list)) return [];
  return list.map(member => ({
    id: String(member.id || member.member_id || ''),
    nome: member.nome || member.name || '',
    ruolo: member.ruolo || member.role || '',
    pod: member.pod || '',
    comune: member.comune || member.city || ''
  }));
}

function normalizePlants(list) {
  if (!Array.isArray(list)) return [];
  return list.map(plant => ({
    id: plant.id || plant.plant_id || '',
    nome: plant.nome || plant.name || '',
    titolareId: plant.titolareId || plant.owner_id || plant.ownerId || '',
    potenza_kwp: plant.potenza_kwp || plant.kwp || null
  }));
}

function validateCerPayload(payload) {
  const members = normalizeMembers(payload.membri || payload.members);
  const plants = normalizePlants(payload.impianti || payload.plants);

  if (members.length < 3) {
    return { ok: false, message: 'Una CER deve avere almeno 3 membri.' };
  }
  const hasProducer = members.some(member => {
    const role = String(member.ruolo || '').toLowerCase();
    return role === 'prosumer' || role === 'producer' || role === 'produttore';
  });
  if (!hasProducer) {
    return { ok: false, message: 'È necessario almeno un membro Prosumer o Produttore.' };
  }
  if (plants.length < 1) {
    return { ok: false, message: 'È necessario associare almeno un impianto.' };
  }
  return {
    ok: true,
    members,
    plants
  };
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const data = listCER();
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const validation = validateCerPayload(body);
      if (!validation.ok) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'CER requires ≥3 clients, at least one prosumer/producer, and ≥1 plant'
            }
          })
        };
      }

      const id = body.id || `cer_${Date.now()}`;
      const payload = {
        ...body,
        id,
        membri: validation.members,
        impianti: validation.plants
      };
      const created = createCER(payload);
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: created }) };
    }

    if (event.httpMethod === 'PUT') {
      const id = parseId(event);
      if (!id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'ID CER mancante' } })
        };
      }
      const body = JSON.parse(event.body || '{}');
      const validation = validateCerPayload(body);
      if (!validation.ok) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'CER requires ≥3 clients, at least one prosumer/producer, and ≥1 plant'
            }
          })
        };
      }
      const updated = updateCER(id, {
        ...body,
        membri: validation.members,
        impianti: validation.plants
      });
      if (!updated) {
        return {
          statusCode: 404,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'CER non trovata' } })
        };
      }
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: updated }) };
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
