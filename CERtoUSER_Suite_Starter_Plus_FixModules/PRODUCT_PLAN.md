# CERtoUSER Suite – Visione e Piano di Implementazione

## 1. Visione & Obiettivo
Suite web multi-tenant per la gestione end-to-end di progetti CER (Comunità Energetiche Rinnovabili) e Conto Termico 3.0 con CRM integrato, gestione impianti, simulatori, contrattualistica e workflow documentali conformi alla normativa italiana. Brand unificato **CERtoUSER** con tema dark/green.

## 2. Moduli principali (toolbar fissa)
- **Hub (Home + SSO)**: login centralizzato tramite `appsecurity.certouser.it` → `suite.certouser.it` con token da Cloud Function `mintTransferToken`. Accesso ai blocchi CRM, CER, CT3.0, Simulatori, Impianti, Contratti, SuperAdmin (visibilità per ruolo).
- **CRM — Anagrafiche & POD**: gestione clienti e POD, consumi annui e per fasce, azioni rapide di contatto, link ai moduli collegati, cronoprogramma documentale a 3 fasi con blocco sequenziale, esportazioni e filtri.
- **CER Manager**: creazione/gestione CER, mappatura POD↔cabina, iscrizione membri dal CRM, configurazione split incentivi e regole, cronologia documentale, allegati e versioning.
- **CT 3.0**: validazione requisiti, simulazione incentivi, workflow documentale dedicato.
- **Simulatori**: fotovoltaico (producibilità, CAPEX/OPEX, payback) e CT3.0 (ammissibilità + calcolo incentivo).
- **Impianti**: anagrafica impianti, collegamento a CER/clienti, piano manutenzioni e storico interventi.
- **Contrattualistica**: libreria modelli Word/PDF, merge dati da CRM/CER, gestione versioni, upload firmati.
- **SuperAdmin**: gestione ruoli/permessi, territori/CER, percentuali default e feature flags per tenant.

## 3. Requisiti trasversali
- Multi-tenant con isolamento dati e RBAC (SuperAdmin, Admin, Operatore, Viewer).
- UI/UX: tema dark/green, logo CERtoUSER, grid layout responsive, toolbar fissa, accessibilità base.
- Performance: static first + Netlify Functions.
- Conformità normativa (ARERA/GSE, DM 07/12/2023, CT3.0, privacy/GDPR).

## 4. Architettura & Deploy
- **Hosting**: Netlify (site `suite.certouser.it`).
- **Auth/SSO**: token transfer `appsecurity.certouser.it` → `suite.certouser.it` (Cloud Function `mintTransferToken`).
- **Backend**: Netlify Functions per API (CRUD CRM, CER, allegati, simulazioni).
- **Database**: Neon/Postgres per dati strutturati.
- **Storage**: GCS (o S3 compatibile) per documenti.
- **Build**: deploy ZIP via Netlify CLI, gestione `_headers`, `_redirects`, charset UTF-8.
- **Baseline UI**: riferimento `CERtoUSER_Suite_Dark_v7_9_2b_adj8.zip` (baseline per V8).

## 5. Schema dati minimo (Postgres)
| Tabella | Campi principali |
| --- | --- |
| `tenants` | `id`, `name`, … |
| `users` | `id`, `email`, `role`, `tenant_id`, `claims jsonb` |
| `clients` | `id`, `tenant_id`, `name`, `vat`, `tax_code`, `email`, `phone`, `address`, `notes` |
| `pods` | `id`, `tenant_id`, `client_id`, `pod_code` (UNIQUE), `cabina_code`, `f1_kwh`, `f2_kwh`, `f3_kwh`, `year` |
| `cers` | `id`, `tenant_id`, `name`, `cabina_code`, `comune`, `quota_condivisa`, `trader`, `dm_params jsonb`, `splits jsonb`, `status` |
| `cer_members` | `id`, `cer_id`, `client_id`, `role enum`, `pod_id`, `share_pct` |
| `doc_models` | `id`, `tenant_id`, `code`, `name`, `tags`, `storage_url`, `version`, `module enum` |
| `docs` | `id`, `tenant_id`, `entity_type`, `entity_id`, `model_code`, `status enum`, `storage_url`, `uploaded_by`, `uploaded_at` |
| `workflows` | `id`, `tenant_id`, `entity_type`, `entity_id`, `phase int`, `label`, `completed bool`, `completed_at` |
| `plants` | `id`, `tenant_id`, `client_id`, `pod_id`, `power_kw`, `type`, `address`, `status` |
| `logs` | `id`, `tenant_id`, `actor_id`, `entity_type`, `entity_id`, `action`, `data jsonb`, `ts` |

## 6. API Netlify Functions (v1)
- `POST /api/auth/sso/consume` – riceve token da appsecurity e crea sessione.
- CRUD clienti (`/api/clients`) e POD (`/api/pods`).
- CRUD CER (`/api/cers`), gestione membri (`/api/cers/:id/members`).
- Documenti (`/api/docs`, `/api/docs/upload`, `/api/docs/mark`).
- Workflow (`/api/workflows`, `/api/workflows/advance`).
- Simulatori (`/api/sim/ct3/*`, `/api/sim/pv/calc`).
- Export CSV (`/api/exports/:type.csv`).

## 7. Flussi chiave
1. **Onboarding cliente** → anagrafica + POD + consumi → Fasi documento 1→2→3.
2. **Creazione CER** → definizione parametri → aggiunta membri → documenti → go-live.
3. **CT3** → verifica compatibilità → simulazione → generazione documenti → upload firmati.
4. **Contratti** → selezione modello → merge campi → download/upload → verifica fase.

## 8. UI/UX requisiti
- Tema dark/green coerente, logo CERtoUSER top-left.
- Toolbar sticky con moduli.
- Cards per cronoprogrammi con CTA "carica documento" / "approva".
- Tabelle con ricerca, filtri, paginazione, badge stato.
- Import CSV/XLS con anteprima e mappatura colonne.

## 9. Variabili d’ambiente (esempio)
```
ALLOWED_ORIGIN=<https://example.com>
NEON_DATABASE_URL=postgres://<user>:<password>@<host>/<db>
GCS_BUCKET=<bucket-name>
SSO_VERIFY_ENDPOINT=<https://auth.example.com/verify>
TOKEN_SIGNING_KEY=<random-secret>
NETLIFY_IDENTITY_ENABLED=true
LOG_LEVEL=info
```

## 10. Conformità & legale (promemoria)
- CER: parametri DM 07/12/2023, split incentivi, vendita eccedenze.
- Contratti: Art. 1341 c.c., partecipazione atipica Art. 2343 c.c., clausole penali, Accordo Integrativo OmniaX.
- Privacy/GDPR: gestione documenti e tracciamento accessi (tabella `logs`).

## 11. MVP – Funzionalità minime
- UI completa per 6 moduli con tema coerente e routing.
- CRUD Clienti, POD, CER, Membri, Impianti.
- Cronoprogramma 3 fasi per CRM/CER/CT3 con blocco fasi.
- Uploader allegati con presigned URL.
- Simulatori CT3 (validator + calc) e FV.
- Merge documentale base (HTML→PDF o link modello + JSON dati).
- RBAC base + SuperAdmin claims.
- Import/Export CSV/XLS per CRM e CER.
- Test end-to-end su Netlify (prod e deploy URL univoci).

## 12. Criteri di accettazione rapidi
- Creazione cliente → POD → completamento workflow CRM.
- Creazione CER → membri da CRM → completamento workflow CER.
- Validazione pratica CT3 e visualizzazione massimali.
- Simulazioni FV e CT3 disponibili.
- Generazione e caricamento contratti firmati.
- RBAC: Operatore vede solo moduli autorizzati.
- Export CSV funzionante (CRM, CER).
- UI coerente dark/green.

## 13. Roadmap evolutiva (post-MVP)
1. Dashboard grafici per cabina/cliente.
2. Firma elettronica avanzata e protocollazione.
3. Rendicontazione GSE mensile e pagamenti trimestrali.
4. Integrazione trader (API eccedenze).
5. Notifiche automatiche email/WhatsApp.
6. Versioning avanzato documenti e audit dettagliato.

