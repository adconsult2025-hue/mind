const { withClient, ok, err, corsHeaders } = require('./_db');
const SQL = `
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create table if not exists cer (
  id uuid primary key default gen_random_uuid(),
  name text not null, cabina text, comune text,
  created_at timestamptz not null default now()
);
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  ragione_sociale text, piva text, cf text, email text, phone text,
  created_at timestamptz not null default now()
);
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, title text not null,
  content jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  cer_id uuid not null references cer(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  role text not null, meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cer_id, client_id, role)
);`;
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:corsHeaders() };
  try {
    return await withClient(async (client) => {
      await client.query('begin'); await client.query(SQL); await client.query('commit');
      return ok({ migrated:true });
    });
  } catch (e) {
    try { await withClient(c=>c.query('rollback')); } catch {}
    return err(e);
  }
};
