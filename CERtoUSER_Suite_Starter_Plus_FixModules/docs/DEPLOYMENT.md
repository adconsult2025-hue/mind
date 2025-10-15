# Guida al deployment della suite MIND

Questa guida spiega come passare dalla versione locale della suite MIND a una versione pubblicata online, mantenendo gli stessi moduli (CRM, CER, Impianti, Documenti, Contratti, CT3, Simulatori) sotto un unico hub.

## 1. Requisiti

- Node.js 18 o superiore.
- Account Netlify (o un provider analogo con supporto per funzioni serverless Node.js).
- Accesso a un repository Git remoto (GitHub, GitLab, Bitbucket, ecc.).

## 2. Preparazione del progetto unificato

1. Clona o copia la cartella `CERtoUSER_Suite_Starter_Plus_FixModules` nel tuo workspace principale.
2. Installa le dipendenze backend (usate dalle Netlify Functions):
   ```bash
   npm install
   ```
3. Facoltativo: personalizza il branding/asset modificando `assets/` e i testi di `index.html` e dei moduli in `modules/`.
4. Verifica che tutti i moduli siano raggiungibili dalla home (`index.html`). I pulsanti già puntano ai percorsi `/modules/<nome>/index.html`, quindi non serve ulteriore configurazione per avere un'unica piattaforma.

## 3. Test locale end-to-end

Per simulare l'ambiente finale con le funzioni serverless:

```bash
npx netlify-cli@17 dev
```

- Il sito statico sarà disponibile su `http://localhost:8888`.
- Le Netlify Functions verranno esposte sotto `http://localhost:8888/.netlify/functions/*`.
- Se vuoi eseguire un controllo automatico sulle API demo, lancia:
  ```bash
  node tools/run_self_checks.js
  ```
  Il comando effettua richieste a tutte le funzioni principali confermandone lo stato.

## 4. Configurazione variabili d'ambiente

Le funzioni supportano alcune variabili opzionali:

- `SAFE_MODE=true` mette le API in sola lettura (risposte simulate senza scrittura in memoria).
- `ALLOWED_ORIGIN` per restringere il CORS quando pubblicato (es. `https://suite.certouser.it`).

In Netlify le puoi impostare nella sezione *Site settings → Build & deploy → Environment*.

## 5. Deployment su Netlify

1. Inizia creando un nuovo sito su Netlify collegandolo al repository Git remoto.
2. Configura la build:
   - **Build command**: `npm ci || npm i`
   - **Publish directory**: `.` (l'intera root del progetto)
3. Durante il primo deploy Netlify installerà le dipendenze, genererà automaticamente le funzioni (`netlify/functions/*.js`) e pubblicherà l'hub con tutti i moduli.
4. Una volta completato il deploy copia l'URL di anteprima o collega un dominio personalizzato.

## 6. Verifica post-deploy

Sostituisci `BASE` con l'URL pubblicato e lancia i check rapidi:

```bash
BASE="https://suite.certouser.it"   # oppure la tua preview

curl -sS "$BASE/api/health" | jq
curl -sS "$BASE/api/templates" | jq   # ← controlla id/slug/type/latest_version
```

Gli endpoint `/api/*` sono mappati via `_redirects` verso `/.netlify/functions/*`. Se tutte le risposte riportano `"ok": true`, la piattaforma unificata è online.

## 7. Passi successivi

- Collega un database o servizi esterni se vuoi sostituire gli store in-memory demo contenuti in `netlify/functions/_store.js`.
- Abilita autenticazione e ruoli utilizzando Netlify Identity o un provider esterno.
- Configura pipeline CI/CD per eseguire `node tools/run_self_checks.js` ad ogni push.

Con questi passaggi la tua installazione locale viene consolidata in un'unica piattaforma e pubblicata online pronta per i test o le demo con i partner.
