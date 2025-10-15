const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { corsHeaders, preflight, json } = require('./_cors');

const MANIFEST_PATH = path.join(process.cwd(), 'config', 'templates', 'models.manifest.json');
const CACHE_MAX_AGE = 300; // 5 minuti

let manifestCache = null;
let manifestEtag = null;
let manifestMtime = 0;

function normalizeManifestEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const code = typeof entry.code === 'string' ? entry.code.trim().toUpperCase() : '';
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const moduleValue = typeof entry.module === 'string' ? entry.module.trim().toLowerCase() : 'cer';
  const file = typeof entry.file === 'string' ? entry.file.trim() : null;
  if (!code || !name || !file) return null;
  return {
    code,
    name,
    module: moduleValue || 'cer',
    file,
    version: Number.isFinite(Number(entry.version)) ? Number(entry.version) : 1,
    status: entry.status === 'active' ? 'active' : 'manifest'
  };
}

function readManifestFile() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('Manifest file not found');
  }

  const stat = fs.statSync(MANIFEST_PATH);
  if (manifestCache && manifestMtime === stat.mtimeMs) {
    return manifestCache;
  }

  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid manifest JSON: ${error.message}`);
  }

  const version = typeof parsed?.version === 'string' ? parsed.version : null;
  const models = Array.isArray(parsed?.models) ? parsed.models : [];
  const normalized = models
    .map((entry) => normalizeManifestEntry(entry))
    .filter(Boolean);

  manifestCache = { version, models: normalized };
  manifestMtime = stat.mtimeMs;
  manifestEtag = `"${crypto.createHash('sha1').update(raw).digest('hex')}"`;
  return manifestCache;
}

function buildResponseBody() {
  const { version, models } = readManifestFile();
  return { ok: true, version, models };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return preflight();
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = buildResponseBody();
    const headers = {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
    };

    if (manifestEtag) {
      headers.ETag = manifestEtag;
      const ifNoneMatch = event.headers?.['if-none-match'] || event.headers?.['If-None-Match'];
      if (ifNoneMatch && ifNoneMatch === manifestEtag) {
        return { statusCode: 304, headers };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(payload),
    };
  } catch (error) {
    console.error('[templates-manifest] error', error);
    return json(500, { ok: false, error: 'MANIFEST_NOT_AVAILABLE', message: error?.message || 'Manifest not available' });
  }
};
