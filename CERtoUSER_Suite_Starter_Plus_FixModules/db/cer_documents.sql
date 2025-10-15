-- Schema di supporto per la gestione documentale delle CER
-- Esegue l'estensione pgcrypto (necessaria per gen_random_uuid) e crea le tabelle principali
-- insieme agli indici utilizzati dalle Netlify Functions.

create extension if not exists pgcrypto;

create table if not exists cer (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_substation_code text not null,
  created_at timestamptz default now()
);

create table if not exists cer_documents (
  id uuid primary key default gen_random_uuid(),
  cer_id uuid not null references cer(id) on delete cascade,
  phase int not null,
  doc_type text not null,
  filename text not null,
  url text not null,
  status text not null default 'uploaded',
  signer text,
  uploaded_at timestamptz not null default now(),
  metadata jsonb default '{}'
);

create index if not exists cer_documents_cer on cer_documents (cer_id);
create index if not exists cer_documents_phase on cer_documents (phase);
create index if not exists cer_documents_doctype on cer_documents (doc_type);
