const { getPlants, updatePlant } = require('./_data');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function parseId(event) {
  const patterns = [
    /\/api\/plants\/([^/?#]+)/,
    /\/\.netlify\/functions\/plants\/([^/?#]+)/
  ];
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

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const cerId = params.cer_id;
      const items = getPlants().filter(p => !cerId || p.cer_id === cerId);
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: items }) };
    }

    if (event.httpMethod === 'PUT') {
      const id = parseId(event);
      if (!id) {
        return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'ID impianto mancante' }) };
      }
      const body = JSON.parse(event.body || '{}');
      const { tipologia, pct_cer, pct_contra } = body;
      if (!['A', 'B'].includes(tipologia)) {
        return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'Tipologia non valida' }) };
      }
      const pctCer = Number(pct_cer);
      const pctContra = Number(pct_contra);
      if (pctCer + pctContra !== 100) {
        return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'Le percentuali devono sommare 100' }) };
      }
      const updated = updatePlant(id, { tipologia, pct_cer: pctCer, pct_contra: pctContra });
      if (!updated) {
        return { statusCode: 404, headers: headers(), body: JSON.stringify({ ok: false, error: 'Impianto non trovato' }) };
      }
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: updated }) };
    }

    return { statusCode: 405, headers: headers(), body: JSON.stringify({ ok: false, error: 'Metodo non supportato' }) };
  } catch (err) {
    return { statusCode: 500, headers: headers(), body: JSON.stringify({ ok: false, error: err.message || 'Errore server' }) };
  }
};
