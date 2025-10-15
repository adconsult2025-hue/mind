const { clientPods } = require('./_store');

const clients = [
  {
    id: 'client_demo_001',
    nome: 'Mario Rossi',
    tipo: 'Privato',
    cabina: 'CP-001',
    comune: 'Frosinone',
    email: 'mario.rossi@example.com',
    tel: '+39 333 1234567',
    ruolo: 'Consumer',
    pods: ['IT001E1234567890']
  },
  {
    id: 'client_demo_002',
    nome: 'Solaria S.r.l.',
    tipo: 'P.IVA',
    cabina: 'CP-001',
    comune: 'Frosinone',
    email: 'info@solaria.it',
    tel: '+39 0775 222333',
    ruolo: 'Produttore',
    pods: ['IT001E9876543210']
  },
  {
    id: 'client_demo_003',
    nome: 'Lucia Bianchi',
    tipo: 'Privato',
    cabina: 'CP-045',
    comune: 'Sora',
    email: 'lucia.bianchi@example.com',
    tel: '+39 320 5558899',
    ruolo: 'Prosumer',
    pods: ['IT003E4567981230']
  },
  {
    id: 'client_demo_004',
    nome: 'Condominio Aurora',
    tipo: 'Condominio',
    cabina: 'CP-045',
    comune: 'Sora',
    email: 'amministratore@aurora.it',
    tel: '+39 0776 445566',
    ruolo: 'Consumer',
    pods: ['IT003E9988776655']
  },
  {
    id: 'client_demo_005',
    nome: 'Verdi Impianti',
    tipo: 'P.IVA',
    cabina: 'CP-088',
    comune: 'Cassino',
    email: 'contatti@verdiimpianti.it',
    tel: '+39 0776 889977',
    ruolo: 'Produttore',
    pods: ['IT007E1122334455']
  }
];

function normalizePod(value) {
  if (!value) return null;
  return String(value).toUpperCase().replace(/\s+/g, '');
}

function ensureClientRegistry(client) {
  if (!client || !client.id) return;
  const podSet = new Set();
  if (Array.isArray(client.pods)) {
    client.pods.forEach((pod) => {
      const normalized = normalizePod(pod);
      if (normalized) podSet.add(normalized);
    });
  }
  if (!podSet.size) {
    const fallback = normalizePod(client.pod);
    if (fallback) podSet.add(fallback);
  }
  if (podSet.size) {
    clientPods.set(client.id, podSet);
  }
}

clients.forEach((client) => {
  const pods = Array.isArray(client.pods) ? client.pods : [];
  const normalizedPods = pods
    .map(normalizePod)
    .filter(Boolean);
  client.pods = normalizedPods;
  client.pod = normalizedPods[0] || '';
  ensureClientRegistry(client);
});

function cloneClient(client) {
  return {
    ...client,
    pods: Array.isArray(client.pods) ? [...client.pods] : []
  };
}

function collectPods(...sources) {
  const set = new Set();
  sources.forEach((source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach((pod) => {
        const normalized = normalizePod(pod);
        if (normalized) set.add(normalized);
      });
      return;
    }
    if (Array.isArray(source.pods)) {
      source.pods.forEach((pod) => {
        const normalized = normalizePod(pod);
        if (normalized) set.add(normalized);
      });
    }
    const direct = normalizePod(source.pod || source);
    if (direct) set.add(direct);
  });
  return Array.from(set);
}

function normalizeClientFields(base = {}, overrides = {}) {
  const pods = collectPods(base, overrides);
  return {
    nome: overrides.nome ?? overrides.name ?? base.nome ?? base.name ?? 'Cliente',
    tipo: overrides.tipo ?? overrides.subject_type ?? base.tipo ?? base.subject_type ?? 'Privato',
    cabina: overrides.cabina ?? overrides.cabina_primaria ?? overrides.cp ?? base.cabina ?? base.cabina_primaria ?? base.cp ?? '',
    comune: overrides.comune ?? overrides.city ?? base.comune ?? base.city ?? '',
    email: overrides.email ?? overrides.mail ?? base.email ?? base.mail ?? '',
    tel: overrides.tel ?? overrides.telefono ?? overrides.phone ?? base.tel ?? base.telefono ?? base.phone ?? '',
    ruolo: overrides.ruolo ?? overrides.role ?? base.ruolo ?? base.role ?? 'Consumer',
    cf: overrides.cf ?? overrides.codice_fiscale ?? overrides.piva ?? base.cf ?? base.codice_fiscale ?? base.piva ?? '',
    pods,
    pod: pods[0] || ''
  };
}

function listClients() {
  return clients.map(cloneClient);
}

function findClient(id) {
  return clients.find((client) => client.id === id) || null;
}

function createClient(payload = {}) {
  const id = String(payload.id || `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const fields = normalizeClientFields({}, payload);
  const client = { id, ...fields };
  clients.push(client);
  ensureClientRegistry(client);
  return cloneClient(client);
}

function updateClient(id, updates = {}) {
  const idx = clients.findIndex((client) => client.id === id);
  if (idx === -1) return null;
  const existing = clients[idx];
  const fields = normalizeClientFields(existing, updates);
  const updated = { id: existing.id, ...fields };
  clients[idx] = updated;
  ensureClientRegistry(updated);
  return cloneClient(updated);
}

function deleteClient(id) {
  const idx = clients.findIndex((client) => client.id === id);
  if (idx === -1) return false;
  clients.splice(idx, 1);
  clientPods.delete(id);
  return true;
}

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
      { id: 'mem_001', nome: 'Mario Rossi', ruolo: 'Consumer', pod: 'IT001E1234567890', comune: 'Frosinone', cabina: 'CP-001' },
      { id: 'mem_p001', nome: 'Solar Srl', ruolo: 'Produttore', pod: 'IT001E9876543210', comune: 'Frosinone', cabina: 'CP-001' },
      { id: 'mem_ps001', nome: 'Lucia Bianchi', ruolo: 'Prosumer', pod: 'IT001E1234598765', comune: 'Frosinone', cabina: 'CP-001' }
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
      { id: 'mem_101', nome: 'Condominio Aurora', ruolo: 'Consumer', pod: 'IT003E9988776655', comune: 'Sora', cabina: 'CP-045' },
      { id: 'mem_p101', nome: 'Verdi Impianti', ruolo: 'Produttore', pod: 'IT003E1234987650', comune: 'Sora', cabina: 'CP-045' },
      { id: 'mem_102', nome: 'Cooperativa Sole', ruolo: 'Consumer', pod: 'IT003E4567981230', comune: 'Sora', cabina: 'CP-045' }
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
  listClients,
  findClient,
  createClient,
  updateClient,
  deleteClient,
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
