const { listWorkflows, upsertWorkflow, getPlants } = require('./_data');
const { ensurePlantWorkflows, listPlantDocs } = require('./_plant_store');

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
      if (entity_type === 'cer' && Number(phase) === 3 && ['in-review', 'done'].includes(status)) {
        const plants = getPlants().filter(plant => plant.cer_id === entity_id);
        const missingByPlant = [];
        plants.forEach(plant => {
          const workflows = ensurePlantWorkflows(plant.id);
          const p3 = workflows.find(item => item.phase === 'P3');
          if (p3 && p3.status === 'done') {
            return;
          }
          const docs = listPlantDocs(plant.id).filter(doc => doc.phase === 'P3');
          const missingDocs = docs
            .filter(doc => doc.status !== 'approved')
            .map(doc => doc.code || doc.name || doc.id);
          if (!docs.length) {
            missingDocs.push('Documentazione fase P3');
          }
          if (missingDocs.length) {
            missingByPlant.push({ plant_id: plant.id, missing_docs: missingDocs });
          }
        });
        if (missingByPlant.length) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({
              ok: false,
              error: {
                code: 'GATE_NOT_MET',
                message: 'Impianti non conformi per Fase 3 CER',
                details: { missing_by_plant: missingByPlant }
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
};
