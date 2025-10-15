# MIND Suite Starter

Questa repository contiene la versione starter della suite MIND per la gestione integrata di CRM, CER, impianti e documentazione demo.

## Database Postgres

La suite utilizza Neon/Postgres per persistere dati operativi come anagrafiche CER e documenti. Nella cartella `db/` trovi gli
script SQL pronti per inizializzare l'ambiente locale o cloud.

Per creare le tabelle minime richieste dalle Netlify Functions dedicate alla gestione documentale (`cer-docs.js`) esegui:

```bash
psql "$NEON_DATABASE_URL" -f db/cer_documents.sql
```

Lo script abilita l'estensione `pgcrypto` (usata per generare UUID) e crea le tabelle `cer` e `cer_documents` con i relativi
indici.

## Backup locale

Per generare rapidamente un archivio zip del progetto (escludendo le cartelle pesanti come `node_modules` e la cronologia Git):

```bash
node tools/make_backup_zip.js
```

Il comando crea l'output `dist/backup-YYYYMMDD.zip` pronto da condividere o conservare come snapshot.
