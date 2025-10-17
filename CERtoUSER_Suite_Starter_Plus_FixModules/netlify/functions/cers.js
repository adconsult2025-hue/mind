const { listCER, createCER, updateCER } = require('./_data');
const { guard } = require('./_safe');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function parseBody(event) {
  try {
    let raw = event.body || '';
    if (event.isBase64Encoded && raw) {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    }

    const ct = (event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      return raw ? JSON.parse(raw) : {};
    }
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      return Object.fromEntries(params.entries());
    }

    // fallback: prova a interpretare come JSON, altrimenti restituisce oggetto vuoto
    try {
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  } catch (error) {
    console.error('CER body parse error:', error, {
      headers: event.headers,
      snippet: typeof event.body === 'string' ? event.body.slice(0, 200) : null
    });
    return {};
  }
}

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
    comune: member.comune || member.city || '',
    cabina: member.cabina || member.cabina_primaria || member.cp || ''
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
  const cerCabina = String(payload.cabina || payload.cabina_primaria || payload.cp || '').trim();
  const memberCabinas = members.map(m => String(m.cabina || '').trim());
  if (memberCabinas.some(cab => !cab)) {
    return { ok: false, message: 'Tutti i membri della CER devono avere una cabina primaria associata.' };
  }
  const uniqueCabinas = Array.from(new Set(memberCabinas));
  if (uniqueCabinas.length > 1) {
    return { ok: false, message: 'I membri della CER devono appartenere alla stessa cabina primaria.' };
  }
  if (cerCabina && uniqueCabinas.length === 1 && cerCabina !== uniqueCabinas[0]) {
    return { ok: false, message: 'La cabina primaria della CER deve coincidere con quella dei membri selezionati.' };
  }

  return {
    ok: true,
    members,
    plants,
    cabina: cerCabina || uniqueCabinas[0] || ''
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
      const body = parseBody(event);
      const validation = validateCerPayload(body);
      if (!validation.ok) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: validation.message
            }
          })
        };
      }

      const id = body.id || `cer_${Date.now()}`;
      const payload = {
        ...body,
        id,
        cabina: validation.cabina || body.cabina || '',
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
      const body = parseBody(event);
      const validation = validateCerPayload(body);
      if (!validation.ok) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: validation.message
            }
          })
        };
      }
      const updated = updateCER(id, {
        ...body,
        cabina: validation.cabina || body.cabina || '',
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
