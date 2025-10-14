#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.SAFE_MODE = 'false';

const projectRoot = path.resolve(__dirname, '..');
const functionsDir = path.join(projectRoot, 'netlify', 'functions');

function walkJsonFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function validateJsonFiles() {
  const jsonFiles = walkJsonFiles(projectRoot, []);
  const results = [];
  for (const file of jsonFiles) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      JSON.parse(raw);
      results.push({ file, ok: true });
    } catch (error) {
      results.push({ file, ok: false, message: error.message });
    }
  }
  return results;
}

function parseResponse(res) {
  if (!res || typeof res !== 'object') {
    return { statusCode: null, body: null };
  }
  let body = null;
  if (typeof res.body === 'string' && res.body.length) {
    try {
      body = JSON.parse(res.body);
    } catch (error) {
      body = null;
    }
  }
  return { statusCode: res.statusCode, body };
}

const handlerCache = new Map();
function loadHandler(moduleName) {
  const resolved = path.join(functionsDir, moduleName);
  if (!handlerCache.has(resolved)) {
    const mod = require(resolved);
    const handler = typeof mod === 'function' ? mod : mod.handler;
    if (typeof handler !== 'function') {
      throw new Error(`Impossibile trovare un handler in ${moduleName}`);
    }
    handlerCache.set(resolved, handler);
  }
  return handlerCache.get(resolved);
}

function defaultContext() {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
    body: null,
    path: '/',
    rawUrl: 'http://localhost/'
  };
}

const context = {};
const cleanups = [];

function ok(details) {
  return { ok: true, details };
}

function fail(message) {
  return { ok: false, message };
}

const scenarios = [
  {
    name: 'health → GET',
    module: 'health.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/health',
      rawUrl: 'https://demo.local/.netlify/functions/health'
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`env=${parsed.body.env}`);
    }
  },
  {
    name: 'templates → GET list',
    module: 'templates.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/templates',
      rawUrl: 'https://demo.local/.netlify/functions/templates'
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (!Array.isArray(parsed.body.data)) return fail('data non è un array');
      context.templates = parsed.body.data;
      return ok(`${parsed.body.data.length} template`);
    }
  },
  {
    name: 'plants → GET elenco',
    module: 'plants.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/plants',
      rawUrl: 'https://demo.local/.netlify/functions/plants',
      queryStringParameters: {}
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (!Array.isArray(parsed.body.data)) return fail('data non è un array');
      context.plants = parsed.body.data;
      return ok(`${parsed.body.data.length} impianti`);
    }
  },
  {
    name: 'plants → GET produzione iniziale',
    module: 'plants.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/plants/plant_001/production',
      rawUrl: 'https://demo.local/.netlify/functions/plants/plant_001/production',
      queryStringParameters: {}
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (parsed.body.data?.plant_id !== 'plant_001') return fail('plant_id inatteso');
      context.plantProduction = parsed.body.data;
      return ok(`letture=${parsed.body.data.readings?.length || 0}`);
    }
  },
  {
    name: 'plants → PUT aggiornamento quote',
    module: 'plants.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'PUT',
      path: '/.netlify/functions/plants/plant_001',
      rawUrl: 'https://demo.local/.netlify/functions/plants/plant_001',
      body: JSON.stringify({ tipologia: 'A', pct_cer: 55, pct_contra: 45 })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (parsed.body.data?.pct_cer !== 55) return fail('pct_cer non aggiornato');
      return ok('quote aggiornate');
    }
  },
  {
    name: 'inverter_webhook → POST lettura',
    module: 'inverter_webhook.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/inverter_webhook',
      rawUrl: 'https://demo.local/.netlify/functions/inverter_webhook',
      headers: { 'x-api-key': 'APIKEY-PLANT-001' },
      body: JSON.stringify({ plant_id: 'plant_001', ts: new Date().toISOString(), kwh: 12.5 })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (parsed.body.data?.plant_id !== 'plant_001') return fail('plant errato');
      return ok(`kWh=${parsed.body.data?.kwh}`);
    }
  },
  {
    name: 'plants → GET produzione dopo webhook',
    module: 'plants.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/plants/plant_001/production',
      rawUrl: 'https://demo.local/.netlify/functions/plants/plant_001/production',
      queryStringParameters: {}
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      const readings = parsed.body.data?.readings || [];
      if (!readings.length) return fail('letture mancanti');
      return ok(`letture=${readings.length}`);
    }
  },
  {
    name: 'allocations → GET singolo impianto',
    module: 'allocations.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/allocations',
      rawUrl: 'https://demo.local/.netlify/functions/allocations?plant_id=plant_001&period=2024-05',
      queryStringParameters: { plant_id: 'plant_001', period: '2024-05' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (!parsed.body.data) return fail('allocation assente');
      return ok('allocation caricata');
    }
  },
  {
    name: 'allocations → POST calcolo CER',
    module: 'allocations.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/allocations',
      rawUrl: 'https://demo.local/.netlify/functions/allocations',
      body: JSON.stringify({ cer_id: 'cer_demo_001', period: '2024-05', confirm: true })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`impianti elaborati=${parsed.body.data?.results?.length || 0}`);
    }
  },
  {
    name: 'cers → GET elenco',
    module: 'cers.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/cers',
      rawUrl: 'https://demo.local/.netlify/functions/cers'
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (!Array.isArray(parsed.body.data)) return fail('data non array');
      return ok(`${parsed.body.data.length} CER`);
    }
  },
  {
    name: 'cers → POST nuova CER',
    module: 'cers.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/cers',
      rawUrl: 'https://demo.local/.netlify/functions/cers',
      body: JSON.stringify({
        id: 'cer_test_001',
        nome: 'CER Test',
        membri: [
          { id: 'm1', nome: 'Alice', ruolo: 'Consumer', pod: 'IT001E0000000001' },
          { id: 'm2', nome: 'Bob', ruolo: 'Producer', pod: 'IT001E0000000002' },
          { id: 'm3', nome: 'Carol', ruolo: 'Consumer', pod: 'IT001E0000000003' }
        ],
        impianti: [{ id: 'plant_001' }]
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.newCerId = parsed.body.data?.id;
      return ok(`creata CER ${context.newCerId}`);
    }
  },
  {
    name: 'workflows → GET per CER',
    module: 'workflows.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/workflows',
      rawUrl: 'https://demo.local/.netlify/functions/workflows?entity_type=cer&entity_id=cer_demo_001',
      queryStringParameters: { entity_type: 'cer', entity_id: 'cer_demo_001' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} workflow`);
    }
  },
  {
    name: 'workflows → POST avanzamento fase',
    module: 'workflows.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/workflows',
      rawUrl: 'https://demo.local/.netlify/functions/workflows',
      body: JSON.stringify({ entity_type: 'cer', entity_id: 'cer_demo_001', phase: 1, status: 'in-review' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`fase ${parsed.body.data?.phase} → ${parsed.body.data?.status}`);
    }
  },
  {
    name: 'workflows-advance → POST',
    module: 'workflows-advance.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/workflows-advance',
      rawUrl: 'https://demo.local/.netlify/functions/workflows-advance',
      body: JSON.stringify({ entity_type: 'cer', entity_id: 'cer_demo_001', phase: 2, status: 'done' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`fase ${parsed.body.data?.phase} stato ${parsed.body.data?.status}`);
    }
  },
  {
    name: 'plant_docs → POST preset produttore',
    module: 'plant_docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/plant_docs/preset',
      rawUrl: 'https://demo.local/.netlify/functions/plant_docs/preset',
      body: JSON.stringify({ plant_id: 'plant_001', type: 'producer' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.plantDocs = parsed.body.data || [];
      return ok(`${context.plantDocs.length} doc impianto`);
    }
  },
  {
    name: 'docs → GET documenti impianto',
    module: 'docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/docs',
      rawUrl: 'https://demo.local/.netlify/functions/docs?entity_type=plant&entity_id=plant_001',
      queryStringParameters: { entity_type: 'plant', entity_id: 'plant_001' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} doc impianto`);
    }
  },
  {
    name: 'docs → POST upload documento impianto',
    module: 'docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/docs/upload',
      rawUrl: 'https://demo.local/.netlify/functions/docs/upload',
      body: JSON.stringify({
        entity_type: 'plant',
        entity_id: 'plant_001',
        phase: 'P1',
        filename: 'verbale.pdf'
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.lastPlantDoc = parsed.body.data?.doc_id || parsed.body.data?.id;
      return ok(`doc ${context.lastPlantDoc}`);
    }
  },
  {
    name: 'docs → POST marcatura documento impianto',
    module: 'docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/docs/mark',
      rawUrl: 'https://demo.local/.netlify/functions/docs/mark',
      body: JSON.stringify({ doc_id: context.lastPlantDoc || context.plantDocs?.[0]?.doc_id, status: 'approved' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok('doc approvato');
    }
  },
  {
    name: 'plant_workflows → GET elenco',
    module: 'plant_workflows.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/plant_workflows',
      rawUrl: 'https://demo.local/.netlify/functions/plant_workflows?plant_id=plant_001',
      queryStringParameters: { plant_id: 'plant_001' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} fasi`);
    }
  },
  {
    name: 'plant_workflows → POST advance P0',
    module: 'plant_workflows.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/plant_workflows/advance',
      rawUrl: 'https://demo.local/.netlify/functions/plant_workflows/advance',
      body: JSON.stringify({ plant_id: 'plant_001', phase: 'P0', status: 'in-review' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok('fase P0 aggiornata');
    }
  },
  {
    name: 'plants-workflows → GET elenco',
    module: 'plants-workflows.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/plants-workflows',
      rawUrl: 'https://demo.local/.netlify/functions/plants-workflows?plant_id=plant_001',
      queryStringParameters: { plant_id: 'plant_001' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} fasi`);
    }
  },
  {
    name: 'plants-workflows → POST avanzamento P0',
    module: 'plants-workflows.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/plants-workflows',
      rawUrl: 'https://demo.local/.netlify/functions/plants-workflows',
      body: JSON.stringify({ plant_id: 'plant_001', phase: 'P0', status: 'in-review' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok('workflow P0 avanzato');
    }
  },
  {
    name: 'plants-docs → POST preset',
    module: 'plants-docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/plants-docs/preset',
      rawUrl: 'https://demo.local/.netlify/functions/plants-docs/preset',
      body: JSON.stringify({ plant_id: 'plant_A01', type: 'producer' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.storeDocs = parsed.body.data;
      return ok(`${parsed.body.data?.length || 0} doc preset store`);
    }
  },
  {
    name: 'plants-docs → GET elenco',
    module: 'plants-docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/plants-docs',
      rawUrl: 'https://demo.local/.netlify/functions/plants-docs?plant_id=plant_A01',
      queryStringParameters: { plant_id: 'plant_A01' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} doc`);
    }
  },
  {
    name: 'docs-upload → POST url firmato',
    module: 'docs-upload.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/docs-upload',
      rawUrl: 'https://demo.local/.netlify/functions/docs-upload',
      body: JSON.stringify({ entity_type: 'cer', entity_id: 'cer_demo_001', filename: 'documento.pdf' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok('url firmato generato');
    }
  },
  {
    name: 'docs → POST upload generico CER',
    module: 'docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/docs/upload',
      rawUrl: 'https://demo.local/.netlify/functions/docs/upload',
      body: JSON.stringify({
        entity_type: 'cer',
        entity_id: 'cer_demo_001',
        phase: 2,
        filename: 'cer-regolamento.pdf'
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.cerDocId = parsed.body.data?.doc_id;
      return ok(`doc CER ${context.cerDocId}`);
    }
  },
  {
    name: 'docs → POST mark documento CER',
    module: 'docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/docs/mark',
      rawUrl: 'https://demo.local/.netlify/functions/docs/mark',
      body: JSON.stringify({ doc_id: context.cerDocId, status: 'approved' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok('doc CER approvato');
    }
  },
  {
    name: 'docs → GET documenti CER',
    module: 'docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/docs',
      rawUrl: 'https://demo.local/.netlify/functions/docs?entity_type=cer&entity_id=cer_demo_001',
      queryStringParameters: { entity_type: 'cer', entity_id: 'cer_demo_001' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} doc CER`);
    }
  },
  {
    name: 'bills → POST upload',
    module: 'bills.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/bills/upload',
      rawUrl: 'https://demo.local/.netlify/functions/bills/upload',
      body: JSON.stringify({ client_id: 'client_demo', filename: 'bolletta.pdf' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.billId = parsed.body.data?.bill_id;
      return ok(`bill ${context.billId}`);
    }
  },
  {
    name: 'bills → POST parse',
    module: 'bills.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/bills/parse',
      rawUrl: 'https://demo.local/.netlify/functions/bills/parse',
      body: JSON.stringify({ bill_id: context.billId })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`pod=${parsed.body.data?.pod}`);
    }
  },
  {
    name: 'consumi → POST caricamento',
    module: 'consumi.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/consumi',
      rawUrl: 'https://demo.local/.netlify/functions/consumi',
      body: JSON.stringify({
        client_id: 'client_demo',
        pod_id: 'IT001E1234567890',
        period: '2024-05',
        year: 2024,
        kwh_f1: 100,
        kwh_f2: 80,
        kwh_f3: 60
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.consumoId = parsed.body.data?.id;
      return ok(`consumo ${context.consumoId}`);
    }
  },
  {
    name: 'consumi → GET storico',
    module: 'consumi.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/consumi',
      rawUrl: 'https://demo.local/.netlify/functions/consumi?client_id=client_demo',
      queryStringParameters: { client_id: 'client_demo' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      if (!(parsed.body.data?.length > 0)) return fail('nessun consumo');
      return ok(`${parsed.body.data.length} periodi`);
    }
  },
  {
    name: 'logs → GET audit consumi',
    module: 'logs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/logs',
      rawUrl: 'https://demo.local/.netlify/functions/logs?entity=client&id=client_demo',
      queryStringParameters: { entity: 'client', id: 'client_demo' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} log`);
    }
  },
  {
    name: 'ct3_cases → POST creazione',
    module: 'ct3_cases.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/ct3_cases',
      rawUrl: 'https://demo.local/.netlify/functions/ct3_cases',
      body: JSON.stringify({
        client_id: 'client_demo',
        subject_type: 'Privato',
        building: { existing: true, type: ['residenziale'] },
        intervention: { type: 'pompe_calore', subtype: 'aria_acqua', size_kw: 10 },
        incentive_params: { pct: 40, years: 3 }
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      context.ct3CaseId = parsed.body.data?.id;
      return ok(`case ${context.ct3CaseId}`);
    }
  },
  {
    name: 'ct3_cases → GET dettaglio',
    module: 'ct3_cases.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: `/.netlify/functions/ct3_cases/${context.ct3CaseId}`,
      rawUrl: `https://demo.local/.netlify/functions/ct3_cases/${context.ct3CaseId}`
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok('case recuperata');
    }
  },
  {
    name: 'ct3_cases → POST submit',
    module: 'ct3_cases.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: `/.netlify/functions/ct3_cases/${context.ct3CaseId}/submit`,
      rawUrl: `https://demo.local/.netlify/functions/ct3_cases/${context.ct3CaseId}/submit`,
      body: JSON.stringify({})
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`status=${parsed.body.data?.status}`);
    }
  },
  {
    name: 'ct3_cases → POST cambio stato',
    module: 'ct3_cases.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: `/.netlify/functions/ct3_cases/${context.ct3CaseId}/status`,
      rawUrl: `https://demo.local/.netlify/functions/ct3_cases/${context.ct3CaseId}/status`,
      body: JSON.stringify({ status: 'eligible' })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`status=${parsed.body.data?.status}`);
    }
  },
  {
    name: 'ct3_docs → GET configurazione',
    module: 'ct3_docs.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/ct3_docs',
      rawUrl: 'https://demo.local/.netlify/functions/ct3_docs?subject_type=Privato&intervention_type=pompe_calore',
      queryStringParameters: { subject_type: 'Privato', intervention_type: 'pompe_calore' }
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.documents?.length || 0} doc CT3`);
    }
  },
  {
    name: 'ct3_rules → GET catalogo',
    module: 'ct3_rules.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'GET',
      path: '/.netlify/functions/ct3_rules/catalog',
      rawUrl: 'https://demo.local/.netlify/functions/ct3_rules/catalog'
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`${parsed.body.data?.length || 0} tecnologie`);
    }
  },
  {
    name: 'ct3_rules → POST check ammissibilità',
    module: 'ct3_rules.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/ct3_rules/check',
      rawUrl: 'https://demo.local/.netlify/functions/ct3_rules/check',
      body: JSON.stringify({
        case: {
          client_id: 'client_demo',
          subject_type: 'Privato',
          building: { existing: true },
          intervention: { type: 'pompe_calore', subtype: 'aria_acqua', size_kw: 10 },
          incentive_params: { pct: 40, years: 3 }
        }
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      return ok(`eligible=${parsed.body.data?.eligible}`);
    }
  },
  {
    name: 'templates → POST upload',
    module: 'templates.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/templates/upload',
      rawUrl: 'https://demo.local/.netlify/functions/templates/upload',
      body: JSON.stringify({
        name: 'Template Test',
        code: 'TMP-TEST',
        module: 'crm',
        placeholders: ['cliente.nome'],
        content: '<p>Test</p>',
        fileName: 'template.html'
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      const dataFile = path.join(functionsDir, '..', 'data', 'templates.json');
      const uploadsDir = path.join(functionsDir, '..', 'data', 'templates_uploads');
      cleanups.push(() => {
        try {
          fs.rmSync(dataFile, { force: true });
        } catch (err) {
          // ignore
        }
        try {
          fs.rmSync(uploadsDir, { recursive: true, force: true });
        } catch (err) {
          // ignore
        }
      });
      return ok('template caricato');
    }
  },
  {
    name: 'templates → POST upload con file',
    module: 'templates.js',
    prepare: () => ({
      ...defaultContext(),
      httpMethod: 'POST',
      path: '/.netlify/functions/templates/upload',
      rawUrl: 'https://demo.local/.netlify/functions/templates/upload',
      body: JSON.stringify({
        name: 'Template File',
        code: 'TMP-FILE',
        module: 'crm',
        placeholders: ['cliente.nome'],
        content: '<p>File</p>',
        fileName: 'template.html',
        fileContent: Buffer.from('<html></html>', 'utf8').toString('base64'),
        fileType: 'text/html',
        fileSize: Buffer.byteLength('<html></html>'),
      })
    }),
    validate: (res) => {
      const parsed = parseResponse(res);
      if (parsed.statusCode !== 200) return fail(`status ${parsed.statusCode}`);
      if (!parsed.body?.ok) return fail('flag ok mancante');
      const created = (parsed.body.data || []).find((tpl) => tpl.code === 'TMP-FILE');
      if (!created) return fail('template non trovato in risposta');
      if (!created.file_meta) return fail('metadati file mancanti');
      if (!created.file_meta.path) return fail('path file mancante');
      if (!created.file_meta.size) return fail('size file mancante');
      const dataFile = path.join(functionsDir, '..', 'data', 'templates.json');
      const uploadsDir = path.join(functionsDir, '..', 'data', 'templates_uploads');
      const tmpUploadsDir = path.join(os.tmpdir(), 'certouser_templates_uploads');
      cleanups.push(() => {
        try {
          fs.rmSync(dataFile, { force: true });
        } catch (err) {
          // ignore
        }
        try {
          fs.rmSync(uploadsDir, { recursive: true, force: true });
        } catch (err) {
          // ignore
        }
        try {
          fs.rmSync(tmpUploadsDir, { recursive: true, force: true });
        } catch (err) {
          // ignore
        }
      });
      return ok('template con file caricato');
    }
  }
];

async function runScenario(scenario) {
  const handler = loadHandler(scenario.module);
  const event = typeof scenario.prepare === 'function' ? scenario.prepare() : defaultContext();
  if (!event.headers) event.headers = {};
  if (!event.queryStringParameters) event.queryStringParameters = {};
  const response = await handler(event, {});
  return scenario.validate(response);
}

async function main() {
  const jsonResults = validateJsonFiles();
  const jsonFailures = jsonResults.filter((item) => !item.ok);

  const apiResults = [];
  for (const scenario of scenarios) {
    try {
      const result = await runScenario(scenario);
      apiResults.push({ scenario: scenario.name, ...result });
    } catch (error) {
      apiResults.push({ scenario: scenario.name, ok: false, message: error.message });
    }
  }

  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (err) {
      // ignore cleanup errors
    }
  }

  const totalFailures = jsonFailures.length + apiResults.filter((item) => !item.ok).length;

  console.log('JSON files check:');
  jsonResults.forEach((item) => {
    if (item.ok) {
      console.log(`  ✓ ${path.relative(projectRoot, item.file)}`);
    } else {
      console.log(`  ✗ ${path.relative(projectRoot, item.file)} → ${item.message}`);
    }
  });

  console.log('\nAPI/function check:');
  apiResults.forEach((item) => {
    if (item.ok) {
      console.log(`  ✓ ${item.scenario}${item.details ? ` → ${item.details}` : ''}`);
    } else {
      console.log(`  ✗ ${item.scenario} → ${item.message}`);
    }
  });

  if (totalFailures > 0) {
    console.error(`\nTotale errori: ${totalFailures}`);
    process.exit(1);
  } else {
    console.log('\nTutti i controlli sono passati.');
  }
}

main().catch((err) => {
  console.error('Errore esecuzione self-check:', err);
  process.exit(1);
});
