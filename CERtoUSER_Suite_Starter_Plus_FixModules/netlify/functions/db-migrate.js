const { tx } = require('./_db');

exports.handler = async () => {
  try {
    await tx(async (client) => {
      // Estensioni necessarie PRIMA delle tabelle
      try { await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'); } catch {}

      const statements = [
        `CREATE TABLE IF NOT EXISTS clients (
           id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
           created_at timestamptz DEFAULT now(),
           ragione_sociale text,
           piva text,
           email text,
           telefono text,
           pod text UNIQUE
         )`,

        `CREATE TABLE IF NOT EXISTS cers (
           id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
           created_at timestamptz DEFAULT now(),
           nome text NOT NULL,
           cabina text NOT NULL,
           comune text
         )`,

        `CREATE TABLE IF NOT EXISTS memberships (
           id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
           cer_id uuid REFERENCES cers(id) ON DELETE CASCADE,
           user_email text,
           ruolo text CHECK (ruolo IN ('resp_cer','prosumer','produttore','consumer')),
           UNIQUE (cer_id, user_email)
         )`,

        `CREATE TABLE IF NOT EXISTS quotes (
           id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
           created_at timestamptz DEFAULT now(),
           client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
           cer_id uuid REFERENCES cers(id) ON DELETE SET NULL,
           status text DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
           kwp numeric
         )`,

        `CREATE TABLE IF NOT EXISTS plants (
           id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
           client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
           cer_id uuid REFERENCES cers(id) ON DELETE SET NULL,
           kwp numeric,
           address text
         )`,

        `CREATE TABLE IF NOT EXISTS consumptions (
           id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
           client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
           anno int,
           f1 numeric, f2 numeric, f3 numeric
         )`
      ];

      for (const sql of statements) {
        await client.query(sql);
      }
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, migrated: true }) };
  } catch (e) {
    console.error('[db-migrate] ERROR', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
