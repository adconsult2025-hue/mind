const { Client } = require('pg');
const { guard } = require('./_safe');
const { preflight, json } = require('./_cors');

const CONNECTION_STRING = process.env.NEON_DATABASE_URL;

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function withClient(run) {
  if (!CONNECTION_STRING) {
    throw httpError(500, 'SERVER_ERROR', 'NEON_DATABASE_URL is not configured');
  }

  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    throw httpError(400, 'BAD_REQUEST', 'Invalid JSON body');
  }
}

function coerceMetadata(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return null;
  }
}

exports.handler = guard(async function handler(event) {
  const method = (event.httpMethod || '').toUpperCase();

  if (method === 'OPTIONS') {
    return preflight();
  }

  try {
    if (method === 'GET') {
      const { cerId } = event.queryStringParameters || {};
      if (!cerId) {
        return json(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'cerId is required' } });
      }

      const rows = await withClient((client) =>
        client
          .query(
            'select * from cer_documents where cer_id = $1 order by uploaded_at desc',
            [cerId]
          )
          .then((result) => result.rows)
      );

      return json(200, { ok: true, data: rows });
    }

    if (method === 'POST') {
      const payload = parseBody(event.body);
      const required = ['cerId', 'phase', 'docType', 'filename', 'url'];
      const missing = required.filter((key) => !payload[key]);
      if (missing.length) {
        return json(400, {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: `Missing required fields: ${missing.join(', ')}` }
        });
      }

      const [document] = await withClient((client) =>
        client
          .query(
            `insert into cer_documents (cer_id, phase, doc_type, filename, url, status, signer, metadata)
             values ($1,$2,$3,$4,$5,coalesce($6,'uploaded'),$7,coalesce($8,'{}')) returning *`,
            [
              payload.cerId,
              payload.phase,
              payload.docType,
              payload.filename,
              payload.url,
              payload.status,
              payload.signer,
              coerceMetadata(payload.metadata)
            ]
          )
          .then((result) => result.rows)
      );

      return json(200, { ok: true, data: document });
    }

    if (method === 'PATCH') {
      const payload = parseBody(event.body);
      if (!payload.id) {
        return json(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'id is required' } });
      }

      const [updated] = await withClient((client) =>
        client
          .query(
            `update cer_documents set status=coalesce($2,status), signer=coalesce($3,signer)
             where id=$1 returning *`,
            [payload.id, payload.status, payload.signer]
          )
          .then((result) => result.rows)
      );

      if (!updated) {
        return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
      }

      return json(200, { ok: true, data: updated });
    }

    return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } });
  } catch (error) {
    const statusCode = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const code = error.code || (statusCode === 500 ? 'SERVER_ERROR' : 'ERROR');
    const message = error.message || 'Unexpected error';
    return json(statusCode, { ok: false, error: { code, message } });
  }
});
