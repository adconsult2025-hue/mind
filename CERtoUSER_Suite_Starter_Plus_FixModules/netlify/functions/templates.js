const fs = require('fs');
const path = require('path');

const { guard } = require('./_safe');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const templateSorter = (a, b) => {
  if (a.code === b.code) return Number(b.version || 0) - Number(a.version || 0);
  return String(a.code || '').localeCompare(String(b.code || ''));
};

const DATA_FILE = path.join(__dirname, '../data/templates.json');
const SEED_FILE = path.join(__dirname, 'templates.seed.json');
const DATA_DIR = path.dirname(DATA_FILE);

const loadTemplatesFromFile = (filePath, { label } = {}) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Formato non valido: atteso array');
    }
    return parsed
      .map(normalizeTemplate)
      .filter(Boolean)
      .sort(templateSorter);
  } catch (error) {
    const origin = label ? `${label} ` : '';
    console.warn(`[templates] ${origin}non disponibile o non valido:`, error?.message || error);
    return null;
  }
};

const loadTemplates = () => {
  const persisted = loadTemplatesFromFile(DATA_FILE, { label: 'persistenza' });
  if (persisted) return persisted;
  const seeded = loadTemplatesFromFile(SEED_FILE, { label: 'seed' });
  if (seeded) return seeded;
  return [];
};

let templatesCache = loadTemplates();

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const persistTemplates = () => {
  try {
    ensureDataDir();
    const payload = JSON.stringify(sortTemplates(templatesCache).map(cloneTemplate), null, 2);
    fs.writeFileSync(DATA_FILE, payload, 'utf8');
  } catch (error) {
    console.error('[templates] impossibile salvare i dati:', error?.message || error);
    throw new Error('Salvataggio non riuscito');
  }
};

const refreshTemplates = () => {
  templatesCache = loadTemplates();
  return templatesCache;
};

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  const pathSuffix = event.path.replace(/^\/\.netlify\/functions\/templates/, '');

  try {
    if (event.httpMethod === 'GET' && (!pathSuffix || pathSuffix === '' || pathSuffix === '/')) {
      return listTemplates(event);
    }

    if (event.httpMethod === 'POST' && pathSuffix === '/upload') {
      return uploadTemplate(event);
    }

    if (event.httpMethod === 'POST' && pathSuffix === '/activate') {
      return activateTemplate(event);
    }

    if (event.httpMethod === 'DELETE' && pathSuffix.startsWith('/')) {
      const id = decodeURIComponent(pathSuffix.slice(1));
      return deleteTemplate(id);
    }

    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Endpoint non supportato' } })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});

function listTemplates(event) {
  const { module, status } = event.queryStringParameters || {};
  const templates = refreshTemplates();
  const filtered = templates.filter((tpl) => {
    const moduleOk = module ? tpl.module === module : true;
    const statusOk = status ? tpl.status === status : true;
    return moduleOk && statusOk;
  });
  const sorted = sortTemplates(filtered).map(cloneTemplate);
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: sorted })
  };
}

async function uploadTemplate(event) {
  const templates = refreshTemplates();
  const body = safeJson(event.body);
  const { name, code, module, placeholders = [], content = '', fileName = null } = body;
  if (!name || !code || !module) {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'name, code e module sono obbligatori' } })
    };
  }

  const sanitizedCode = String(code).trim().toUpperCase();
  const existing = templates.filter((tpl) => tpl.code === sanitizedCode);
  const version = existing.length ? Math.max(...existing.map((tpl) => tpl.version)) + 1 : 1;
  const ext = extractExtension(fileName) || 'html';
  const id = `${sanitizedCode}-v${version}-${Date.now()}`;
  const url = `https://storage.mock/templates/${sanitizedCode}-v${version}.${ext}`;
  const normalized = normalizeTemplate({
    id,
    name,
    code: sanitizedCode,
    module,
    version,
    status: 'inactive',
    placeholders,
    content,
    fileName,
    url,
    uploaded_at: new Date().toISOString()
  });
  if (!normalized) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: 'Template non valido' } })
    };
  }
  const nextTemplates = [...templates, normalized];
  try {
    templatesCache = nextTemplates;
    persistTemplates();
  } catch (error) {
    refreshTemplates();
    throw error;
  }
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: sortTemplates(templatesCache).map(cloneTemplate) })
  };
}

async function activateTemplate(event) {
  const templates = refreshTemplates();
  const body = safeJson(event.body);
  const { id } = body;
  if (!id) {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'id mancante' } })
    };
  }
  const target = templates.find((tpl) => tpl.id === id);
  if (!target) {
    return {
      statusCode: 404,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Template non trovato' } })
    };
  }
  const nextTemplates = templates.map((tpl) => {
    if (tpl.code !== target.code) return tpl;
    return { ...tpl, status: tpl.id === id ? 'active' : 'inactive' };
  });
  try {
    templatesCache = nextTemplates;
    persistTemplates();
  } catch (error) {
    refreshTemplates();
    throw error;
  }
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: sortTemplates(templatesCache).map(cloneTemplate) })
  };
}

function deleteTemplate(id) {
  const templates = refreshTemplates();
  const index = templates.findIndex((tpl) => tpl.id === id);
  if (index === -1) {
    return {
      statusCode: 404,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Template non trovato' } })
    };
  }
  const nextTemplates = templates.filter((tpl) => tpl.id !== id);
  try {
    templatesCache = nextTemplates;
    persistTemplates();
  } catch (error) {
    refreshTemplates();
    throw error;
  }
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: sortTemplates(templatesCache).map(cloneTemplate) })
  };
}

function safeJson(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function normalizeTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name ? String(raw.name).trim() : '';
  const code = raw.code ? String(raw.code).trim().toUpperCase() : '';
  const module = raw.module ? String(raw.module).trim().toLowerCase() : 'generico';
  if (!name || !code) return null;
  const version = Number.parseInt(raw.version, 10) || 1;
  const placeholders = Array.isArray(raw.placeholders)
    ? raw.placeholders.map((p) => String(p).trim()).filter(Boolean)
    : [];
  return {
    id: raw.id ? String(raw.id) : `${code}-v${version}-${Date.now()}`,
    name,
    code,
    module,
    version,
    status: raw.status === 'active' ? 'active' : 'inactive',
    placeholders,
    content: raw.content ? String(raw.content) : '',
    fileName: raw.fileName ? String(raw.fileName) : null,
    url: raw.url ? String(raw.url) : null,
    uploaded_at: raw.uploaded_at ? String(raw.uploaded_at) : new Date().toISOString()
  };
}

function cloneTemplate(tpl) {
  return JSON.parse(JSON.stringify(tpl));
}

function extractExtension(filename) {
  if (!filename) return null;
  const match = String(filename).match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

function sortTemplates(list) {
  return [...list].sort(templateSorter);
}
