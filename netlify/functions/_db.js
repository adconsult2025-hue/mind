import pg from 'pg';
const { Pool } = pg;

const cn = process.env.NEON_DATABASE_URL;
if (!cn) {
  console.warn('[DB] NEON_DATABASE_URL assente. Le funzioni non potranno collegarsi.');
}

export const pool = new Pool({
  connectionString: cn,
  ssl: { rejectUnauthorized: false } // Neon richiede SSL
});

// util semplice
export async function q(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}
