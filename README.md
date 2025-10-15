# MIND Suite Deployment Guide

Questo repository contiene la piattaforma MIND pronta per essere eseguita in locale e pubblicata su Netlify. Segui i passaggi sottostanti per ottenere un ambiente unificato (front-end + funzioni serverless) e metterlo online.

## 1. Clonare il progetto

```bash
git clone <repo-url>
cd mind
```

## 2. Preparare l'ambiente

1. Copia/crea un file `.env` nella root con le credenziali del database e il percorso di storage dei documenti (vedi esempio nel README della suite).
2. Installa il Netlify CLI e autentica il tuo account:

   ```bash
   npm install -g netlify-cli
   netlify login
   ```

3. Installa le dipendenze delle funzioni serverless:

   ```bash
   npm --prefix CERtoUSER_Suite_Starter_Plus_FixModules/netlify/functions install
   ```

## 3. Avviare in locale

Posizionati nella cartella `CERtoUSER_Suite_Starter_Plus_FixModules` ed esegui:

```bash
netlify dev --dir . --functions netlify/functions
```

Il comando esegue il front-end statico e tutte le API `/api/*` replicate tramite Netlify Functions.

## 4. Configurare il database

Esegui lo script `tools/db/templates_schema.sql` sulla tua istanza Postgres per creare le tabelle necessarie alla gestione documentale. Puoi farlo direttamente con `psql` oppure tramite lo script helper `bootstrap.sh`.

```bash
# Opzione A: usare lo script helper
PSQL_URL="postgresql://<user>:<pwd>@<host>/<db>?sslmode=require" \
  CERtoUSER_Suite_Starter_Plus_FixModules/tools/db/bootstrap.sh

# Opzione B: comando psql diretto (richiede NEON_DATABASE_URL o PSQL_URL)
export PSQL_URL="postgresql://<user>:<pwd>@<host>/<db>?sslmode=require"
psql "$PSQL_URL" -f CERtoUSER_Suite_Starter_Plus_FixModules/tools/db/templates_schema.sql
```

## 5. Deploy su Netlify

1. Collega il repository a un sito Netlify (tramite `netlify init` oppure dalla dashboard).
2. Configura le variabili d'ambiente (`NEON_DATABASE_URL`, `FILE_STORAGE_DIR`, `SAFE_MODE`, `NODE_VERSION`). Se preferisci usare il Netlify CLI, imposta anche lo `SITE_ID` del progetto e lancia:

   ```bash
   export SITE_ID="<ID_DEL_TUO_SITO_NETLIFY>"
   netlify env:set NEON_DATABASE_URL "postgresql://<user>:<pwd>@<host>/<db>?sslmode=require" --site "$SITE_ID"
   netlify env:set FILE_STORAGE_DIR "./public/docs" --site "$SITE_ID"
   netlify env:set SAFE_MODE "false" --site "$SITE_ID"
   netlify env:set NODE_VERSION "20" --site "$SITE_ID"
   ```
3. Lancia un deploy:

   ```bash
   netlify deploy --build    # anteprima
   netlify deploy --prod     # produzione
   ```

## 6. Struttura del repository

- `netlify.toml`: configurazione build, redirect e headers per Netlify.
- `CERtoUSER_Suite_Starter_Plus_FixModules/`: codice della piattaforma e funzioni serverless.

Per dettagli aggiuntivi consulta `CERtoUSER_Suite_Starter_Plus_FixModules/README.md`.
