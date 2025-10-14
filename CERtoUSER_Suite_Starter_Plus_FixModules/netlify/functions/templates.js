const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SAFE_MODE = String(process.env.SAFE_MODE || '').toLowerCase() === 'true';

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
});

const ALLOWED_FILTER_MODULES = new Set(['cer', 'crm', 'ct3', 'contratti']);

const templateSorter = (a, b) => {
  if (a.code === b.code) return Number(b.version || 0) - Number(a.version || 0);
  return String(a.code || '').localeCompare(String(b.code || ''));
};

const DATA_FILE = path.join(__dirname, '../data/templates.json');
const SEED_FILE = path.join(__dirname, 'templates.seed.json');
const DATA_DIR = path.dirname(DATA_FILE);
const UPLOADS_DIR = path.join(DATA_DIR, 'templates_uploads');
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB limite prudenziale

const loadTemplatesFromFile = (filePath, { label } = {}) => {
  if (!fs.existsSync(filePath)) {
    return [];
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
    return [];
  }
};

const readSourceTemplates = () => {
  const persisted = loadTemplatesFromFile(DATA_FILE, { label: 'persisted' });
  if (persisted.length) return persisted;
  const seeded = loadTemplatesFromFile(SEED_FILE, { label: 'seed' });
  if (seeded.length) return seeded;
  return [];
};

async function readTemplates({ module }) {
  const source = readSourceTemplates();
  const filtered = module
    ? source.filter((t) => String(t.module).toLowerCase() === String(module).toLowerCase())
    : source;
  return sortTemplates(filtered).map(cloneTemplate);
}

const loadTemplates = () => sortTemplates(readSourceTemplates()).map(cloneTemplate);

let templatesCache = loadTemplates();

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const ensureUploadsDir = () => {
  ensureDataDir();
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

const getPathSuffix = (eventPath = '') => {
  if (!eventPath) return '';
  const normalized = eventPath.startsWith('/') ? eventPath : `/${eventPath}`;
  return normalized
    .replace(/^\/\.netlify\/functions\/templates(?=\/|$)/, '')
    .replace(/^\/api\/templates(?=\/|$)/, '')
    .replace(/^\/+/, '/');
};

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: headers(), body: '' };
  }

  const pathSuffix = getPathSuffix(event.path || '');

  if (event.httpMethod === 'GET' && (!pathSuffix || pathSuffix === '' || pathSuffix === '/')) {
    try {
      const params = event.queryStringParameters || {};
      const moduleParam = typeof params.module === 'string' ? params.module.trim().toLowerCase() : null;
      const invalidModule = moduleParam && !ALLOWED_FILTER_MODULES.has(moduleParam);
      const moduleFilter = moduleParam && !invalidModule ? moduleParam : null;
      const data = invalidModule ? [] : await readTemplates({ module: moduleFilter });
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
    } catch (err) {
      return {
        statusCode: 500,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } })
      };
    }
  }

  if (event.httpMethod === 'POST') {
    if (SAFE_MODE) {
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, dryRun: true, message: 'SAFE_MODE: operazione simulata (nessun salvataggio eseguito).' })
      };
    }

    try {
      if (pathSuffix === '/upload') {
        return uploadTemplate(event);
      }

      if (pathSuffix === '/activate') {
        return activateTemplate(event);
      }

      if (pathSuffix.startsWith('/')) {
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
  }

  if (event.httpMethod === 'DELETE' && pathSuffix.startsWith('/')) {
    if (SAFE_MODE) {
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, dryRun: true, message: 'SAFE_MODE: operazione simulata (nessun salvataggio eseguito).' })
      };
    }

    try {
      const id = decodeURIComponent(pathSuffix.slice(1));
      return deleteTemplate(id);
    } catch (err) {
      return {
        statusCode: 500,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
      };
    }
  }

  return {
    statusCode: 405,
    headers: headers(),
    body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } })
  };
};

async function uploadTemplate(event) {
  const templates = refreshTemplates();
  const body = safeJson(event.body);
  const {
    name,
    code,
    module,
    placeholders = [],
    content = '',
    fileName = null,
    fileContent = null,
    fileType = null,
    fileSize = null,
  } = body;
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
  let fileMeta = null;

  if (fileContent) {
    try {
      fileMeta = persistUploadedFile({
        id,
        fileName,
        ext,
        fileContent,
        fileType,
        fileSize,
      });
    } catch (error) {
      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'INVALID_FILE', message: error.message || 'File non valido' } })
      };
    }
  }
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
    file_meta: fileMeta,
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

function persistUploadedFile({ id, fileName, ext, fileContent, fileType, fileSize }) {
  const parsed = parseBase64Content(fileContent);
  if (!parsed) {
    throw new Error('Contenuto file non valido o vuoto');
  }
  const { buffer, mimeType } = parsed;
  if (!buffer?.length) {
    throw new Error('Il file risulta vuoto');
  }
  if (buffer.length > MAX_UPLOAD_SIZE) {
    throw new Error(`File troppo grande (max ${Math.round(MAX_UPLOAD_SIZE / (1024 * 1024))}MB)`);
  }
  if (fileSize && Number.isFinite(Number(fileSize))) {
    const declared = Number(fileSize);
    const delta = Math.abs(declared - buffer.length);
    const tolerance = Math.max(32, declared * 0.1);
    if (delta > tolerance) {
      throw new Error('Dimensione file incoerente con i metadati inviati');
    }
  }
  ensureUploadsDir();
  const safeId = String(id || `template-${Date.now()}`);
  const safeExt = ext ? String(ext).replace(/[^a-zA-Z0-9]/g, '') || 'bin' : 'bin';
  const baseName = `${safeId}.${safeExt}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetPath = path.join(UPLOADS_DIR, baseName);
  fs.writeFileSync(targetPath, buffer);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    original_name: fileName ? String(fileName) : null,
    path: path.relative(DATA_DIR, targetPath).replace(/\\/g, '/'),
    size: buffer.length,
    type: fileType || mimeType || 'application/octet-stream',
    checksum,
    stored_at: new Date().toISOString()
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
  const fileMeta = normalizeFileMeta(raw.file_meta || raw.fileMeta || null, raw.fileName || raw.file_name || null);
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
    file_meta: fileMeta,
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

function parseBase64Content(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dataUrlMatch = trimmed.match(/^data:([^;,]+)?;base64,(.+)$/);
  let base64 = trimmed;
  let mimeType = null;
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || null;
    base64 = dataUrlMatch[2];
  }
  const sanitized = base64.replace(/\s+/g, '');
  if (!sanitized) return null;
  let buffer;
  try {
    buffer = Buffer.from(sanitized, 'base64');
  } catch (error) {
    throw new Error('Impossibile decodificare il contenuto del file');
  }
  if (!buffer.length) {
    return null;
  }
  return { buffer, mimeType };
}

function normalizeFileMeta(rawMeta, fallbackName) {
  if (!rawMeta || typeof rawMeta !== 'object') return null;
  const originalName = rawMeta.original_name
    ? String(rawMeta.original_name).trim()
    : fallbackName
      ? String(fallbackName).trim()
      : null;
  const pathValue = rawMeta.path ? String(rawMeta.path).trim() : null;
  const typeValue = rawMeta.type ? String(rawMeta.type).trim() : null;
  const checksumValue = rawMeta.checksum ? String(rawMeta.checksum).trim() : null;
  const sizeValue = Number(rawMeta.size);
  const size = Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : null;
  const storedAtValue = rawMeta.stored_at ? new Date(rawMeta.stored_at) : null;
  const storedAt = storedAtValue && !Number.isNaN(storedAtValue.valueOf())
    ? storedAtValue.toISOString()
    : null;
  if (!originalName && !pathValue && !typeValue && !checksumValue && !size && !storedAt) {
    return null;
  }
  return {
    original_name: originalName,
    path: pathValue,
    type: typeValue,
    checksum: checksumValue,
    size,
    stored_at: storedAt || new Date().toISOString()
  };
}

function sortTemplates(list) {
  return [...list].sort(templateSorter);
}
