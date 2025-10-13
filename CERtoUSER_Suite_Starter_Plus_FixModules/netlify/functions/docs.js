const { listDocs, addDoc, updateDocStatus } = require('./_data');
const { listPlantDocs, uploadPlantDoc, markPlantDoc, findPlantDoc } = require('./plant_docs');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'];

function normalizePlantPhase(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    if (/^P[0-4]$/.test(upper)) return upper;
    const numeric = Number(upper);
    if (Number.isFinite(numeric)) return `P${numeric}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `P${value}`;
  }
  return null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const filter = {
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        phase: params.phase
      };
      if (!filter.entity_type || !filter.entity_id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'entity_type ed entity_id sono obbligatori' } })
        };
      }
      if (filter.entity_type === 'plant') {
        const phase = normalizePlantPhase(filter.phase);
        const data = listPlantDocs(filter.entity_id, { phase: phase || undefined });
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
      }
      const parsedFilter = {
        ...filter,
        phase: filter.phase !== undefined && filter.phase !== null && filter.phase !== ''
          ? Number(filter.phase)
          : undefined
      };
      const data = listDocs(parsedFilter);
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const isUpload = event.path.endsWith('/upload') || event.rawUrl?.includes('/upload');
      const isMark = event.path.endsWith('/mark') || event.rawUrl?.includes('/mark');

      if (isMark) {
        const { doc_id, status } = body;
        if (!doc_id || !status) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'doc_id e status sono obbligatori' } })
          };
        }
        if (!['approved', 'rejected', 'uploaded'].includes(status)) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Status non valido' } })
          };
        }
        const plantDoc = findPlantDoc(doc_id);
        if (plantDoc) {
          const updatedPlantDoc = markPlantDoc(doc_id, status);
          return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: updatedPlantDoc }) };
        }
        const updated = updateDocStatus(doc_id, status);
        if (!updated) {
          return {
            statusCode: 404,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Documento non trovato' } })
          };
        }
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: updated }) };
      }

      if (isUpload) {
        const { entity_type, entity_id, phase, filename } = body;
        if (!entity_type || !entity_id || !filename) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Parametri obbligatori mancanti' } })
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
        if (entity_type === 'plant') {
          const plantPhase = normalizePlantPhase(phase);
          if (!plantPhase) {
            return {
              statusCode: 400,
              headers: headers(),
              body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'phase non valida per impianto' } })
            };
          }
          const doc = uploadPlantDoc({ plant_id: entity_id, phase: plantPhase, filename });
          return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: doc }) };
        }
        const docId = `doc_${Date.now()}`;
        const doc = addDoc({
          doc_id: docId,
          entity_type,
          entity_id,
          phase: phase ?? null,
          filename,
          url: `https://storage.mock/docs/${entity_type}/${entity_id}/${docId}.${ext}`,
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: doc }) };
      }

      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'Endpoint non riconosciuto' } })
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
