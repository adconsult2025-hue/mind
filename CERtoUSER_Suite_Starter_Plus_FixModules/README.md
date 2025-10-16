# MIND Suite Starter

Questa repository contiene la versione starter della suite MIND per la gestione integrata di CRM, CER, impianti e documentazione demo.

## Autenticazione con Firebase

La suite utilizza ora Firebase Authentication per proteggere hub, moduli e API serverless. Ogni utente autenticato riceve i ruoli associati al proprio profilo (Superadmin, Admin, Agente, Resp. CER, Prosumer, Produttore, Consumer) e l'interfaccia abilita automaticamente le funzionalità pertinenti.

1. **Configura il client** — compila `config/firebase-config.js` con le credenziali del progetto Firebase (apiKey, authDomain, projectId, appId). Il file fornisce l'oggetto `window.__FIREBASE_CONFIG__` consumato dai moduli front-end. In alternativa puoi caricare un tuo script `type="module"` che inizializzi Firebase e assegni `window.firebaseApp`/`window.firebaseAuth` (ad esempio tramite lo snippet mostrato nella richiesta): la suite rileva automaticamente l'app/istanza già inizializzata e la riutilizza.
2. **Configura le funzioni Netlify** — imposta la variabile d'ambiente `FIREBASE_SERVICE_ACCOUNT` con il JSON del service account (preferibilmente Base64-encoded) per permettere alle funzioni di verificare gli ID token (`firebase-admin` viene inizializzato automaticamente).
3. **Assegna i ruoli** — utilizza i custom claims di Firebase per aggiungere l'array `roles` all'utente. I mapping supportano alias comuni (`resp_cer`, `cer_manager`, `producer`, `member`, ecc.) e gestiscono l'ereditarietà (es. il Superadmin eredita i permessi Admin/Agente).

### Gestione utenti & ruoli

I Superadmin possono amministrare gli account direttamente dall'interfaccia `/modules/utenti/`:

- **Lista utenti** — la tabella mostra email, nome, ruoli e cabine autorizzate. Il pulsante "Aggiorna elenco" ricarica i dati tramite la funzione Netlify `admin-users`.
- **Modifica profilo** — seleziona "Gestisci" per cambiare ruoli, territori, password iniziale o sospendere l'accesso. Solo i Superadmin (es. `adv.bg.david@gmail.com`) possono salvare le modifiche.
- **Nuovo utente** — il form in fondo crea un utente Firebase con password iniziale e assegna i ruoli richiesti, applicando i custom claims `roles` e `territories`.

Le chiamate alle API amministrative richiedono un ID token con ruolo `superadmin`; le modifiche propagano automaticamente i nuovi claims revocando i refresh token precedenti.

L'endpoint `/.netlify/functions/whoami` restituisce le informazioni della sessione autenticata (email, ruoli e claims principali). Le pagine di login e le intestazioni mostrano lo stato della sessione e consentono il logout.

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

## Deploy Netlify / cartella `site`

Il front-end statico viene pubblicato tramite la cartella `site/`. Prima di effettuare un deploy eseguire:

```bash
npm run build
```

Il comando sincronizza `index.html`, `assets/`, `modules/` e `config/` dentro `site/` (lasciando intatta la sottocartella `site/assets/models` che ospita i template `.docx` caricati manualmente). Netlify usa quindi `site/` come directory `publish` e `netlify/functions/` per le API serverless.
