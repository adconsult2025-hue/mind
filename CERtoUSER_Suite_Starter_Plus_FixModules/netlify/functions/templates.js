const fs = require('fs');
const path = require('path');

const { preflight, corsHeaders, json } = require('./_cors');
const { parseBody } = require('./_http');

const DATA_PATH = path.join(__dirname, '../data/templates.json');
const UPLOADS_DIR = path.join(__dirname, '../data/templates_uploads');

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, '[]');
  }
}

function loadTemplates() {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[templates] lettura data file fallita:', error);
    return [];
  }
}

function saveTemplates(list) {
  try {
    ensureDataFile();
    fs.writeFileSync(DATA_PATH, JSON.stringify(list, null, 2));
  } catch (error) {
    console.error('[templates] salvataggio data file fallito:', error);
  }
}

function sanitizeFileName(name, fallback) {
  if (typeof name !== 'string' || !name.trim()) return fallback;
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    || fallback;
}

function persistUpload({ fileContent, fileName, fileType }) {
  if (!fileContent) return null;

  try {
    const buffer = Buffer.from(fileContent, 'base64');
    const safeName = sanitizeFileName(fileName, `template_${Date.now()}.bin`);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const targetPath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(targetPath, buffer);

    const relativePath = path.relative(path.join(__dirname, '..'), targetPath).replace(/\\/g, '/');

    return {
      original_name: fileName || safeName,
      path: relativePath,
      size: buffer.length,
      type: fileType || 'application/octet-stream',
      storage_scope: 'local'
    };
  } catch (error) {
    console.error('[templates] salvataggio file fallito:', error);
    return null;
  }
}

function buildTemplatePayload(body) {
  const now = new Date().toISOString();
  const code = String(body.code || body.slug || body.name || `TPL-${Date.now()}`)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');

  const fileMeta = persistUpload({
    fileContent: body.fileContent || body.file,
    fileName: body.fileName || body.filename,
    fileType: body.fileType
  });

  const entry = {
    id: body.id || code.toLowerCase(),
    name: body.name || body.title || code,
    code,
    module: (body.module || 'cer').toString().trim().toLowerCase() || 'cer',
    status: body.status || 'active',
    version: Number(body.version) || 1,
    placeholders: Array.isArray(body.placeholders) ? body.placeholders : [],
    content: body.content || body.content_text || null,
    fileName: body.fileName || body.filename || null,
    uploaded_at: now,
  };

  if (fileMeta) {
    entry.file_meta = fileMeta;
    entry.fileName = entry.fileName || fileMeta.original_name;
    entry.url = `/${fileMeta.path}`;
  }

  return entry;
}

function listResponse() {
  const templates = loadTemplates();
  return json(200, { ok: true, data: templates });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  if (event.httpMethod === 'GET') {
    return listResponse();
  }

  if (event.httpMethod === 'POST') {
    const body = parseBody(event) || {};
    const templates = loadTemplates();
    const payload = buildTemplatePayload(body);

    const existingIdx = templates.findIndex((tpl) => tpl.code === payload.code || tpl.id === payload.id);
    if (existingIdx >= 0) {
      templates[existingIdx] = { ...templates[existingIdx], ...payload, uploaded_at: new Date().toISOString() };
    } else {
      templates.unshift(payload);
    }

    saveTemplates(templates);
    return json(200, { ok: true, data: templates });
  }

  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Operazione non supportata' } })
  };
};

