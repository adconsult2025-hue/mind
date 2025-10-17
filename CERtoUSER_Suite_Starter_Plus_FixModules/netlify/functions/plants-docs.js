const { listPlantDocs, applyPlantDocPreset } = require('./_plant_store');
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

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const plantId = params.plant_id || params.plantId;
      const phase = params.phase;
      if (!plantId) {
        return respond(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'plant_id obbligatorio' } });
      }
      const data = listPlantDocs(plantId).filter(doc => {
        if (phase === undefined) return true;
        return String(doc.phase) === String(phase);
      });
      return respond(200, { ok: true, data });
    }

    if (event.httpMethod === 'POST' && (event.path.endsWith('/preset') || event.rawUrl?.includes('/preset'))) {
      const body = parseBody(event);
      const { plant_id, type } = body;
      if (!plant_id || !type) {
        return respond(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'plant_id e type sono obbligatori' } });
      }
      try {
        const data = applyPlantDocPreset(plant_id, type);
        return respond(200, { ok: true, data });
      } catch (err) {
        return respond(400, { ok: false, error: { code: 'PRESET_ERROR', message: err.message || 'Preset non valido' } });
      }
    }

    return respond(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } });
  } catch (err) {
    return respond(500, { ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } });
  }
});
