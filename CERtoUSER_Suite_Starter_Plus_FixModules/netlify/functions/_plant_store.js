const PLANT_PHASES = ['P0', 'P1', 'P2', 'P3', 'P4'];

const PLANT_WORKFLOWS = Object.create(null);
const PLANT_DOCS = Object.create(null);

const DOC_PRESETS = {
  producer: [
    { phase: 'P0', code: 'P0-D01', name: 'Scheda anagrafica impianto' },
    { phase: 'P1', code: 'P1-D01', name: 'Contratto disponibilità impianto' },
    { phase: 'P2', code: 'P2-D01', name: 'Richiesta/accettazione connessione' },
    { phase: 'P3', code: 'P3-D01', name: 'Verbale configurazione riparti CER' },
    { phase: 'P4', code: 'P4-D01', name: 'Dossier pratica GSE completo' }
  ],
  prosumer: [
    { phase: 'P0', code: 'P0-PRO-01', name: 'Manifestazione interesse prosumer' },
    { phase: 'P1', code: 'P1-PRO-01', name: 'Delega gestione impianto' },
    { phase: 'P2', code: 'P2-PRO-01', name: 'Scheda tecnica aggiornata' },
    { phase: 'P3', code: 'P3-PRO-01', name: 'Checklist configurazione POD prosumer' },
    { phase: 'P4', code: 'P4-PRO-01', name: 'Autodichiarazione invio documenti GSE' }
  ]
};

function ensurePlantWorkflows(plantId) {
  if (!plantId) return [];
  if (!PLANT_WORKFLOWS[plantId]) {
    PLANT_WORKFLOWS[plantId] = PLANT_PHASES.map((phase, index) => ({
      id: `wf_${plantId}_${phase}`,
      plant_id: plantId,
      phase,
      order: index,
      status: 'todo',
      owner: '',
      due_date: '',
      updated_at: new Date().toISOString()
    }));
  }
  return PLANT_WORKFLOWS[plantId];
}

function listPlantWorkflows(plantId) {
  return ensurePlantWorkflows(plantId).map(entry => ({ ...entry }));
}

function updatePlantWorkflowStatus(plantId, phase, status) {
  const workflows = ensurePlantWorkflows(plantId);
  const entry = workflows.find(item => item.phase === phase);
  if (!entry) return null;
  entry.status = status;
  entry.updated_at = new Date().toISOString();
  return listPlantWorkflows(plantId);
}

function ensurePlantDocs(plantId) {
  if (!plantId) return [];
  if (!PLANT_DOCS[plantId]) {
    PLANT_DOCS[plantId] = [];
  }
  return PLANT_DOCS[plantId];
}

function listPlantDocs(plantId) {
  return ensurePlantDocs(plantId).map(doc => ({ ...doc }));
}

function applyPlantDocPreset(plantId, type) {
  const docs = ensurePlantDocs(plantId);
  const preset = DOC_PRESETS[type];
  if (!preset) {
    throw new Error('Preset documentale non disponibile');
  }
  preset.forEach(item => {
    const existing = docs.find(doc => doc.code === item.code);
    if (existing) {
      existing.phase = item.phase;
      existing.name = item.name;
      if (!existing.status) existing.status = 'uploaded';
      if (!existing.url) existing.url = '';
      existing.updated_at = new Date().toISOString();
    } else {
      docs.push({
        id: `plantdoc_${plantId}_${item.code}`,
        plant_id: plantId,
        phase: item.phase,
        code: item.code,
        name: item.name,
        status: 'uploaded',
        url: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  });
  return listPlantDocs(plantId);
}

function upsertPlantDoc(plantId, data) {
  const docs = ensurePlantDocs(plantId);
  const { id, code, name, phase } = data;
  if (!phase) {
    throw new Error('Phase obbligatoria per il documento');
  }
  if (!code && !id) {
    throw new Error('Specificare code o id documento');
  }
  let entry = null;
  if (id) {
    entry = docs.find(doc => doc.id === id);
  }
  if (!entry && code) {
    entry = docs.find(doc => doc.code === code);
  }
  if (!entry) {
    if (!code || !name) {
      throw new Error('Per creare un nuovo documento servono code e name');
    }
    entry = {
      id: `plantdoc_${plantId}_${Date.now()}`,
      plant_id: plantId,
      code,
      name,
      phase,
      status: 'uploaded',
      url: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    docs.push(entry);
  } else {
    if (code) entry.code = code;
    if (name) entry.name = name;
    entry.phase = phase;
    entry.updated_at = new Date().toISOString();
  }
  if (data.url !== undefined) entry.url = data.url;
  if (data.status) entry.status = data.status;
  return { ...entry };
}

function markPlantDocStatus(docId, status) {
  for (const plantId of Object.keys(PLANT_DOCS)) {
    const docs = PLANT_DOCS[plantId];
    const entry = docs.find(doc => doc.id === docId);
    if (entry) {
      entry.status = status;
      entry.updated_at = new Date().toISOString();
      return { ...entry };
    }
  }
  return null;
}

function docsByPhase(plantId, phase) {
  return ensurePlantDocs(plantId)
    .filter(doc => doc.phase === phase)
    .map(doc => ({ ...doc }));
}

module.exports = {
  PLANT_PHASES,
  PLANT_WORKFLOWS,
  PLANT_DOCS,
  DOC_PRESETS,
  ensurePlantWorkflows,
  listPlantWorkflows,
  updatePlantWorkflowStatus,
  ensurePlantDocs,
  listPlantDocs,
  applyPlantDocPreset,
  upsertPlantDoc,
  markPlantDocStatus,
  docsByPhase
};
