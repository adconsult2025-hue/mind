const { guard } = require('./_safe');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const TEMPLATES = [];

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
  const filtered = TEMPLATES.filter((tpl) => {
    const moduleOk = module ? tpl.module === module : true;
    const statusOk = status ? tpl.status === status : true;
    return moduleOk && statusOk;
  }).sort((a, b) => {
    if (a.code === b.code) return b.version - a.version;
    return a.code.localeCompare(b.code);
  });
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: filtered })
  };
}

async function uploadTemplate(event) {
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
  const existing = TEMPLATES.filter((tpl) => tpl.code === sanitizedCode);
  const version = existing.length ? Math.max(...existing.map((tpl) => tpl.version)) + 1 : 1;
  const ext = extractExtension(fileName) || 'html';
  const id = `${sanitizedCode}-v${version}-${Date.now()}`;
  const url = `https://storage.mock/templates/${sanitizedCode}-v${version}.${ext}`;
  const payload = {
    id,
    name: String(name).trim(),
    code: sanitizedCode,
    module: String(module).trim().toLowerCase(),
    version,
    status: 'inactive',
    placeholders: Array.isArray(placeholders)
      ? placeholders.map((p) => String(p).trim()).filter(Boolean)
      : [],
    content,
    fileName,
    url,
    uploaded_at: new Date().toISOString()
  };
  TEMPLATES.push(payload);
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: sortTemplates(TEMPLATES) })
  };
}

async function activateTemplate(event) {
  const body = safeJson(event.body);
  const { id } = body;
  if (!id) {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'id mancante' } })
    };
  }
  const target = TEMPLATES.find((tpl) => tpl.id === id);
  if (!target) {
    return {
      statusCode: 404,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Template non trovato' } })
    };
  }
  TEMPLATES.forEach((tpl) => {
    if (tpl.code === target.code) {
      tpl.status = tpl.id === id ? 'active' : 'inactive';
    }
  });
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: sortTemplates(TEMPLATES) })
  };
}

function deleteTemplate(id) {
  const index = TEMPLATES.findIndex((tpl) => tpl.id === id);
  if (index === -1) {
    return {
      statusCode: 404,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Template non trovato' } })
    };
  }
  TEMPLATES.splice(index, 1);
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, data: sortTemplates(TEMPLATES) })
  };
}

function safeJson(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function extractExtension(filename) {
  if (!filename) return null;
  const match = String(filename).match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

function sortTemplates(list) {
  return [...list].sort((a, b) => {
    if (a.code === b.code) return b.version - a.version;
    return a.code.localeCompare(b.code);
  });
}
