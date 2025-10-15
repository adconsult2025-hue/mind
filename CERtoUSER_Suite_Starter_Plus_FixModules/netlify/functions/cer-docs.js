const { Client } = require('pg');

const CONNECTION_STRING = process.env.NEON_DATABASE_URL;

function json(response) {
  return {
    ...response,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  };
}

async function withClient(run) {
  if (!CONNECTION_STRING) {
    throw new Error('NEON_DATABASE_URL is not configured');
  }
  const client = new Client({ connectionString: CONNECTION_STRING });
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
    throw new Error('Invalid JSON body');
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json({ statusCode: 204, body: '' });
  }

  try {
    if (event.httpMethod === 'GET') {
      const { cerId } = event.queryStringParameters || {};
      if (!cerId) {
        return json({ statusCode: 400, body: JSON.stringify({ error: 'cerId is required' }) });
      }

      const rows = await withClient((client) =>
        client
          .query(
            'select * from cer_documents where cer_id = $1 order by uploaded_at desc',
            [cerId]
          )
          .then((result) => result.rows)
      );

      return json({ statusCode: 200, body: JSON.stringify(rows) });
    }

    if (event.httpMethod === 'POST') {
      const payload = parseBody(event.body);
      const required = ['cerId', 'phase', 'docType', 'filename', 'url'];
      const missing = required.filter((key) => !payload[key]);
      if (missing.length) {
        return json({
          statusCode: 400,
          body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` })
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
              payload.metadata
            ]
          )
          .then((result) => result.rows)
      );

      return json({ statusCode: 200, body: JSON.stringify(document) });
    }

    if (event.httpMethod === 'PATCH') {
      const payload = parseBody(event.body);
      if (!payload.id) {
        return json({ statusCode: 400, body: JSON.stringify({ error: 'id is required' }) });
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
        return json({ statusCode: 404, body: JSON.stringify({ error: 'Document not found' }) });
      }

      return json({ statusCode: 200, body: JSON.stringify(updated) });
    }

    return json({ statusCode: 405, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) });
  } catch (error) {
    return json({ statusCode: 500, body: JSON.stringify({ error: error.message }) });
  }
};
