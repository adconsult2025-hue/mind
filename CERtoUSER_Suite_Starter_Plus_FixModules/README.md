# MIND Suite Starter

Questa repository contiene la versione starter della suite MIND per la gestione integrata di CRM, CER, impianti e documentazione demo.

## Avvio locale e deploy Netlify

1. Installare le dipendenze (solo per le Netlify Functions, l'interfaccia è statica):

   ```bash
   npm install
   ```

2. Avviare un server di sviluppo statico a piacere (ad esempio `npx serve .`) oppure utilizzare `netlify dev` per testare anche le Functions.

3. Collegare la repository ad un sito Netlify e impostare le variabili d'ambiente:

   ```bash
   npm i -g netlify-cli
   export SITE_ID="<ID_DEL_TUO_SITO_NETLIFY>"
   netlify env:set NEON_DATABASE_URL "postgresql://<user>:<pwd>@<host>/<db>?sslmode=require" --site $SITE_ID
   netlify env:set NODE_VERSION "20" --site $SITE_ID
   netlify env:set NEON_DATABASE_URL "postgresql://<user>:<pwd>@<host>/<db>?sslmode=require" --site $SITE_ID --context deploy-preview
   netlify env:set NODE_VERSION "20" --site $SITE_ID --context deploy-preview
   ```

   Il file `netlify.toml` alla radice del progetto punta già alla cartella corretta (`CERtoUSER_Suite_Starter_Plus_FixModules`) e configura la build come installazione delle dipendenze necessarie alle Functions.

4. Eseguire il deploy:

   ```bash
   netlify deploy --build --prod --site $SITE_ID
   ```

## Backup locale

Per generare rapidamente un archivio zip del progetto (escludendo le cartelle pesanti come `node_modules` e la cronologia Git):

```bash
node tools/make_backup_zip.js
```

Il comando crea l'output `dist/backup-YYYYMMDD.zip` pronto da condividere o conservare come snapshot.
