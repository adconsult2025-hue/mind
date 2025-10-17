const {
  getInverterKey,
  recordProduction,
  setInverterStatus
} = require('./_data');
const { guard } = require('./_safe');
const { parseBody } = require('./_http');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key'
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
    const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
    const body = parseBody(event);
    const { plant_id, ts, kwh } = body;

    if (!plant_id) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'plant_id obbligatorio' } })
      };
    }

    const expectedKey = getInverterKey(plant_id);
    if (!expectedKey || apiKey !== expectedKey) {
      return {
        statusCode: 403,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'API key non valida' } })
      };
    }

    if (!(kwh > 0)) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'kWh deve essere maggiore di 0' } })
      };
    }

    const timestamp = ts ? new Date(ts) : new Date();
    if (Number.isNaN(timestamp.getTime())) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Timestamp non valido' } })
      };
    }

    const reading = {
      plant_id,
      source: 'webhook',
      ts: timestamp.toISOString(),
      date: timestamp.toISOString().slice(0, 10),
      kwh: Number(kwh)
    };

    recordProduction(plant_id, reading);
    setInverterStatus(plant_id, { ...reading, status: 'ok' });

    return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: reading }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});
