const crypto = require('crypto');
const { consumiStore, clientPods, logs, uid } = require('./_store');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function response(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

function sanitizePod(value) {
  if (!value) return '';
  const cleaned = String(value).toUpperCase().replace(/\s+/g, '');
  return cleaned;
}

function validPod(value) {
  return /^IT[A-Z0-9]{12,16}$/.test(value);
}

function validPeriod(period) {
  const match = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(String(period || ''));
  if (!match) return false;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100;
}

function findExisting(clientId, podId, period) {
  return consumiStore.find(
    (entry) => entry.client_id === clientId && entry.pod_id === podId && entry.period === period
  );
}

function ensureClientPod(clientId, podId) {
  let registry = clientPods.get(clientId);
  if (!registry) {
    registry = new Set();
    clientPods.set(clientId, registry);
  }
  if (registry.size === 0) {
    registry.add(podId);
    return true;
  }
  if (registry.has(podId)) return true;
  return false;
}

function auditLog(clientId, actor, payload) {
  const payloadStr = JSON.stringify(payload);
  const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');
  logs.push({
    id: uid('log'),
    entity: 'client',
    entity_id: clientId,
    actor: actor || 'system',
    timestamp: new Date().toISOString(),
    payload_hash: payloadHash,
    payload
  });
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const clientId = params.client_id;
      if (!clientId) {
        return response(400, { ok: false, error: 'client_id mancante' });
      }
      const items = consumiStore
        .filter((entry) => entry.client_id === clientId)
        .map((entry) => ({ ...entry }));
      return response(200, { ok: true, data: items });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const clientId = body.client_id;
      const podInput = sanitizePod(body.pod_id);
      const period = body.period;
      const year = Number(body.year);
      const overwrite = body.overwrite === true;
      const source = body.source || 'manual';
      const billPod = body.bill_pod ? sanitizePod(body.bill_pod) : null;
      const billPeriod = body.bill_period || null;
      const actor = body.actor || null;

      if (!clientId || !podInput || !period) {
        return response(400, { ok: false, error: 'campi obbligatori mancanti' });
      }
      if (!validPod(podInput)) {
        return response(400, { ok: false, error: 'POD non valido', code: 'INVALID_POD' });
      }
      if (!validPeriod(period)) {
        return response(400, { ok: false, error: 'Periodo non valido', code: 'INVALID_PERIOD' });
      }
      if (year && Number(period.split('-')[0]) !== year) {
        return response(400, { ok: false, error: 'Anno incoerente con il periodo', code: 'INVALID_YEAR' });
      }
      if (billPod && billPod !== podInput) {
        return response(400, { ok: false, error: 'POD bolletta differente dai dati inviati', code: 'BILL_VALIDATION_FAILED' });
      }
      if (billPeriod && billPeriod !== period) {
        return response(400, { ok: false, error: 'Periodo bolletta differente dai dati inviati', code: 'BILL_VALIDATION_FAILED' });
      }

      const kwhF1 = Math.max(0, Number(body.kwh_f1 || 0));
      const kwhF2 = Math.max(0, Number(body.kwh_f2 || 0));
      const kwhF3 = Math.max(0, Number(body.kwh_f3 || 0));
      let kwhTotal = body.kwh_total !== undefined && body.kwh_total !== null ? Number(body.kwh_total) : null;
      const calculatedTotal = Number((kwhF1 + kwhF2 + kwhF3).toFixed(2));
      if (!Number.isFinite(kwhTotal)) {
        kwhTotal = calculatedTotal;
      }
      if (kwhTotal < 0) {
        return response(400, { ok: false, error: 'kWh totali non validi', code: 'INVALID_KWH' });
      }

      if (!ensureClientPod(clientId, podInput)) {
        return response(403, { ok: false, error: 'Il POD non appartiene al cliente', code: 'POD_CLIENT_MISMATCH' });
      }

      const registry = clientPods.get(clientId) || new Set();
      registry.add(podInput);
      clientPods.set(clientId, registry);

      const existing = findExisting(clientId, podInput, period);
      if (existing && !overwrite) {
        return response(409, { ok: false, error: 'Periodo già presente', code: 'DUPLICATE_PERIOD', existing: { ...existing } });
      }

      const now = new Date().toISOString();
      const record = existing || { id: uid('consumo') };
      record.client_id = clientId;
      record.pod_id = podInput;
      record.period = period;
      record.year = year || Number(period.split('-')[0]);
      record.kwh_f1 = Number(kwhF1.toFixed(2));
      record.kwh_f2 = Number(kwhF2.toFixed(2));
      record.kwh_f3 = Number(kwhF3.toFixed(2));
      record.kwh_total = Number(kwhTotal.toFixed(2));
      record.source = source;
      record.updated_at = now;
      record.bill_id = body.bill_id || null;

      if (!existing) {
        consumiStore.push(record);
      }

      auditLog(clientId, actor, {
        client_id: clientId,
        pod_id: podInput,
        period,
        kwh_total: record.kwh_total,
        overwrite,
        source
      });

      return response(200, { ok: true, data: { saved: true, id: record.id } });
    }

    return response(405, { ok: false, error: 'Metodo non supportato' });
  } catch (error) {
    return response(500, { ok: false, error: error.message || 'Errore server' });
  }
};
