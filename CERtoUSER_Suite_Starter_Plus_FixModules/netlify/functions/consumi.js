const { listConsumi, upsertConsumo } = require('./_data');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const clientId = params.client_id;
      if (!clientId) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'client_id obbligatorio' } })
        };
      }
      const data = listConsumi(clientId);
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { client_id, year, f1_kwh, f2_kwh, f3_kwh } = body;
      if (!client_id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'client_id obbligatorio' } })
        };
      }
      if (!/^\d{4}$/.test(String(year || ''))) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Anno non valido' } })
        };
      }
      const nF1 = Number(f1_kwh || 0);
      const nF2 = Number(f2_kwh || 0);
      const nF3 = Number(f3_kwh || 0);
      if (nF1 < 0 || nF2 < 0 || nF3 < 0) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'I valori devono essere >= 0' } })
        };
      }
      const total = Number((nF1 + nF2 + nF3).toFixed(2));
      const record = upsertConsumo(client_id, {
        client_id,
        year: String(year),
        f1_kwh: nF1,
        f2_kwh: nF2,
        f3_kwh: nF3,
        total
      });
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: record }) };
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
};
