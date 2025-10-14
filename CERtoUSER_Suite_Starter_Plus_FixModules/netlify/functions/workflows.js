const { listWorkflows, upsertWorkflow, getPlants } = require('./_data');
const plantWorkflows = require('./plant_workflows');
const plantDocs = require('./plant_docs');
const { guard } = require('./_safe');

const SAFE_MODE = String(process.env.SAFE_MODE || '').toLowerCase() === 'true';

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  if (SAFE_MODE && event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: headers(),
      body: JSON.stringify({ ok: true, data: [] })
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const entityType = params.entity_type || params.entityType;
      const entityId = params.entity_id || params.entityId;
      const data = listWorkflows({ entity_type: entityType, entity_id: entityId });
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { entity_type, entity_id, phase, status, owner, due_date, notes } = body;
      if (!entity_type || !entity_id || phase === undefined) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'entity_type, entity_id e phase sono obbligatori' } })
        };
      }
      if (entity_type === 'cer' && Number(phase) === 3 && status) {
        const gateResult = checkCerPhaseThree(entity_id, status);
        if (!gateResult.ok) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({
              ok: false,
              error: {
                code: 'GATE_NOT_MET',
                message: 'Impianti non conformi per Fase 3 CER',
                details: gateResult.details
              }
            })
          };
        }
      }
      const result = upsertWorkflow({ entity_type, entity_id, phase, status, owner, due_date, notes });
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: result })
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
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});

function checkCerPhaseThree(cerId, targetStatus) {
  if (!['in-review', 'done'].includes(targetStatus)) {
    return { ok: true };
  }
  const plants = getPlants().filter(plant => plant.cer_id === cerId);
  if (!plants.length) {
    return { ok: true };
  }
  const missingByPlant = [];
  plants.forEach(plant => {
    const workflows = plantWorkflows.listWorkflows(plant.id);
    const phaseEntry = workflows.find(item => item.phase === 'P3');
    if (phaseEntry?.status === 'done') {
      return;
    }
    const docs = plantDocs.listPlantDocs(plant.id, { phase: 'P3' }) || [];
    const missingDocs = [];
    if (!docs.length) {
      missingDocs.push('Nessun documento fase P3');
    } else {
      docs.forEach(doc => {
        if (doc.status !== 'approved') {
          missingDocs.push(doc.code || doc.name || doc.doc_id);
        }
      });
    }
    if (missingDocs.length) {
      missingByPlant.push({ plant_id: plant.id, missing_docs: missingDocs });
    }
  });
  if (missingByPlant.length) {
    return { ok: false, details: { missing_by_plant: missingByPlant } };
  }
  return { ok: true };
}
