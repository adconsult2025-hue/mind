const plants = [
  {
    id: 'plant_001',
    cer_id: 'cer_demo_001',
    name: 'Impianto Nord',
    pod_id_produttore: 'IT001123456789',
    tipologia: 'A',
    pct_cer: 45,
    pct_contra: 55,
    inverter_api_key: 'APIKEY-PLANT-001'
  },
  {
    id: 'plant_002',
    cer_id: 'cer_demo_001',
    name: 'Impianto Sud',
    pod_id_produttore: 'IT009998877665',
    tipologia: 'B',
    pct_cer: 50,
    pct_contra: 50,
    inverter_api_key: 'APIKEY-PLANT-002'
  },
  {
    id: 'plant_003',
    cer_id: 'cer_demo_002',
    name: 'Impianto Collina',
    pod_id_produttore: 'IT005552223334',
    tipologia: 'A',
    pct_cer: 60,
    pct_contra: 40,
    inverter_api_key: 'APIKEY-PLANT-003'
  }
];

const cers = [
  {
    id: 'cer_demo_001',
    nome: 'CER Ponte Grande',
    cabina: 'CP-001',
    comune: 'Frosinone',
    quota: 60,
    riparto: 'Produttore85_CER15',
    membri: [
      { id: 'mem_001', nome: 'Mario Rossi', ruolo: 'Consumer', pod: 'IT001E1234567890', comune: 'Frosinone' },
      { id: 'mem_p001', nome: 'Solar Srl', ruolo: 'Produttore', pod: 'IT001E9876543210', comune: 'Frosinone' },
      { id: 'mem_ps001', nome: 'Lucia Bianchi', ruolo: 'Prosumer', pod: 'IT001E1234598765', comune: 'Frosinone' }
    ],
    impianti: [
      { id: 'plant_001' },
      { id: 'plant_002' }
    ]
  },
  {
    id: 'cer_demo_002',
    nome: 'CER Collina Verde',
    cabina: 'CP-045',
    comune: 'Sora',
    quota: 55,
    riparto: 'Produttore70_CER30',
    membri: [
      { id: 'mem_101', nome: 'Condominio Aurora', ruolo: 'Consumer', pod: 'IT003E9988776655', comune: 'Sora' },
      { id: 'mem_p101', nome: 'Verdi Impianti', ruolo: 'Produttore', pod: 'IT003E1234987650', comune: 'Sora' },
      { id: 'mem_102', nome: 'Cooperativa Sole', ruolo: 'Consumer', pod: 'IT003E4567981230', comune: 'Sora' }
    ],
    impianti: [
      { id: 'plant_003' }
    ]
  }
];

const allocations = [
  {
    plant_id: 'plant_001',
    period: '2024-05',
    energy_shared_kwh: 1280,
    weights: {
      consumers: [
        { member_id: 'mem_001', kwh_basis: 320 },
        { member_id: 'mem_002', kwh_basis: 280 },
        { member_id: 'mem_003', kwh_basis: 200 }
      ],
      producers: [
        { member_id: 'mem_p001', kwh_basis: 400 },
        { member_id: 'mem_p002', kwh_basis: 600 }
      ],
      prosumers: []
    },
    results: null
  },
  {
    plant_id: 'plant_002',
    period: '2024-05',
    energy_shared_kwh: 980,
    weights: {
      consumers: [
        { member_id: 'mem_001', kwh_basis: 180 },
        { member_id: 'mem_004', kwh_basis: 220 }
      ],
      producers: [],
      prosumers: [
        { member_id: 'mem_ps001', kwh_basis: 260 },
        { member_id: 'mem_ps002', kwh_basis: 140 }
      ]
    },
    results: null
  },
  {
    plant_id: 'plant_003',
    period: '2024-05',
    energy_shared_kwh: 1430,
    weights: {
      consumers: [
        { member_id: 'mem_101', kwh_basis: 360 },
        { member_id: 'mem_102', kwh_basis: 340 },
        { member_id: 'mem_103', kwh_basis: 220 }
      ],
      producers: [
        { member_id: 'mem_p101', kwh_basis: 600 },
        { member_id: 'mem_p102', kwh_basis: 400 }
      ],
      prosumers: []
    },
    results: null
  }
];

const workflows = [
  {
    id: 'wf_cer_demo_001_0',
    entity_type: 'cer',
    entity_id: 'cer_demo_001',
    phase: 0,
    status: 'done',
    owner: 'Team Scouting',
    due_date: '2024-04-15',
    notes: 'Analisi iniziale completata',
    updated_at: new Date().toISOString()
  },
  {
    id: 'wf_cer_demo_001_3',
    entity_type: 'cer',
    entity_id: 'cer_demo_001',
    phase: 3,
    status: 'in-review',
    owner: 'Responsabile Tecnico',
    due_date: '2024-05-30',
    notes: 'In attesa conferma riparti tipologia A',
    updated_at: new Date().toISOString()
  },
  {
    id: 'wf_cer_demo_002_1',
    entity_type: 'cer',
    entity_id: 'cer_demo_002',
    phase: 1,
    status: 'todo',
    owner: '',
    due_date: '',
    notes: '',
    updated_at: new Date().toISOString()
  }
];

const productionStore = new Map(); // plantId -> [ { ts, date, kwh, source } ]
const inverterStatus = new Map(); // plantId -> { ts, kwh, source }

const billsStore = new Map(); // billId -> { bill_id, client_id, filename, url, uploaded_at }
const consumiStore = new Map(); // clientId -> [ { year, f1_kwh, f2_kwh, f3_kwh, total, updated_at } ]

const docsStore = []; // { doc_id, entity_type, entity_id, phase, filename, url, status, uploaded_at }

function getPlants() {
  return plants;
}

function getPlantById(id) {
  return plants.find(p => p.id === id) || null;
}

function getInverterKey(plantId) {
  return getPlantById(plantId)?.inverter_api_key || null;
}

function updatePlant(id, updates) {
  const idx = plants.findIndex(p => p.id === id);
  if (idx === -1) return null;
  plants[idx] = { ...plants[idx], ...updates };
  return plants[idx];
}

function listCER() {
  return cers.map(cer => ({
    ...cer,
    membri: cer.membri?.map(m => ({ ...m })),
    impianti: cer.impianti?.map(p => ({ ...p }))
  }));
}

function createCER(payload) {
  cers.push(payload);
  return { ...payload };
}

function updateCER(id, updates) {
  const idx = cers.findIndex(c => c.id === id);
  if (idx === -1) return null;
  cers[idx] = { ...cers[idx], ...updates };
  return { ...cers[idx] };
}

function getAllocations() {
  return allocations;
}

function findAllocation(plant_id, period) {
  return allocations.find(a => a.plant_id === plant_id && a.period === period);
}

function ensureAllocation(plant_id, period) {
  let entry = findAllocation(plant_id, period);
  if (!entry) {
    entry = {
      plant_id,
      period,
      energy_shared_kwh: 0,
      weights: { consumers: [], producers: [], prosumers: [] },
      results: null
    };
    allocations.push(entry);
  }
  return entry;
}

function saveAllocationResult(plant_id, period, result) {
  const entry = ensureAllocation(plant_id, period);
  entry.results = result;
  return entry;
}

function listWorkflows(filter = {}) {
  return workflows
    .filter(w => !filter.entity_type || w.entity_type === filter.entity_type)
    .filter(w => !filter.entity_id || w.entity_id === filter.entity_id)
    .map(w => ({ ...w }));
}

function upsertWorkflow({ entity_type, entity_id, phase, status, owner, due_date, notes }) {
  const phaseNumber = Number(phase);
  let entry = workflows.find(w => w.entity_type === entity_type && w.entity_id === entity_id && Number(w.phase) === phaseNumber);
  if (!entry) {
    entry = {
      id: `wf_${entity_type}_${entity_id}_${phaseNumber}`,
      entity_type,
      entity_id,
      phase: phaseNumber,
      status: status || 'todo',
      owner: owner || '',
      due_date: due_date || '',
      notes: notes || '',
      updated_at: new Date().toISOString()
    };
    workflows.push(entry);
  } else {
    if (status) entry.status = status;
    if (owner !== undefined) entry.owner = owner || '';
    if (due_date !== undefined) entry.due_date = due_date || '';
    if (notes !== undefined) entry.notes = notes || '';
    entry.updated_at = new Date().toISOString();
  }
  return { ...entry };
}

function recordProduction(plantId, reading) {
  const list = productionStore.get(plantId) || [];
  list.push(reading);
  productionStore.set(plantId, list);
  return list.slice();
}

function listProduction(plantId) {
  return (productionStore.get(plantId) || []).slice();
}

function setInverterStatus(plantId, status) {
  inverterStatus.set(plantId, status);
}

function getInverterStatus(plantId) {
  const status = inverterStatus.get(plantId);
  return status ? { ...status } : null;
}

function saveBill(meta) {
  billsStore.set(meta.bill_id, meta);
  return { ...meta };
}

function getBill(billId) {
  const bill = billsStore.get(billId);
  return bill ? { ...bill } : null;
}

function listConsumi(clientId) {
  return (consumiStore.get(clientId) || []).map(item => ({ ...item }));
}

function upsertConsumo(clientId, data) {
  const list = consumiStore.get(clientId) || [];
  const idx = list.findIndex(item => item.year === data.year);
  const entry = { ...data, updated_at: new Date().toISOString() };
  if (idx === -1) {
    list.push(entry);
  } else {
    list[idx] = entry;
  }
  consumiStore.set(clientId, list);
  return { ...entry };
}

function listDocs(filter = {}) {
  return docsStore
    .filter(doc => !filter.entity_type || doc.entity_type === filter.entity_type)
    .filter(doc => !filter.entity_id || doc.entity_id === filter.entity_id)
    .filter(doc => filter.phase === undefined || doc.phase === filter.phase)
    .map(doc => ({ ...doc }));
}

function addDoc(doc) {
  docsStore.push(doc);
  return { ...doc };
}

function updateDocStatus(docId, status) {
  const idx = docsStore.findIndex(d => d.doc_id === docId);
  if (idx === -1) return null;
  docsStore[idx] = { ...docsStore[idx], status, updated_at: new Date().toISOString() };
  return { ...docsStore[idx] };
}

module.exports = {
  getPlants,
  getPlantById,
  getInverterKey,
  updatePlant,
  listCER,
  createCER,
  updateCER,
  getAllocations,
  findAllocation,
  ensureAllocation,
  saveAllocationResult,
  listWorkflows,
  upsertWorkflow,
  recordProduction,
  listProduction,
  setInverterStatus,
  getInverterStatus,
  saveBill,
  getBill,
  listConsumi,
  upsertConsumo,
  listDocs,
  addDoc,
  updateDocStatus
};
