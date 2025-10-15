# MIND Suite Starter

Questa repository contiene la versione starter della suite MIND per la gestione integrata di CRM, CER, impianti e documentazione demo.

## Backup locale

Per generare rapidamente un archivio zip del progetto (escludendo le cartelle pesanti come `node_modules` e la cronologia Git):

```bash
node tools/make_backup_zip.js
```

Il comando crea l'output `dist/backup-YYYYMMDD.zip` pronto da condividere o conservare come snapshot.

## Struttura del progetto

La cartella contiene la web app statica (HTML/CSS/JS), gli asset e le Netlify Functions utilizzate per l'integrazione con il database Postgres e i sistemi esterni. I percorsi principali sono:

| Cartella | Descrizione |
| --- | --- |
| `assets/` | Risorse statiche condivise dal front-end. |
| `modules/` | Moduli JavaScript modularizzati caricati dal front-end. |
| `netlify/functions/` | Funzioni serverless Node.js esposte via `/api/*`. |
| `tools/` | Script di supporto (backup, database, utilità varie). |

## Requisiti

- **Node.js 20** (consigliato, vedi `.nvmrc`) per eseguire Netlify CLI e gli script.
- **Netlify CLI** (`npm install -g netlify-cli`) per sviluppo e deploy.
- **PostgreSQL 14+** (o Neon, Supabase, ecc.) per la persistenza dei documenti.

## Configurazione ambiente

1. Copiare il file `.env` di esempio (o recuperarlo dalle configurazioni esistenti) nella root del repository.
2. Impostare almeno le variabili necessarie alle funzioni serverless:

   ```bash
   NEON_DATABASE_URL=postgresql://<user>:<pwd>@<host>/<db>?sslmode=require
   FILE_STORAGE_DIR=./public/docs
   SAFE_MODE=false
   TEMPLATE_MAX_UPLOAD_SIZE=10485760  # opzionale (byte) per limitare l'upload dei template
   ```

3. Creare la cartella indicata da `FILE_STORAGE_DIR` se non esiste (es. `public/docs`).

### Database

Per inizializzare la struttura del database dedicata alla gestione dei template è disponibile lo script SQL `tools/db/templates_schema.sql`.

Eseguire lo script puntando alla propria istanza Postgres, ad esempio:

```bash
psql "$NEON_DATABASE_URL" -f tools/db/templates_schema.sql
```

Lo script crea automaticamente l'estensione `pgcrypto` (se assente) e le tabelle `templates`, `template_versions` e `generated_documents` utilizzate dalle funzioni serverless per la gestione dei documenti.

## Sviluppo locale

1. Installare le dipendenze delle Netlify Functions:

   ```bash
   npm --prefix netlify/functions install
   ```

2. Avviare l'ambiente completo (front-end + funzioni) con Netlify CLI:

   ```bash
   netlify dev --dir . --functions netlify/functions
   ```

   Il comando replica in locale i redirect definiti in `_redirects` e in `netlify.toml`, esponendo le API su `http://localhost:8888/api/*`.

3. Durante lo sviluppo, i log delle funzioni sono visibili direttamente in console. Ogni modifica ai file sotto `netlify/functions/` provoca il reload automatico.

   Gli endpoint documentali (`/api/templates/*`, `/api/documents/generate`) accettano payload JSON tradizionali oppure richieste `multipart/form-data` con allegati binari (ad es. file DOCX). In assenza di un file allegato è ancora possibile inviare il contenuto base64 tramite il campo `file`.

## Deploy su Netlify

1. Collegare la repository al progetto Netlify (`netlify link` oppure tramite interfaccia web).
2. Configurare le environment variables nella dashboard Netlify (`Site settings > Environment variables`) oppure via CLI:
   - `NEON_DATABASE_URL`
   - `FILE_STORAGE_DIR` (es. `/tmp/docs` per lo storage temporaneo)
   - `SAFE_MODE`
   - `NODE_VERSION` (imposta `20` per allineare runtime e sviluppo)
   - `TEMPLATE_MAX_UPLOAD_SIZE` (opzionale, dimensione massima dei file caricati)

   Con Netlify CLI puoi impostarle rapidamente:

   ```bash
   export SITE_ID="<ID_DEL_TUO_SITO_NETLIFY>"
   netlify env:set NEON_DATABASE_URL "postgresql://<user>:<pwd>@<host>/<db>?sslmode=require" --site "$SITE_ID"
   netlify env:set FILE_STORAGE_DIR "./public/docs" --site "$SITE_ID"
   netlify env:set SAFE_MODE "false" --site "$SITE_ID"
   netlify env:set NODE_VERSION "20" --site "$SITE_ID"
   # opzionale
   netlify env:set TEMPLATE_MAX_UPLOAD_SIZE "10485760" --site "$SITE_ID"
   ```
3. Assicurarsi che la directory di publish sia `CERtoUSER_Suite_Starter_Plus_FixModules` e la cartella funzioni `netlify/functions` (sono già configurate in `netlify.toml`).
4. Eseguire il deploy:

   ```bash
   netlify deploy --build    # anteprima
   netlify deploy --prod     # produzione
   ```

5. Verificare che gli endpoint API rispondano, ad esempio `https://<tuo-site>.netlify.app/api/templates`.
