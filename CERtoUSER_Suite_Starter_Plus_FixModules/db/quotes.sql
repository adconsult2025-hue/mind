-- Schema for quotes management
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null,
  client_id uuid,
  title text,
  status text default 'bozza',
  currency text default 'EUR',
  iva_default numeric default 22,
  valid_until date,
  context jsonb default '{}'::jsonb,
  totals jsonb default '{}'::jsonb,
  version_n int default 1,
  version_of uuid,
  template_pdf_id uuid,
  created_at timestamptz default now(),
  created_by text,
  owner_tenant text
);

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  sku text not null,
  name text not null,
  category text,
  qty numeric default 1,
  unit text,
  price numeric default 0,
  discount numeric default 0,
  cost numeric,
  iva_perc numeric,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_quote_items_quote_id on quote_items(quote_id);
