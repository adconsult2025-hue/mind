const { saveBill, getBill } = require('./_data');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png'];

function randomFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 100000;
  }
  return hash;
}

exports.handler = async function handler(event) {
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

    if (event.path.endsWith('/parse') || event.rawUrl?.includes('/parse')) {
      const { bill_id } = body;
      if (!bill_id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'bill_id obbligatorio' } })
        };
      }
      const meta = getBill(bill_id);
      if (!meta) {
        return {
          statusCode: 404,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } })
        };
      }
      const seed = randomFromString(bill_id + meta.filename);
      const year = new Date(meta.uploaded_at || Date.now()).getFullYear();
      const payload = {
        anno: year,
        f1_kwh: Number((800 + (seed % 400)).toFixed(0)),
        f2_kwh: Number((600 + (seed % 300)).toFixed(0)),
        f3_kwh: Number((400 + (seed % 200)).toFixed(0))
      };
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: payload }) };
    }

    const { client_id, filename } = body;
    if (!client_id || !filename) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'client_id e filename sono obbligatori' } })
      };
    }
    const ext = filename.split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Estensione file non supportata' } })
      };
    }
    const billId = `bill_${Date.now()}`;
    const meta = saveBill({
      bill_id: billId,
      client_id,
      filename,
      url: `https://storage.mock/bills/${client_id}/${billId}.${ext}`,
      uploaded_at: new Date().toISOString()
    });
    return {
      statusCode: 200,
      headers: headers(),
      body: JSON.stringify({ ok: true, data: { bill_id: meta.bill_id, url: meta.url } })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
};
