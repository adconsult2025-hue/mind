const { tx } = require('./_db');

function ident(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function hasPrimaryKey(client, table) {
  const sql = `
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema='public'
      AND  table_name=$1
      AND  constraint_type='PRIMARY KEY'
    LIMIT 1`;
  const r = await client.query(sql, [table]);
  return r.rowCount > 0;
}

async function columnInfo(client, table, column) {
  const sql = `
    SELECT data_type, is_nullable
    FROM   information_schema.columns
    WHERE  table_schema='public' AND table_name=$1 AND column_name=$2`;
  const r = await client.query(sql, [table, column]);
  return r.rows[0] || null;
}

async function fillUuidColumn(client, tableIdent, columnIdent) {
  try {
    await client.query(`UPDATE ${tableIdent} SET ${columnIdent} = gen_random_uuid() WHERE ${columnIdent} IS NULL`);
  } catch (err) {
    await client.query(`UPDATE ${tableIdent} SET ${columnIdent} = uuid_generate_v4() WHERE ${columnIdent} IS NULL`);
  }
}

async function ensureUuidDefault(client, tableIdent, columnIdent) {
  try {
    await client.query(`ALTER TABLE ${tableIdent} ALTER COLUMN ${columnIdent} SET DEFAULT gen_random_uuid()`);
  } catch (err) {
    await client.query(`ALTER TABLE ${tableIdent} ALTER COLUMN ${columnIdent} SET DEFAULT uuid_generate_v4()`);
  }
}

async function ensureUuidPk(client, table) {
  const tableIdent = ident(table);

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } catch (err) {
    try { await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'); } catch (_) {}
  }

  const t = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  if (t.rowCount === 0) {
    await client.query(`
      CREATE TABLE ${tableIdent} (
        id uuid PRIMARY KEY,
        created_at timestamptz DEFAULT now()
      )`);
  }

  let col = await columnInfo(client, table, 'id');
  if (!col) {
    const columnIdent = ident('id');
    await client.query(`ALTER TABLE ${tableIdent} ADD COLUMN ${columnIdent} uuid`);
    await fillUuidColumn(client, tableIdent, columnIdent);
    await client.query(`ALTER TABLE ${tableIdent} ALTER COLUMN ${columnIdent} SET NOT NULL`);
  } else {
    if (col.data_type !== 'uuid') {
      const tmpColumnIdent = ident('id_uuid_tmp');
      await client.query(`ALTER TABLE ${tableIdent} ADD COLUMN ${tmpColumnIdent} uuid`);
      await fillUuidColumn(client, tableIdent, tmpColumnIdent);
      await client.query(`ALTER TABLE ${tableIdent} DROP COLUMN ${ident('id')}`);
      await client.query(`ALTER TABLE ${tableIdent} RENAME COLUMN ${tmpColumnIdent} TO ${ident('id')}`);
    }
    await fillUuidColumn(client, tableIdent, ident('id'));
    await client.query(`ALTER TABLE ${tableIdent} ALTER COLUMN ${ident('id')} SET NOT NULL`);
  }

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await ensureUuidDefault(client, tableIdent, ident('id'));
  } catch (err) {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await ensureUuidDefault(client, tableIdent, ident('id'));
  }

  if (!(await hasPrimaryKey(client, table))) {
    await client.query(`ALTER TABLE ${tableIdent} ADD PRIMARY KEY (${ident('id')})`);
  }
}

exports.handler = async () => {
  try {
    await tx(async (client) => {
      try { await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'); } catch {}
      try { await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'); } catch {}

      await ensureUuidPk(client, 'clients');
      await ensureUuidPk(client, 'cers');

      await client.query(`
        ALTER TABLE clients 
          ADD COLUMN IF NOT EXISTS ragione_sociale text,
          ADD COLUMN IF NOT EXISTS piva text,
          ADD COLUMN IF NOT EXISTS email text,
          ADD COLUMN IF NOT EXISTS telefono text,
          ADD COLUMN IF NOT EXISTS pod text;
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS clients_pod_key ON clients(pod)`);

      await client.query(`
        ALTER TABLE cers
          ADD COLUMN IF NOT EXISTS nome   text,
          ADD COLUMN IF NOT EXISTS cabina text,
          ADD COLUMN IF NOT EXISTS comune text;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS memberships (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          cer_id uuid,
          user_email text,
          ruolo text CHECK (ruolo IN ('resp_cer','prosumer','produttore','consumer')),
          UNIQUE (cer_id, user_email)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS quotes (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          created_at timestamptz DEFAULT now(),
          client_id uuid,
          cer_id uuid,
          status text DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
          kwp numeric
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS plants (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          client_id uuid,
          cer_id uuid,
          kwp numeric,
          address text
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS consumptions (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          client_id uuid,
          anno int,
          f1 numeric, f2 numeric, f3 numeric
        );
      `);

      await client.query(`ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_cer_id_fkey`);
      await client.query(`ALTER TABLE memberships ADD CONSTRAINT memberships_cer_id_fkey
                          FOREIGN KEY (cer_id) REFERENCES cers(id) ON DELETE CASCADE`);

      await client.query(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_client_id_fkey`);
      await client.query(`ALTER TABLE quotes ADD CONSTRAINT quotes_client_id_fkey
                          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL`);
      await client.query(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_cer_id_fkey`);
      await client.query(`ALTER TABLE quotes ADD CONSTRAINT quotes_cer_id_fkey
                          FOREIGN KEY (cer_id) REFERENCES cers(id) ON DELETE SET NULL`);

      await client.query(`ALTER TABLE plants DROP CONSTRAINT IF EXISTS plants_client_id_fkey`);
      await client.query(`ALTER TABLE plants ADD CONSTRAINT plants_client_id_fkey
                          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL`);
      await client.query(`ALTER TABLE plants DROP CONSTRAINT IF EXISTS plants_cer_id_fkey`);
      await client.query(`ALTER TABLE plants ADD CONSTRAINT plants_cer_id_fkey
                          FOREIGN KEY (cer_id) REFERENCES cers(id) ON DELETE SET NULL`);

      await client.query(`ALTER TABLE consumptions DROP CONSTRAINT IF EXISTS consumptions_client_id_fkey`);
      await client.query(`ALTER TABLE consumptions ADD CONSTRAINT consumptions_client_id_fkey
                          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE`);
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, migrated: true }) };
  } catch (e) {
    console.error('[db-migrate] ERROR', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
