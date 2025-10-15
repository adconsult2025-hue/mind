# Modelli documento CER personalizzabili

I file HTML in questa cartella sono caricati dall'interfaccia Documenti della Suite. Puoi modificarli per adattare Statuto, Regolamento, Atto costitutivo, Accordo Produttore/Prosumer e gli altri modelli alle esigenze della tua organizzazione senza dover intervenire sul codice JavaScript.

Modelli disponibili:

- `statuto.html`
- `regolamento.html`
- `atto_costitutivo.html`
- `adesione.html`
- `delega_gse.html`
- `contratto_trader.html`
- `informativa_gdpr.html`
- `accordo_produttore_prosumer.html`

## Come funzionano i segnaposto

Ogni file include dei `{{SEGNAPOSTO}}` che vengono sostituiti automaticamente con i dati della CER (nome, cabina primaria, membri, impianti ecc.). I principali segnaposto disponibili sono:

- `{{CER_NOME}}`, `{{CER_COMUNE}}`, `{{CER_CABINA}}`
- `{{CER_QUOTA_PERCENT}}`, `{{CER_RIPARTO}}`, `{{CER_RP_PROD_PERCENT}}`, `{{CER_RP_PROS_PERCENT}}`, `{{CER_RP_CER_PERCENT}}`
- `{{CER_TRADER}}`, `{{CER_TRADER_CONTRACT}}`
- `{{CER_MEMBRI_TABLE}}`, `{{CER_MEMBRI_LIST}}`, `{{CER_MEMBRI_TABLE_ROWS}}`
- `{{CER_IMPIANTI_SECTION}}`, `{{CER_IMPIANTI_REGOLAMENTO_BLOCK}}`, `{{CER_IMPIANTI_TABLE}}`, `{{CER_IMPIANTI_ROWS}}`
- `{{MEMBER_NOME}}`, `{{MEMBER_POD}}`, `{{MEMBER_RUOLO}}`, `{{MEMBER_COMUNE}}` (per il modello di adesione)
- `{{DELEGATE_NAME}}` (per la delega GSE)
- `{{SUBJECT_DENOMINAZIONE}}`, `{{SUBJECT_EMAIL}}`, `{{SUBJECT_PEC}}`, `{{SUBJECT_ADDRESS}}` (per l'informativa privacy)
- `{{TODAY}}` (data corrente) e `{{BASE_STYLE}}` (stile tipografico di base)

Altri segnaposto utili: `{{CER_CF}}`, `{{CER_NOTES}}`, `{{CER_MEMBRI_COUNT}}`, `{{CER_IMPIANTI_COUNT}}`.

Se un segnaposto non è valorizzato, viene sostituito con una stringa vuota. Puoi aggiungere testo, liste, tabelle o altri elementi HTML liberamente.

## Aggiornare i file

1. Apri il file da modificare (es. `statuto.html`).
2. Apporta le modifiche desiderate mantenendo i segnaposto necessari.
3. Salva il file e ricarica la pagina web: la Suite userà automaticamente la nuova versione.

In alternativa, nella sezione **Documenti** puoi caricare un file HTML personalizzato per ciascuno dei modelli standard (Statuto, Regolamento, Atto costitutivo, Adesione, Delega GSE, Contratto Trader, Informativa GDPR e Accordo Produttore/Prosumer) attraverso gli appositi selettori. Queste sostituzioni sono temporanee e restano attive finché la pagina rimane aperta.

> Suggerimento: se vuoi ripristinare i modelli originali puoi copiare il contenuto dalla versione Git precedente oppure cancellare il file. In assenza di un file personalizzato la Suite tornerà al modello standard incorporato nel codice.
