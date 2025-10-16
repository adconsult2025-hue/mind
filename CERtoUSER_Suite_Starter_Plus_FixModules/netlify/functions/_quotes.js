const { Client } = require('pg');

const { NEON_DATABASE_URL } = process.env;

function assertConnection() {
  if (!NEON_DATABASE_URL) {
    const error = new Error('Configurazione database mancante (NEON_DATABASE_URL)');
    error.code = 'CONFIG_ERROR';
    error.statusCode = 500;
    throw error;
  }
}

function createClient() {
  assertConnection();
  return new Client({
    connectionString: NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

async function withClient(fn) {
  const client = createClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toISOString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapQuoteItem(row) {
  const qty = toNumber(row.qty ?? row.quantity, 0);
  const price = toNumber(row.price, 0);
  const discount = toNumber(row.discount, 0);
  const metadata = parseJson(row.metadata, {});
  return {
    id: row.id,
    quote_id: row.quote_id,
    sku: row.sku || null,
    name: row.name || null,
    description: row.name || null,
    category: row.category || null,
    qty,
    unit: row.unit || null,
    price,
    discount,
    cost: toNumber(row.cost, 0),
    iva_perc: row.iva_perc,
    metadata,
    total: row.total !== undefined ? toNumber(row.total) : qty * price - discount
  };
}

function extractClient(context) {
  return {
    name: context.client_name || context.client || null,
    company: context.client_company || null,
    address: context.client_address || context.address || null,
    email: context.client_email || null,
    phone: context.client_phone || null
  };
}

function mapQuote(row, items = []) {
  const context = parseJson(row.context, {});
  const totals = parseJson(row.totals, {});
  const total = row.total !== undefined ? row.total : totals.totale ?? totals.total;
  return {
    id: row.id,
    code: row.code,
    number: row.code,
    type: row.type,
    title: row.title,
    status: row.status,
    currency: row.currency,
    iva_default: row.iva_default,
    valid_until: toISOString(row.valid_until),
    created_at: toISOString(row.created_at),
    updated_at: toISOString(row.updated_at),
    client_id: row.client_id,
    owner_tenant: row.owner_tenant,
    version: row.version_n,
    totals: {
      ...totals,
      currency: totals.currency || row.currency || 'EUR',
      totale: totals.totale ?? totals.total ?? toNumber(total, 0)
    },
    context,
    client: extractClient(context),
    items: items.map(mapQuoteItem)
  };
}

async function listQuotes({ limit = 200 } = {}) {
  return withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, code, type, title, status, currency, iva_default, valid_until, created_at, updated_at,
              context, totals, client_id, owner_tenant, version_n
         FROM quotes
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows.map((row) => mapQuote(row, []));
  });
}

async function fetchQuoteRow(client, identifier) {
  const { rows } = await client.query(
    `SELECT * FROM quotes WHERE id::text = $1 OR code = $1 LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

async function fetchQuoteItems(client, quoteId) {
  const { rows } = await client.query(
    `SELECT id, quote_id, sku, name, category, qty, unit, price, discount, cost, iva_perc, metadata
       FROM quote_items
      WHERE quote_id = $1
      ORDER BY name ASC, id ASC`,
    [quoteId]
  );
  return rows;
}

async function getQuote(identifier) {
  if (!identifier) return null;
  return withClient(async (client) => {
    const row = await fetchQuoteRow(client, identifier);
    if (!row) return null;
    const items = await fetchQuoteItems(client, row.id);
    return mapQuote(row, items);
  });
}

function genCode(prefix = 'PRV') {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 900000 + 100000);
  return `${prefix}-${year}-${random}`;
}

async function ensureUniqueCode(client, code) {
  const { rows } = await client.query(`SELECT 1 FROM quotes WHERE code = $1 LIMIT 1`, [code]);
  if (!rows[0]) return code;
  return ensureUniqueCode(client, genCode(code.split('-')[0] || 'PRV'));
}

function sanitizeTotals(totals) {
  if (!totals || typeof totals !== 'object') {
    return { imponibile: 0, iva: 0, totale: 0 };
  }
  const imponibile = toNumber(totals.imponibile, 0);
  const iva = toNumber(totals.iva, 0);
  const totale = toNumber(totals.totale ?? totals.total, imponibile + iva);
  const currency = totals.currency || 'EUR';
  return { ...totals, imponibile, iva, totale, currency };
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return {};
  return context;
}

async function createQuote(payload = {}, options = {}) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const requestedCode = payload.code || genCode(payload.prefix || 'PRV');
      const code = await ensureUniqueCode(client, requestedCode);
      const totals = sanitizeTotals(payload.totals);
      const context = sanitizeContext(payload.context || {
        client_name: payload.client_name,
        note: payload.note,
        cabina: payload.cabina,
        kwp: payload.kwp,
        due: payload.valid_until
      });

      const { rows } = await client.query(
        `INSERT INTO quotes (id, code, type, client_id, title, status, currency, iva_default, valid_until,
                             context, totals, version_n, created_at, updated_at, created_by, owner_tenant)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, COALESCE($5, 'bozza'), COALESCE($6, 'EUR'),
                 COALESCE($7, 22)::numeric, $8, $9::jsonb, $10::jsonb, COALESCE($11, 1), NOW(), NOW(),
                 $12, COALESCE($13, 'default'))
         RETURNING *`,
        [
          code,
          payload.type || 'Combinato',
          payload.client_id || null,
          payload.title || `Preventivo ${code}`,
          payload.status,
          payload.currency,
          payload.iva_default,
          payload.valid_until || null,
          context,
          totals,
          payload.version_n,
          options.userEmail || 'system',
          payload.owner_tenant
        ]
      );

      const quoteRow = rows[0];

      if (Array.isArray(payload.items) && payload.items.length) {
        const insert = `INSERT INTO quote_items (id, quote_id, sku, name, category, qty, unit, price, discount, cost, iva_perc, metadata)
                        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), COALESCE($9, 0), $10, $11::jsonb)`;
        for (const item of payload.items) {
          await client.query(insert, [
            quoteRow.id,
            item.sku || null,
            item.name || item.description || null,
            item.category || null,
            toNumber(item.qty ?? item.quantity, 1),
            item.unit || null,
            toNumber(item.price ?? item.unit_price, 0),
            toNumber(item.discount, 0),
            toNumber(item.cost, 0),
            item.iva_perc ?? null,
            item.metadata || {}
          ]);
        }
      }

      await client.query('COMMIT');
      return await getQuote(quoteRow.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function updateQuote(identifier, payload = {}) {
  if (!identifier) return null;
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const existing = await fetchQuoteRow(client, identifier);
      if (!existing) {
        await client.query('ROLLBACK');
        return null;
      }

      const sets = [];
      const values = [];
      let index = 1;

      const pushSet = (fragment, value) => {
        sets.push(`${fragment} = $${index}`);
        values.push(value);
        index += 1;
      };

      if (payload.title !== undefined) pushSet('title', payload.title);
      if (payload.status !== undefined) pushSet('status', payload.status);
      if (payload.type !== undefined) pushSet('type', payload.type);
      if (payload.currency !== undefined) pushSet('currency', payload.currency);
      if (payload.iva_default !== undefined) pushSet('iva_default', payload.iva_default);
      if (payload.valid_until !== undefined) pushSet('valid_until', payload.valid_until);
      if (payload.client_id !== undefined) pushSet('client_id', payload.client_id);
      if (payload.owner_tenant !== undefined) pushSet('owner_tenant', payload.owner_tenant);
      if (payload.version_n !== undefined) pushSet('version_n', payload.version_n);
      if (payload.totals !== undefined) pushSet('totals', sanitizeTotals(payload.totals));
      if (payload.context !== undefined || payload.client_name !== undefined) {
        const nextContext = {
          ...parseJson(existing.context, {}),
          ...sanitizeContext(payload.context || {}),
          ...(payload.client_name ? { client_name: payload.client_name } : {})
        };
        pushSet('context', nextContext);
      }

      if (sets.length) {
        sets.push(`updated_at = NOW()`);
        const updateQuery = `UPDATE quotes SET ${sets.join(', ')} WHERE id = $${index}`;
        values.push(existing.id);
        await client.query(updateQuery, values);
      }

      if (Array.isArray(payload.items)) {
        await client.query(`DELETE FROM quote_items WHERE quote_id = $1`, [existing.id]);
        if (payload.items.length) {
          const insert = `INSERT INTO quote_items (id, quote_id, sku, name, category, qty, unit, price, discount, cost, iva_perc, metadata)
                          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), COALESCE($9, 0), $10, $11::jsonb)`;
          for (const item of payload.items) {
            await client.query(insert, [
              existing.id,
              item.sku || null,
              item.name || item.description || null,
              item.category || null,
              toNumber(item.qty ?? item.quantity, 1),
              item.unit || null,
              toNumber(item.price ?? item.unit_price, 0),
              toNumber(item.discount, 0),
              toNumber(item.cost, 0),
              item.iva_perc ?? null,
              item.metadata || {}
            ]);
          }
        }
      }

      await client.query('COMMIT');
      return await getQuote(existing.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function deleteQuote(identifier) {
  if (!identifier) return false;
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const existing = await fetchQuoteRow(client, identifier);
      if (!existing) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(`DELETE FROM quote_items WHERE quote_id = $1`, [existing.id]);
      await client.query(`DELETE FROM quotes WHERE id = $1`, [existing.id]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

module.exports = {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  deleteQuote
};
