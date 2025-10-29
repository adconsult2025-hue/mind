const { Client } = require('pg');
const { guard } = require('./_safe');
const { preflight, json } = require('./_cors');
const { requireRole } = require('./_auth');
const { parseBody } = require('./_http');

const CONNECTION_STRING = process.env.NEON_DATABASE_URL;

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function createClient() {
  if (!CONNECTION_STRING) {
    throw httpError(500, 'SERVER_ERROR', 'NEON_DATABASE_URL is not configured');
  }
  const config = { connectionString: CONNECTION_STRING };
  if ((process.env.PGSSLMODE || 'require') === 'require') {
    config.ssl = { rejectUnauthorized: false };
  }
  return new Client(config);
}

async function withClient(run) {
  const client = createClient();
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function coerceMetadata(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function normalizeMetadata(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return trimmed;
    }
  }
  return value;
}

function normalizeDocument(row) {
  if (!row || typeof row !== 'object') return row;
  return { ...row, metadata: normalizeMetadata(row.metadata) };
}

exports.handler = guard(async function handler(event) {
  const method = (event.httpMethod || '').toUpperCase();

  if (method === 'OPTIONS') {
    return preflight();
  }

  const gate = await requireRole(event, ['admin', 'superadmin']);
  if (!gate.ok) {
    return gate.response;
  }

  try {
    if (method === 'GET') {
      const cerId = event.queryStringParameters?.cerId;
      if (!cerId) {
        return json(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'cerId is required' } });
      }

      const rows = await withClient((client) =>
        client
          .query('select * from cer_documents where cer_id=$1 order by uploaded_at desc', [cerId])
          .then((result) => result.rows.map(normalizeDocument))
      );

      return json(200, { ok: true, data: rows });
    }

    if (method === 'POST') {
      const payload = parseBody(event);
      const required = ['cerId', 'phase', 'docType', 'filename', 'url'];
      const missing = required.filter((key) => !payload[key]);
      if (missing.length) {
        return json(400, {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: `Missing required fields: ${missing.join(', ')}` }
        });
      }

      const query = `insert into cer_documents (cer_id, phase, doc_type, filename, url, status, signer, metadata)
               values ($1,$2,$3,$4,$5,coalesce($6,'uploaded'),$7,coalesce($8,'{}')) returning *`;
      const values = [
        payload.cerId,
        payload.phase,
        payload.docType,
        payload.filename,
        payload.url,
        payload.status,
        payload.signer,
        coerceMetadata(payload.metadata)
      ];
      const document = await withClient((client) =>
        client.query(query, values).then((result) => normalizeDocument(result.rows[0]))
      );

      return json(200, { ok: true, data: document });
    }

    if (method === 'PATCH') {
      const payload = parseBody(event);
      if (!payload.id) {
        return json(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'id is required' } });
      }

      const query = `update cer_documents
             set status=coalesce($2,status), signer=coalesce($3,signer), metadata=coalesce($4,metadata)
             where id=$1 returning *`;
      const values = [payload.id, payload.status, payload.signer, coerceMetadata(payload.metadata)];
      const updated = await withClient((client) =>
        client.query(query, values).then((result) => (result.rows[0] ? normalizeDocument(result.rows[0]) : null))
      );

      if (!updated) {
        return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
      }

      return json(200, { ok: true, data: updated });
    }

    return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const code = error.code || (statusCode === 500 ? 'SERVER_ERROR' : 'ERROR');
    const message = error.message || 'Unexpected error';
    return json(statusCode, { ok: false, error: { code, message } });
  }
});
