const { uid } = require('./_store');
const { guard } = require('./_safe');

const CT3_CASES = [];

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const VALID_STATUSES = new Set(['draft', 'in_review', 'eligible', 'ineligible']);

function headers() {
  return { ...HEADERS };
}

function matchPath(event, patterns) {
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

function parseCaseId(event) {
  return matchPath(event, [/\/api\/ct3\/cases\/([^/\?]+)\b/, /\/\.netlify\/functions\/ct3_cases\/([^/\?]+)\b/]);
}

function parseSubmitId(event) {
  return matchPath(event, [/\/api\/ct3\/cases\/([^/]+)\/submit\b/, /\/\.netlify\/functions\/ct3_cases\/([^/]+)\/submit\b/]);
}

function parseStatusId(event) {
  return matchPath(event, [/\/api\/ct3\/cases\/([^/]+)\/status\b/, /\/\.netlify\/functions\/ct3_cases\/([^/]+)\/status\b/]);
}

function cloneCase(item) {
  return JSON.parse(JSON.stringify(item));
}

function listCases(filter = {}) {
  return CT3_CASES
    .filter((item) => !filter.client_id || item.client_id === filter.client_id)
    .map(cloneCase);
}

function findCase(id) {
  return CT3_CASES.find((item) => item.id === id) || null;
}

function ensureChecklist(checklist) {
  if (!checklist || typeof checklist !== 'object') {
    return { phase: 'F0', docs: [] };
  }
  const phase = typeof checklist.phase === 'string' ? checklist.phase : 'F0';
  const docs = Array.isArray(checklist.docs) ? checklist.docs : [];
  return { phase, docs };
}

function normalizeCasePayload(payload = {}) {
  const now = new Date().toISOString();
  const building = payload.building || {};
  const intervention = payload.intervention || {};
  const incentive = payload.incentive_params || {};
  return {
    id: payload.id || '',
    tenant_id: payload.tenant_id || 'demo',
    client_id: payload.client_id || '',
    subject_type: payload.subject_type || '',
    building: {
      type: building.type || building.types || [],
      types: Array.isArray(building.types) ? building.types : (Array.isArray(building.type) ? building.type : []),
      zone: building.zone || '',
      comune: building.comune || '',
      year: building.year ?? null,
      existing: Boolean(building.existing)
    },
    intervention: {
      type: intervention.type || '',
      subtype: intervention.subtype || '',
      size_kw: Number(intervention.size_kw || 0),
      area_m2: Number(intervention.area_m2 || 0),
      capex_eur: Number(intervention.capex_eur || 0),
      opex_eur: Number(intervention.opex_eur || 0),
      life_years: Number(intervention.life_years || 0)
    },
    incentive_params: {
      pct: Number(incentive.pct || 0),
      cap_per_unit: Number(incentive.cap_per_unit || 0),
      cap_total: Number(incentive.cap_total || 0),
      years: Number(incentive.years || 0),
      single_pay_threshold_eur: Number(incentive.single_pay_threshold_eur || 0),
      expected_savings_eur: Number(incentive.expected_savings_eur || 0),
      single_payment_if_threshold: Boolean(incentive.single_payment_if_threshold)
    },
    status: payload.status || 'draft',
    checklist_state: ensureChecklist(payload.checklist_state),
    created_at: payload.created_at || now,
    updated_at: now
  };
}

function validateCasePayload(payload) {
  if (!payload.subject_type) {
    return 'subject_type obbligatorio';
  }
  if (!payload.client_id) {
    return 'client_id obbligatorio';
  }
  if (payload.building?.existing !== true) {
    return 'Il Conto Termico richiede edifici esistenti';
  }
  if (!payload.intervention?.type) {
    return 'intervento.type obbligatorio';
  }
  const years = Number(payload.incentive_params?.years || 0);
  if (!(years >= 1 && years <= 5)) {
    return 'years (1-5) obbligatorio';
  }
  return null;
}

function upsertCase(payload) {
  const normalized = normalizeCasePayload(payload);
  let existing = null;
  if (normalized.id) {
    existing = findCase(normalized.id);
  }
  if (!existing) {
    normalized.id = normalized.id || uid('ct3_case');
    normalized.created_at = new Date().toISOString();
    normalized.updated_at = normalized.created_at;
    CT3_CASES.push(normalized);
    return cloneCase(normalized);
  }
  const index = CT3_CASES.findIndex((item) => item.id === existing.id);
  const merged = {
    ...existing,
    ...normalized,
    building: { ...existing.building, ...normalized.building },
    intervention: { ...existing.intervention, ...normalized.intervention },
    incentive_params: { ...existing.incentive_params, ...normalized.incentive_params },
    checklist_state: ensureChecklist(normalized.checklist_state),
    updated_at: new Date().toISOString()
  };
  CT3_CASES[index] = merged;
  return cloneCase(merged);
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }
  try {
    const submitId = parseSubmitId(event);
    const statusId = parseStatusId(event);
    if (event.httpMethod === 'GET') {
      const caseId = parseCaseId(event);
      if (caseId) {
        const item = findCase(caseId);
        if (!item) {
          return {
            statusCode: 404,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Pratica CT3 non trovata' } })
          };
        }
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: cloneCase(item) }) };
      }
      const params = event.queryStringParameters || {};
      const cases = listCases({ client_id: params.client_id });
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: cases }) };
    }

    if (event.httpMethod === 'POST') {
      if (submitId) {
        const item = findCase(submitId);
        if (!item) {
          return {
            statusCode: 404,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Pratica CT3 non trovata' } })
          };
        }
        item.status = 'in_review';
        item.updated_at = new Date().toISOString();
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: cloneCase(item) }) };
      }
      if (statusId) {
        const item = findCase(statusId);
        if (!item) {
          return {
            statusCode: 404,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Pratica CT3 non trovata' } })
          };
        }
        const body = JSON.parse(event.body || '{}');
        const status = body.status;
        if (!VALID_STATUSES.has(status)) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Status non valido' } })
          };
        }
        item.status = status;
        item.updated_at = new Date().toISOString();
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: cloneCase(item) }) };
      }
      const body = JSON.parse(event.body || '{}');
      const normalized = normalizeCasePayload(body);
      const error = validateCasePayload(normalized);
      if (error) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: error } })
        };
      }
      const saved = upsertCase({ ...normalized, id: body.id });
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: saved }) };
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
