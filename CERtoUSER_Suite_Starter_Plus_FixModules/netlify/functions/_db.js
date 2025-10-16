const { Pool } = require('pg');

const cn = process.env.NEON_DATABASE_URL;
if (!cn) console.warn('[DB] NEON_DATABASE_URL assente');

const pool = new Pool({
  connectionString: cn,
  ssl: { rejectUnauthorized: false } // Neon richiede SSL
});

// Query semplice (nuovo client per chiamata)
async function q(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// Transazione atomica riutilizzando LO STESSO client
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client); // esegui più query sullo stesso client
    await client.query('COMMIT');
    return res;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, q, tx };
