const plants = [
  {
    id: 'plant_001',
    cer_id: 'cer_demo_001',
    name: 'Impianto Nord',
    pod_id_produttore: 'IT001123456789',
    tipologia: 'A',
    pct_cer: 45,
    pct_contra: 55
  },
  {
    id: 'plant_002',
    cer_id: 'cer_demo_001',
    name: 'Impianto Sud',
    pod_id_produttore: 'IT009998877665',
    tipologia: 'B',
    pct_cer: 50,
    pct_contra: 50
  },
  {
    id: 'plant_003',
    cer_id: 'cer_demo_002',
    name: 'Impianto Collina',
    pod_id_produttore: 'IT005552223334',
    tipologia: 'A',
    pct_cer: 60,
    pct_contra: 40
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

function getPlants() {
  return plants;
}

function updatePlant(id, updates) {
  const idx = plants.findIndex(p => p.id === id);
  if (idx === -1) return null;
  plants[idx] = { ...plants[idx], ...updates };
  return plants[idx];
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

module.exports = {
  getPlants,
  updatePlant,
  getAllocations,
  findAllocation,
  ensureAllocation,
  saveAllocationResult
};
