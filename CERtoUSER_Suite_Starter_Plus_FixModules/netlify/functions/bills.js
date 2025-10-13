const { billsStore, uid } = require('./_store');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function response(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

function parseSubPath(event) {
  const sources = [event.path, event.rawUrl];
  for (const source of sources) {
    if (!source) continue;
    const match = source.match(/bills(?:\/([^/?#]+))?/);
    if (match && match[1]) {
      return `/${match[1]}`;
    }
  }
  return '/';
}

function sanitizePod(value) {
  if (!value) return '';
  const cleaned = String(value).toUpperCase().replace(/\s+/g, '');
  if (!/^IT[A-Z0-9]{12,16}$/.test(cleaned)) return cleaned;
  return cleaned;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  const method = event.httpMethod;
  const subPath = parseSubPath(event);

  try {
    if (method === 'POST' && subPath === '/upload') {
      const body = JSON.parse(event.body || '{}');
      const { client_id: clientId, filename } = body;
      if (!clientId || !filename) {
        return response(400, { ok: false, error: 'client_id e filename sono obbligatori' });
      }
      const billId = uid('bill');
      const record = {
        id: billId,
        client_id: clientId,
        filename,
        url: `/mock/bills/${billId}/${encodeURIComponent(filename)}`,
        uploaded_at: new Date().toISOString()
      };
      billsStore.set(billId, record);
      return response(200, { ok: true, data: { bill_id: billId, url: record.url } });
    }

    if (method === 'POST' && subPath === '/parse') {
      const body = JSON.parse(event.body || '{}');
      const { bill_id: billId } = body;
      if (!billId) {
        return response(400, { ok: false, error: 'bill_id mancante' });
      }
      if (!billsStore.has(billId)) {
        return response(404, { ok: false, error: 'Bolletta non trovata' });
      }
      const stub = {
        customer_name: 'Cliente Demo Energia',
        tax_code: 'RSSMRA85M01H501U',
        vat: '01234567890',
        pod: 'IT001E1234567890',
        supply_address: 'Via Roma 10, 00100 Roma (RM)',
        supplier: 'Energia Plus',
        bill_number: `BILL-${billId.slice(-6).toUpperCase()}`,
        period_start: '2024-03-01',
        period_end: '2024-03-31',
        issue_date: '2024-04-05',
        due_date: '2024-04-20',
        contracted_power_kw: 4.5,
        tariff_code: 'D2',
        kwh_f1: 120.5,
        kwh_f2: 95.2,
        kwh_f3: 80.3,
        kwh_total: null,
        total_amount_eur: 185.75,
        iva_rate: 10,
        confidence: {
          pod: 0.95,
          period: 0.9,
          f1: 0.88,
          f2: 0.9,
          f3: 0.92
        }
      };
      const kwhTotal = Number((stub.kwh_f1 + stub.kwh_f2 + stub.kwh_f3).toFixed(2));
      stub.kwh_total = kwhTotal;
      stub.pod = sanitizePod(stub.pod);
      return response(200, { ok: true, data: stub });
    }

    return response(405, { ok: false, error: 'Metodo non supportato' });
  } catch (error) {
    return response(500, { ok: false, error: error.message || 'Errore server' });
  }
};
