const { Client } = require('pg');
const { corsHeaders, preflight, json } = require('./_cors');
const { requireRole } = require('./_auth');

const CONNECTION_STRING = process.env.NEON_DATABASE_URL;

function createClient() {
  if (!CONNECTION_STRING) throw new Error('NEON_DATABASE_URL not configured');
  const cfg = { connectionString: CONNECTION_STRING };
  if ((process.env.PGSSLMODE || 'require') === 'require') cfg.ssl = { rejectUnauthorized: false };
  return new Client(cfg);
}

async function withClient(cb) {
  const c = createClient();
  await c.connect();
  try {
    return await cb(c);
  } finally {
    await c.end();
  }
}

function parseBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
}

function coerceMetadata(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const gate = requireRole(event, ['admin', 'superadmin']);
  if (!gate.ok) return { statusCode: gate.statusCode, headers: corsHeaders, body: gate.msg };

  if (event.httpMethod === 'GET') {
    const cerId = (event.queryStringParameters || {}).cerId;
    if (!cerId) return json(400, { ok: false, error: 'MISSING cerId' });
    const rows = await withClient((db) =>
      db
        .query('select * from cer_documents where cer_id=$1 order by uploaded_at desc', [cerId])
        .then((r) => r.rows)
    );
    return json(200, rows);
  }

  if (event.httpMethod === 'POST') {
    const b = parseBody(event.body);
    const q = `insert into cer_documents (cer_id, phase, doc_type, filename, url, status, signer, metadata)
               values ($1,$2,$3,$4,$5,coalesce($6,'uploaded'),$7,coalesce($8,'{}')) returning *`;
    const vals = [b.cerId, b.phase, b.docType, b.filename, b.url, b.status, b.signer, coerceMetadata(b.metadata)];
    const row = await withClient((db) => db.query(q, vals).then((r) => r.rows[0]));
    return json(200, row);
  }

  if (event.httpMethod === 'PATCH') {
    const b = parseBody(event.body);
    const row = await withClient((db) =>
      db
        .query('update cer_documents set status=coalesce($2,status), signer=coalesce($3,signer) where id=$1 returning *', [
          b.id,
          b.status,
          b.signer
        ])
        .then((r) => r.rows[0])
    );
    return json(200, row);
  }

  return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
};
