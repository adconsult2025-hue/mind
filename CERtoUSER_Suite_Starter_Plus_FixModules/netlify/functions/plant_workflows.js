const { getDocsByPhase } = require('./plant_docs');
const { parseBody } = require('./_http');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const PHASES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const STATUS_FLOW = {
  todo: ['todo', 'in-review'],
  'in-review': ['in-review', 'done'],
  done: ['done', 'in-review']
};

const GATE_REQUIREMENTS = {
  P1: 'P0',
  P2: 'P1',
  P3: 'P2',
  P4: 'P3'
};

const PLANT_WORKFLOWS = {};

function ensureWorkflows(plantId) {
  if (!plantId) return [];
  if (!PLANT_WORKFLOWS[plantId]) {
    PLANT_WORKFLOWS[plantId] = PHASES.map(phase => ({
      plant_id: plantId,
      phase,
      status: 'todo',
      owner: '',
      due_date: '',
      updated_at: new Date().toISOString()
    }));
  }
  return PLANT_WORKFLOWS[plantId];
}

function listWorkflows(plantId) {
  return ensureWorkflows(plantId).map(item => ({ ...item }));
}

function validateTransition(current, next) {
  if (current === next) return true;
  const allowed = STATUS_FLOW[current] || [];
  return allowed.includes(next);
}

function gateCheck(plantId, phase, targetStatus) {
  if (!['in-review', 'done'].includes(targetStatus)) return null;
  const requiredPhase = GATE_REQUIREMENTS[phase];
  if (!requiredPhase) return null;
  const docs = getDocsByPhase(plantId, requiredPhase) || [];
  const missingDocs = [];
  if (!docs.length) {
    missingDocs.push(`Nessun documento fase ${requiredPhase}`);
  } else {
    docs.forEach(doc => {
      if (doc.status !== 'approved') {
        missingDocs.push(doc.code || doc.name || doc.id);
      }
    });
  }
  if (missingDocs.length) {
    const error = new Error('Documenti obbligatori mancanti');
    error.code = 'GATE_NOT_MET';
    error.details = { phase, missing_docs: missingDocs };
    throw error;
  }
  return null;
}

function advanceWorkflow({ plant_id, phase, status, owner, due_date }) {
  if (!PHASES.includes(phase)) {
    const error = new Error('Fase non valida');
    error.code = 'INVALID_PHASE';
    throw error;
  }
  if (!['todo', 'in-review', 'done'].includes(status)) {
    const error = new Error('Status non valido');
    error.code = 'INVALID_STATUS';
    throw error;
  }
  const workflows = ensureWorkflows(plant_id);
  const entry = workflows.find(item => item.phase === phase);
  const currentStatus = entry?.status || 'todo';
  if (!validateTransition(currentStatus, status)) {
    const error = new Error('Transizione non consentita');
    error.code = 'INVALID_TRANSITION';
    throw error;
  }
  gateCheck(plant_id, phase, status);
  entry.status = status;
  if (owner !== undefined) entry.owner = owner;
  if (due_date !== undefined) entry.due_date = due_date;
  entry.updated_at = new Date().toISOString();
  return { ...entry };
}

async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const plantId = params.plant_id;
    if (!plantId) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'plant_id è obbligatorio' } })
      };
    }
    const data = listWorkflows(plantId);
    return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
  }

  if (event.httpMethod === 'POST') {
    const isAdvance = event.path.endsWith('/advance') || event.rawUrl?.includes('/advance');
    if (!isAdvance) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'Endpoint non riconosciuto' } })
      };
    }
    try {
      const body = parseBody(event);
      const { plant_id, phase, status, owner, due_date } = body;
      if (!plant_id || !phase || !status) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'plant_id, phase e status sono obbligatori' } })
        };
      }
      const data = advanceWorkflow({ plant_id, phase, status, owner, due_date });
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
    } catch (err) {
      return {
        statusCode: err.code === 'GATE_NOT_MET' || err.code?.startsWith('INVALID_') ? 400 : 500,
        headers: headers(),
        body: JSON.stringify({
          ok: false,
          error: {
            code: err.code || 'SERVER_ERROR',
            message: err.message || 'Errore interno',
            details: err.details || null
          }
        })
      };
    }
  }

  return {
    statusCode: 405,
    headers: headers(),
    body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } })
  };
}

module.exports = {
  handler,
  ensureWorkflows,
  listWorkflows,
  advanceWorkflow
};
