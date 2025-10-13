# MIND Suite Starter

Questa repository contiene la versione starter della suite MIND per la gestione integrata di CRM, CER, impianti e documentazione demo.

## Backup locale

Per generare rapidamente un archivio zip del progetto (escludendo le cartelle pesanti come `node_modules` e la cronologia Git):

```bash
node tools/make_backup_zip.js
```

Il comando crea l'output `dist/backup-YYYYMMDD.zip` pronto da condividere o conservare come snapshot.
