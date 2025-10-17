const { withClient, ok, err, corsHeaders } = require('./_db');

function parseBody(event) {
  try {
    let raw = event.body || '';
    if (event.isBase64Encoded && raw) {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    }

    const ct = (event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      return raw ? JSON.parse(raw) : {};
    }
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      return Object.fromEntries(params.entries());
    }

    try {
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  } catch (error) {
    console.error('CER body parse error:', error, {
      headers: event.headers,
      snippet: typeof event.body === 'string' ? event.body.slice(0, 200) : null
    });
    return {};
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() };
  }

  try {
    const op = new URL(event.rawUrl).searchParams.get('op') || 'list';

    if (event.httpMethod === 'GET' && op === 'list') {
      return await withClient(async (c) => {
        const { rows } = await c.query(
          `select id, name, cabina, comune, created_at from cer order by created_at desc`
        );
        return ok(rows);
      });
    }

    if (event.httpMethod === 'POST' && op === 'create') {
      const b = parseBody(event);
      if (!b.name) return err(new Error('Missing field: name'), 400);

      return await withClient(async (c) => {
        const { rows } = await c.query(
          `insert into cer (name, cabina, comune) values ($1,$2,$3) returning id, name, cabina, comune, created_at`,
          [b.name, b.cabina || null, b.comune || null]
        );
        return ok(rows[0]);
      });
    }

    if (event.httpMethod === 'POST' && op === 'update') {
      const b = parseBody(event);
      if (!b.id || !b.name) return err(new Error('Missing id or name'), 400);

      return await withClient(async (c) => {
        const { rows } = await c.query(
          `update cer set name=$2, cabina=$3, comune=$4 where id=$1 returning id, name, cabina, comune, created_at`,
          [b.id, b.name, b.cabina || null, b.comune || null]
        );
        return ok(rows[0]);
      });
    }

    if (event.httpMethod === 'POST' && op === 'delete') {
      const b = parseBody(event);
      if (!b.id) return err(new Error('Missing id'), 400);

      return await withClient(async (c) => {
        await c.query(`delete from cer where id=$1`, [b.id]);
        return ok({ deleted: b.id });
      });
    }

    return err(new Error('Unsupported operation'), 404);
  } catch (e) {
    return err(e);
  }
};
