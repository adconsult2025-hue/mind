const {
  getPlants,
  updatePlant,
  recordProduction,
  listProduction,
  setInverterStatus,
  getInverterStatus
} = require('./_data');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key'
});

function parseId(event) {
  const patterns = [/\/api\/plants\/([^/?#]+)/, /\/\.netlify\/functions\/plants\/([^/?#]+)/];
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

function parseProductionRequest(event) {
  const patterns = [/\/api\/plants\/([^/]+)\/production\b/, /\/\.netlify\/functions\/plants\/([^/]+)\/production\b/];
  const sources = [event.path, event.rawUrl];
  for (const source of sources) {
    if (!source) continue;
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    }
  }
  return null;
}

function aggregateProduction(readings, range = {}) {
  if (!Array.isArray(readings)) return { readings: [], totals: { daily: 0, monthly: 0, yearly: 0 }, last_reading: null };
  const from = range.from ? new Date(range.from) : null;
  const to = range.to ? new Date(range.to) : null;
  const filtered = readings
    .filter(reading => {
      const ts = new Date(reading.ts || reading.date || Date.now());
      if (Number.isNaN(ts.getTime())) return false;
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      return true;
    })
    .sort((a, b) => new Date(b.ts || b.date) - new Date(a.ts || a.date));

  if (!filtered.length) {
    return { readings: [], totals: { daily: 0, monthly: 0, yearly: 0 }, last_reading: null };
  }

  const last = filtered[0];
  const lastDate = (last.date || last.ts || '').toString().slice(0, 10);
  const lastMonth = lastDate.slice(0, 7);
  const lastYear = lastDate.slice(0, 4);

  const sums = { daily: 0, monthly: 0, yearly: 0 };
  filtered.forEach(item => {
    const itemDate = (item.date || item.ts || '').toString().slice(0, 10);
    const itemMonth = itemDate.slice(0, 7);
    const itemYear = itemDate.slice(0, 4);
    const value = Number(item.kwh || 0);
    if (itemDate === lastDate) sums.daily += value;
    if (itemMonth === lastMonth) sums.monthly += value;
    if (itemYear === lastYear) sums.yearly += value;
  });

  return {
    readings: filtered,
    totals: {
      daily: Number(sums.daily.toFixed(2)),
      monthly: Number(sums.monthly.toFixed(2)),
      yearly: Number(sums.yearly.toFixed(2))
    },
    last_reading: last
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    const productionPlantId = parseProductionRequest(event);

    if (event.httpMethod === 'GET' && productionPlantId) {
      const params = event.queryStringParameters || {};
      const readings = listProduction(productionPlantId);
      const aggregate = aggregateProduction(readings, { from: params.from, to: params.to });
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: { plant_id: productionPlantId, ...aggregate } })
      };
    }

    if (event.httpMethod === 'POST' && productionPlantId) {
      const body = JSON.parse(event.body || '{}');
      const date = body.date || body.ts || '';
      const kwh = Number(body.kwh);
      if (!date || Number.isNaN(new Date(date).getTime())) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Data produzione non valida' } })
        };
      }
      if (!(kwh > 0)) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'kWh deve essere maggiore di 0' } })
        };
      }
      const reading = {
        plant_id: productionPlantId,
        source: 'manual',
        date: new Date(date).toISOString().slice(0, 10),
        ts: new Date(date).toISOString(),
        kwh
      };
      recordProduction(productionPlantId, reading);
      setInverterStatus(productionPlantId, { ...reading, status: 'manual-entry' });
      const aggregate = aggregateProduction(listProduction(productionPlantId));
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: { plant_id: productionPlantId, ...aggregate } })
      };
    }

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const cerId = params.cer_id;
      const items = getPlants()
        .filter(p => !cerId || p.cer_id === cerId)
        .map(plant => {
          const aggregate = aggregateProduction(listProduction(plant.id));
          const status = getInverterStatus(plant.id);
          return {
            ...plant,
            last_reading: aggregate.last_reading || status || null,
            production_totals: aggregate.totals
          };
        });
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: items }) };
    }

    if (event.httpMethod === 'PUT') {
      const id = parseId(event);
      if (!id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'ID impianto mancante' } })
        };
      }
      const body = JSON.parse(event.body || '{}');
      const { tipologia, pct_cer, pct_contra } = body;
      if (!['A', 'B'].includes(tipologia)) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Tipologia non valida' } })
        };
      }
      const pctCer = Number(pct_cer);
      const pctContra = Number(pct_contra);
      if (Number.isNaN(pctCer) || Number.isNaN(pctContra) || pctCer + pctContra !== 100) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Le percentuali devono sommare 100' } })
        };
      }
      const updated = updatePlant(id, { tipologia, pct_cer: pctCer, pct_contra: pctContra });
      if (!updated) {
        return {
          statusCode: 404,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Impianto non trovato' } })
        };
      }
      const aggregate = aggregateProduction(listProduction(id));
      const status = getInverterStatus(id);
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: { ...updated, last_reading: aggregate.last_reading || status || null } })
      };
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
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore server' } })
    };
  }
};
