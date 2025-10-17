const {
  PLANT_PHASES,
  ensurePlantWorkflows,
  listPlantWorkflows,
  updatePlantWorkflowStatus,
  listPlantDocs
} = require('./_plant_store');
const { guard } = require('./_safe');
const { parseBody } = require('./_http');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

function respond(statusCode, payload) {
  return { statusCode, headers: headers(), body: JSON.stringify(payload) };
}

const ALLOWED_STATUS = ['todo', 'in-review', 'done'];
const TRANSITIONS = {
  'todo': ['in-review'],
  'in-review': ['done'],
  'done': ['in-review']
};

const PHASE_GATES = {
  P1: 'P0',
  P2: 'P1',
  P3: 'P2',
  P4: 'P3'
};

function gateCheck(plantId, phase) {
  const requiredPhase = PHASE_GATES[phase];
  if (!requiredPhase) return null;
  const docs = listPlantDocs(plantId).filter(doc => doc.phase === requiredPhase);
  const missing = docs.filter(doc => doc.status !== 'approved').map(doc => doc.code || doc.name || doc.id);
  if (!docs.length) {
    missing.push('Documentazione fase ' + requiredPhase);
  }
  if (missing.length) {
    return { phase: requiredPhase, missing_docs: missing };
  }
  return null;
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const plantId = params.plant_id || params.plantId;
      if (!plantId) {
        return respond(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'plant_id obbligatorio' } });
      }
      const data = listPlantWorkflows(plantId);
      return respond(200, { ok: true, data });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const { plant_id, phase, status } = body;
      if (!plant_id || !phase || !status) {
        return respond(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'plant_id, phase e status sono obbligatori' } });
      }
      if (!PLANT_PHASES.includes(phase)) {
        return respond(400, { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Phase non supportata' } });
      }
      if (!ALLOWED_STATUS.includes(status)) {
        return respond(400, { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Status non valido' } });
      }
      const workflows = ensurePlantWorkflows(plant_id);
      const entry = workflows.find(item => item.phase === phase);
      if (!entry) {
        return respond(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Fase non trovata' } });
      }
      if (entry.status === status) {
        return respond(200, { ok: true, data: listPlantWorkflows(plant_id) });
      }
      const allowed = TRANSITIONS[entry.status] || [];
      if (!allowed.includes(status)) {
        return respond(400, { ok: false, error: { code: 'INVALID_TRANSITION', message: `Transizione ${entry.status} → ${status} non consentita` } });
      }
      if (['in-review', 'done'].includes(status)) {
        const gate = gateCheck(plant_id, phase);
        if (gate) {
          return respond(400, {
            ok: false,
            error: {
              code: 'GATE_NOT_MET',
              message: 'Documenti obbligatori mancanti',
              details: gate
            }
          });
        }
      }
      const data = updatePlantWorkflowStatus(plant_id, phase, status);
      return respond(200, { ok: true, data });
    }

    return respond(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } });
  } catch (err) {
    return respond(500, { ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } });
  }
});
