import { q } from './_db.js';

const SQL = `
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  ragione_sociale text,
  piva text,
  email text,
  telefono text,
  pod text unique
);

create table if not exists cers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  nome text not null,
  cabina text not null,
  comune text
);

create table if not exists memberships (
  id uuid default gen_random_uuid() primary key,
  cer_id uuid references cers(id) on delete cascade,
  user_email text,
  ruolo text check (ruolo in ('resp_cer','prosumer','produttore','consumer')),
  unique (cer_id, user_email)
);

create table if not exists quotes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  client_id uuid references clients(id) on delete set null,
  cer_id uuid references cers(id) on delete set null,
  status text default 'draft' check (status in ('draft','submitted','approved')),
  kwp numeric
);

create table if not exists plants (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete set null,
  cer_id uuid references cers(id) on delete set null,
  kwp numeric,
  address text
);

create table if not exists consumptions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade,
  anno int,
  f1 numeric, f2 numeric, f3 numeric
);
`;

export const handler = async () => {
  try {
    await q('begin');
    // Estendi: alcune installazioni Neon non hanno pgcrypto; prova a creare estensione
    try { await q('create extension if not exists pgcrypto'); } catch (e) { /* ignore */ }
    for (const stmt of SQL.split(';\n').filter(Boolean)) {
      await q(stmt);
    }
    await q('commit');
    return { statusCode: 200, body: JSON.stringify({ ok:true, migrated:true }) };
  } catch (e) {
    await q('rollback').catch(()=>{});
    console.error('[db-migrate] ERROR', e);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
