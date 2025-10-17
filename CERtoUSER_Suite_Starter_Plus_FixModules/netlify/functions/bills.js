const { billsStore, uid } = require('./_store');
const { guard } = require('./_safe');
const { parseBody } = require('./_http');

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

function normalizeBillData(data = {}) {
  const trim = (value) => (typeof value === 'string' ? value.trim() : value || '');
  const toNumber = (value, digits = 2) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Number(num.toFixed(digits));
  };

  const kwhF1 = toNumber(data.kwh_f1);
  const kwhF2 = toNumber(data.kwh_f2);
  const kwhF3 = toNumber(data.kwh_f3);
  const calculatedTotal = Number((kwhF1 + kwhF2 + kwhF3).toFixed(2));
  const hasTotal = data.kwh_total !== undefined && data.kwh_total !== null;
  const kwhTotal = hasTotal ? toNumber(data.kwh_total) : calculatedTotal;

  const periodStart = data.period_start ? String(data.period_start).slice(0, 10) : '';
  const periodEnd = data.period_end ? String(data.period_end).slice(0, 10) : '';
  const period = data.period || (periodStart ? periodStart.slice(0, 7) : '');
  const year = data.year || (period ? Number(period.split('-')[0]) : null);

  return {
    customer_name: trim(data.customer_name),
    tax_code: trim(data.tax_code),
    vat: trim(data.vat),
    pod: sanitizePod(trim(data.pod)),
    supply_address: trim(data.supply_address),
    supplier: trim(data.supplier),
    bill_number: trim(data.bill_number),
    period_start: periodStart,
    period_end: periodEnd,
    period,
    year,
    issue_date: data.issue_date ? String(data.issue_date).slice(0, 10) : '',
    due_date: data.due_date ? String(data.due_date).slice(0, 10) : '',
    contracted_power_kw: toNumber(data.contracted_power_kw, 3),
    tariff_code: trim(data.tariff_code),
    kwh_f1: kwhF1,
    kwh_f2: kwhF2,
    kwh_f3: kwhF3,
    kwh_total: kwhTotal,
    kwh_total_calculated: calculatedTotal,
    total_amount_eur: toNumber(data.total_amount_eur),
    iva_rate: toNumber(data.iva_rate),
    confidence: data.confidence || {}
  };
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  const method = event.httpMethod;
  const subPath = parseSubPath(event);

  try {
    if (method === 'POST' && subPath === '/upload') {
      const body = parseBody(event);
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
      const body = parseBody(event);
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
      const normalized = normalizeBillData(stub);
      return response(200, { ok: true, data: normalized });
    }

    return response(405, { ok: false, error: 'Metodo non supportato' });
  } catch (error) {
    return response(500, { ok: false, error: error.message || 'Errore server' });
  }
});
