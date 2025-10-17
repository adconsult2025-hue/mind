const { parseBody } = require('./_http');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const PLANT_DOCS = {};

const DOC_PRESETS = {
  producer: [
    { phase: 'P0', code: 'P0-ANAG', name: 'Anagrafica impianto e titolarità' },
    { phase: 'P0', code: 'P0-POD', name: 'Dichiarazione POD produttore' },
    { phase: 'P1', code: 'P1-GOV', name: 'Delibera governance impianto' },
    { phase: 'P2', code: 'P2-CONN', name: 'Contratto di connessione' },
    { phase: 'P2', code: 'P2-TEC', name: 'Scheda tecnica inverter' },
    { phase: 'P3', code: 'P3-RIP', name: 'Verbale approvazione riparti' },
    { phase: 'P4', code: 'P4-GSE', name: 'Ricevuta istanza GSE' }
  ],
  prosumer: [
    { phase: 'P0', code: 'P0-ANAG', name: 'Anagrafica prosumer e POD' },
    { phase: 'P1', code: 'P1-ADH', name: 'Modulo adesione prosumer' },
    { phase: 'P2', code: 'P2-CONV', name: 'Convenzione uso impianto' },
    { phase: 'P2', code: 'P2-DIAG', name: 'Layout elettrico aggiornato' },
    { phase: 'P3', code: 'P3-RIP', name: 'Delibera riparti prosumer' },
    { phase: 'P4', code: 'P4-DELE', name: 'Delega operatore portale GSE' }
  ]
};

function ensurePlantDocs(plantId) {
  if (!plantId) return [];
  if (!PLANT_DOCS[plantId]) {
    PLANT_DOCS[plantId] = [];
  }
  return PLANT_DOCS[plantId];
}

function listPlantDocs(plantId, { phase } = {}) {
  const docs = ensurePlantDocs(plantId);
  if (!phase) return docs.map(doc => ({ ...doc }));
  return docs.filter(doc => doc.phase === phase).map(doc => ({ ...doc }));
}

function presetDocs(plantId, type) {
  if (!DOC_PRESETS[type]) {
    const error = new Error('Preset non supportato');
    error.code = 'PRESET_UNKNOWN';
    throw error;
  }
  const now = new Date().toISOString();
  PLANT_DOCS[plantId] = DOC_PRESETS[type].map((item, index) => {
    const docId = `plantdoc_${plantId}_${Date.now()}_${index}`;
    return {
      id: docId,
      doc_id: docId,
      plant_id: plantId,
      phase: item.phase,
      code: item.code,
      name: item.name,
      status: 'uploaded',
      url: '',
      filename: `${item.code}.pdf`,
      updated_at: now,
      created_at: now
    };
  });
  return listPlantDocs(plantId, {});
}

function sanitizeCode(value) {
  return value
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');
}

function ensureDocUrl(plantId, docId, ext) {
  return `https://storage.mock/plants/${encodeURIComponent(plantId)}/${encodeURIComponent(docId)}.${ext}`;
}

function uploadPlantDoc({ plant_id, phase, filename }) {
  const docs = ensurePlantDocs(plant_id);
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const code = sanitizeCode(filename.replace(/\.[^/.]+$/, ''));
  const existing = docs.find(doc => doc.code === code && doc.phase === phase);
  const now = new Date().toISOString();
  if (existing) {
    existing.name = filename;
    existing.filename = filename;
    existing.status = 'uploaded';
    existing.url = ensureDocUrl(plant_id, existing.id, ext || 'pdf');
    existing.updated_at = now;
    return { ...existing };
  }
  const id = `plantdoc_${plant_id}_${Date.now()}`;
  const entry = {
    id,
    doc_id: id,
    plant_id,
    phase,
    code,
    name: filename,
    filename,
    status: 'uploaded',
    url: ensureDocUrl(plant_id, id, ext || 'pdf'),
    created_at: now,
    updated_at: now
  };
  docs.push(entry);
  return { ...entry };
}

function findPlantDoc(docId) {
  return Object.values(PLANT_DOCS)
    .flat()
    .find(doc => doc.id === docId || doc.doc_id === docId) || null;
}

function markPlantDoc(docId, status) {
  const docs = Object.values(PLANT_DOCS).flat();
  const entry = docs.find(doc => doc.id === docId || doc.doc_id === docId);
  if (!entry) return null;
  entry.status = status;
  entry.updated_at = new Date().toISOString();
  return { ...entry };
}

function getDocsByPhase(plantId, phase) {
  return listPlantDocs(plantId, { phase });
}

async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } })
    };
  }

  const isPreset = event.path.endsWith('/preset') || event.rawUrl?.includes('/preset');
  if (!isPreset) {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'Endpoint non riconosciuto' } })
    };
  }

  try {
    const body = parseBody(event);
    const { plant_id, type } = body;
    if (!plant_id || !type) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'plant_id e type sono obbligatori' } })
      };
    }
    const data = presetDocs(plant_id, type);
    return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
  } catch (err) {
    return {
      statusCode: err.code === 'PRESET_UNKNOWN' ? 400 : 500,
      headers: headers(),
      body: JSON.stringify({
        ok: false,
        error: {
          code: err.code || 'SERVER_ERROR',
          message: err.message || 'Errore interno'
        }
      })
    };
  }
}

module.exports = {
  handler,
  ensurePlantDocs,
  listPlantDocs,
  presetDocs,
  uploadPlantDoc,
  markPlantDoc,
  findPlantDoc,
  getDocsByPhase
};
