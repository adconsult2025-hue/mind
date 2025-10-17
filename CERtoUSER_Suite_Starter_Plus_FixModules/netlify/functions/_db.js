const { Pool } = require('pg');
const { corsHeaders: baseCorsHeaders } = require('./_cors');
const { parseBody } = require('./_http');

const cn = process.env.NEON_DATABASE_URL;
if (!cn) console.warn('[DB] NEON_DATABASE_URL assente');

const pool = new Pool({
  connectionString: cn,
  ssl: { rejectUnauthorized: false } // Neon richiede SSL
});

// Ritorna sempre un nuovo client e si occupa di rilasciarlo
async function withClient(run) {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

// Query semplice (nuovo client per chiamata)
async function q(sql, params = []) {
  return withClient((client) => client.query(sql, params));
}

// Transazione atomica riutilizzando LO STESSO client
async function tx(fn) {
  return withClient(async (client) => {
    try {
      await client.query('BEGIN');
      const res = await fn(client); // esegui più query sullo stesso client
      await client.query('COMMIT');
      return res;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    }
  });
}

function corsHeaders() {
  return { ...baseCorsHeaders };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function ok(payload = {}, statusCode = 200) {
  const body = payload && typeof payload === 'object'
    ? { ok: true, ...payload }
    : { ok: true, data: payload };
  return jsonResponse(statusCode, body);
}

function err(error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const code = error?.code || (statusCode === 500 ? 'SERVER_ERROR' : 'ERROR');
  const message = typeof error === 'string' ? error : error?.message || 'Errore interno';
  const details = error && typeof error === 'object' ? error.details : undefined;
  const body = { ok: false, error: { code, message } };
  if (details !== undefined) {
    body.error.details = details;
  }
  return jsonResponse(statusCode, body);
}

module.exports = { pool, q, tx, withClient, ok, err, corsHeaders, parseBody };
