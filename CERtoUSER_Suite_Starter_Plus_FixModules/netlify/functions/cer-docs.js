const { Client } = require('pg');
const { guard } = require('./_safe');
const { headers: corsHeaders, preflight } = require('./_cors');

const CONNECTION_STRING = process.env.NEON_DATABASE_URL;

function headers() {
  return { ...corsHeaders };
}

function ensureConnectionString() {
  if (!CONNECTION_STRING) {
    throw new Error('NEON_DATABASE_URL is not configured');
  }
}

function createClient() {
  ensureConnectionString();
  const config = { connectionString: CONNECTION_STRING };
  if (process.env.PGSSLMODE === 'require') {
    config.ssl = { rejectUnauthorized: false };
  }
  return new Client(config);
}

async function withClient(callback) {
  const client = createClient();
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return preflight();
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const cerId = params.cerId || params.cer_id;
      if (!cerId) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'cerId is required' } })
        };
      }

      const rows = await withClient(client =>
        client
          .query(
            'select * from cer_documents where cer_id = $1 order by uploaded_at desc',
            [cerId]
          )
          .then(result => result.rows)
      );

      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: rows })
      };
    }

    if (event.httpMethod === 'POST') {
      const payload = parseBody(event.body);
      const requiredFields = ['cerId', 'phase', 'docType', 'filename', 'url'];
      const missing = requiredFields.filter(key => !payload[key]);
      if (missing.length) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Missing required fields: ${missing.join(', ')}`
            }
          })
        };
      }

      const document = await withClient(client =>
        client
          .query(
            `insert into cer_documents
              (cer_id, phase, doc_type, filename, url, status, signer, metadata)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            returning *`,
            [
              payload.cerId,
              payload.phase,
              payload.docType,
              payload.filename,
              payload.url,
              payload.status || 'uploaded',
              payload.signer || null,
              payload.metadata ?? {}
            ]
          )
          .then(result => result.rows[0])
      );

      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: document })
      };
    }

    if (event.httpMethod === 'PATCH') {
      const payload = parseBody(event.body);
      if (!payload.id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'id is required' } })
        };
      }

      const updated = await withClient(client =>
        client
          .query(
            `update cer_documents
             set status = coalesce($2, status),
                 signer = coalesce($3, signer)
             where id = $1
             returning *`,
            [payload.id, payload.status || null, payload.signer || null]
          )
          .then(result => result.rows[0])
      );

      if (!updated) {
        return {
          statusCode: 404,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Document not found' } })
        };
      }

      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: updated })
      };
    }

    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not supported' } })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: error.message } })
    };
  }
});
