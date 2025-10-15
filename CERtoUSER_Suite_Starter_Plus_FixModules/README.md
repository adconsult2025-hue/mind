# MIND Suite Starter

Questa repository contiene la versione starter della suite MIND per la gestione integrata di CRM, CER, impianti e documentazione demo.

## Backup locale

Per generare rapidamente un archivio zip del progetto (escludendo le cartelle pesanti come `node_modules` e la cronologia Git):

```bash
node tools/make_backup_zip.js
```

Il comando crea l'output `dist/backup-YYYYMMDD.zip` pronto da condividere o conservare come snapshot.

## Mettere online la piattaforma

Se hai la suite in locale e vuoi pubblicarla come hub unico, segui la guida dettagliata in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Troverai:

- i prerequisiti software e gli step per consolidare i moduli CRM/CER/Impianti/Documenti;
- le istruzioni per testare tutto con `netlify dev` e lo script `tools/run_self_checks.js`;
- la configurazione consigliata per il deploy su Netlify e i controlli post-pubblicazione (`curl` sugli endpoint `/api/*`).

Dopo il deploy potrai collegare un dominio personalizzato e integrare servizi esterni (database, identity) mantenendo la stessa struttura modulare della versione locale.
