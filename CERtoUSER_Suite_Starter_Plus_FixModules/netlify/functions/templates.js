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
      return Object.fromEntries(new URLSearchParams(raw).entries());
    }
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  } catch (e) {
    console.error('Body parse error:', e, {
      headers: event.headers,
      sample: (event.body || '').slice(0, 200)
    });
    return {};
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders() };
  try {
    const op = new URL(event.rawUrl).searchParams.get('op') || 'list';
    if (event.httpMethod === 'GET' && op === 'list') {
      return await withClient(async (c) => {
        const { rows } = await c.query(`select id, slug, title, content, active, created_at from templates order by created_at desc`);
        return ok(rows);
      });
    }
    if (event.httpMethod === 'POST' && op === 'create') {
      const b = parseBody(event);
      if (!b.slug || !b.title) return err(new Error('Missing slug or title'), 400);
      return await withClient(async (c) => {
        const { rows } = await c.query(
          `insert into templates (slug, title, content, active)
           values ($1,$2,$3,$4)
           returning id, slug, title, content, active, created_at`,
          [b.slug, b.title, b.content || {}, b.active ?? true]
        );
        return ok(rows[0]);
      });
    }
    if (event.httpMethod === 'POST' && op === 'update') {
      const b = parseBody(event);
      if (!b.id) return err(new Error('Missing id'), 400);
      return await withClient(async (c) => {
        const { rows } = await c.query(
          `update templates set slug=$2, title=$3, content=$4, active=$5 where id=$1
           returning id, slug, title, content, active, created_at`,
          [b.id, b.slug, b.title, b.content || {}, b.active ?? true]
        );
        return ok(rows[0]);
      });
    }
    if (event.httpMethod === 'POST' && op === 'delete') {
      const b = parseBody(event);
      if (!b.id) return err(new Error('Missing id'), 400);
      return await withClient(async (c) => {
        await c.query(`delete from templates where id=$1`, [b.id]);
        return ok({ deleted: b.id });
      });
    }
    return err(new Error('Unsupported operation'), 404);
  } catch (e) {
    return err(e);
  }
};
