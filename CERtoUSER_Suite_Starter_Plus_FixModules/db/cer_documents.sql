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

create index if not exists cer_documents_cer on cer_documents(cer_id);
create index if not exists cer_documents_phase on cer_documents(phase);
create index if not exists cer_documents_doctype on cer_documents(doc_type);

create or replace view cer_phase_status as
select
  c.id as cer_id,
  bool_and(case when d.doc_type in ('ATTO','STATUTO','REGOLAMENTO') then true else null end) filter (where d.status is not null) as fase1_docs_present,
  bool_and(case when d.doc_type in ('ADESIONE','DELEGA_GSE_DSO','CONTRATTO_TRADER','REGISTRO_POD','REGISTRO_IMPIANTI') then true else null end) filter (where d.status is not null) as fase2_docs_present
from cer c
left join cer_documents d on d.cer_id = c.id
group by c.id;
