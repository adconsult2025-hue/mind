// Generate .doc files using HTML content captured from templates
export function saveDocFile(filename, html) {
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${filename}</title></head><body>`;
  const footer = `</body></html>`;
  const blob = new Blob([header + html + footer], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.doc') ? filename : (filename + '.doc');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function statutoTemplate(cer, membri) {
  const today = new Date().toLocaleDateString('it-IT');
  const membriList = membri.map(m => `
    <tr><td>${m.nome}</td><td>${m.ruolo}</td><td>${m.pod}</td><td>${m.comune||''}</td></tr>
  `).join('');
  const memberIndex = membri.reduce((acc, cur) => ({ ...acc, [cur.id]: cur }), {});
  const impRows = (cer.impianti || []).map(imp => {
    const owner = memberIndex[imp.titolareId];
    const ownerName = owner ? owner.nome : (imp.titolareNome || '-');
    const ownerRole = owner ? owner.ruolo : (imp.titolareRuolo || '');
    const shareText = (imp.shares || []).map(share => {
      const target = memberIndex[share.membroId];
      const label = target ? target.nome : share.membroId;
      return `${label}: ${share.percentuale}%`;
    }).join('<br/>');
    const kwp = imp.potenza_kwp ? `${imp.potenza_kwp} kWp` : '-';
    return `<tr><td>${imp.nome}</td><td>${ownerName} (${ownerRole})</td><td>${kwp}</td><td>${shareText}</td></tr>`;
  }).join('');
  const impiantiSection = impRows
    ? `
  <h3>Art. 4-bis - Impianti e criteri di riparto</h3>
  <p>Ogni impianto fotovoltaico della CER assegna il 100% dei benefici ai membri secondo le percentuali deliberate, nel rispetto del DM 7 dicembre 2023.</p>
  <table>
    <tr><th>Impianto</th><th>Titolare</th><th>Potenza</th><th>Riparto benefici</th></tr>
    ${impRows}
  </table>
  `
    : '';

  return `
  <style>
    body { font-family: 'Times New Roman', serif; color: #000; }
    h1,h2,h3 { text-align:center; }
    table { width:100%; border-collapse: collapse; margin: 8px 0;}
    td,th { border:1px solid #000; padding:6px; }
    .small { font-size:12px; }
  </style>
  <h1>STATUTO DELLA COMUNITÀ ENERGETICA RINNOVABILE</h1>
  <h2>"${cer.nome}"</h2>
  <p class="small">Bozza generata automaticamente il ${today}. Riferimenti: DM 7 dicembre 2023, regolazioni ARERA/GSE. Da validare.</p>

  <h3>Art. 1 - Denominazione, sede e durata</h3>
  <p>È costituita la Comunità Energetica Rinnovabile denominata "<strong>${cer.nome}</strong>", con sede nel Comune di <strong>${cer.comune}</strong>, insistente sulla cabina primaria <strong>${cer.cabina}</strong>. La durata è fissata sino al completamento dei periodi incentivanti e potrà essere prorogata.</p>

  <h3>Art. 2 - Oggetto</h3>
  <p>La CER persegue finalità di condivisione dell'energia rinnovabile prodotta localmente, massimizzando l'autoconsumo, la riduzione delle perdite e i benefici ambientali ed economici dei membri, nel rispetto della normativa vigente (DM 7/12/2023) e delle regole ARERA/GSE.</p>

  <h3>Art. 3 - Membri</h3>
  <table>
    <tr><th>Nome/Ragione Sociale</th><th>Ruolo</th><th>POD</th><th>Comune</th></tr>
    ${membriList}
  </table>

  <h3>Art. 4 - Regole di condivisione e riparti</h3>
  <p>La quota di energia condivisa è fissata al <strong>${cer.quota}%</strong>. I benefici economici sono ripartiti secondo il criterio "<strong>${cer.riparto}</strong>" oppure secondo i seguenti valori personalizzati: Produttore <strong>${cer.rp_prod}%</strong>, Prosumer <strong>${cer.rp_pros}%</strong>, CER <strong>${cer.rp_cer}%</strong> (somma 100%).</p>

  ${impiantiSection}

  <h3>Art. 5 - Organi</h3>
  <p>L'Assemblea dei Membri e il Responsabile/Amministratore della CER. Le modalità di convocazione, deliberazione e sostituzione sono definite nel Regolamento interno.</p>

  <h3>Art. 6 - Ammissione, recesso ed esclusione</h3>
  <p>Dettagli operativi in Regolamento: istruttoria, termini, effetti sul riparto incentivi e sull'energia condivisa.</p>

  <h3>Art. 7 - Conferimenti e costi</h3>
  <p>Eventuali conferimenti, costi di gestione e servizi (incluso eventuale operatore/franchising) saranno definiti dalla CER. Il trader delle eccedenze: <strong>${cer.trader||'-'}</strong>.</p>

  <h3>Art. 8 - Durata incentivi e rapporti con GSE</h3>
  <p>La CER opera in conformità alla regolazione GSE per la richiesta, gestione e rendicontazione degli incentivi previsti dal DM 7/12/2023.</p>

  <h3>Art. 9 - Disposizioni finali</h3>
  <p>Per quanto non previsto, si rinvia alla normativa vigente. Il presente Statuto è approvato dall'Assemblea costituente in data ${today}.</p>
  `;
}

export function regolamentoTemplate(cer, membri) {
  const today = new Date().toLocaleDateString('it-IT');
  const rows = membri.map(m => `<li>${m.nome} — ${m.ruolo} — POD ${m.pod}</li>`).join('');
  const memberIndex = membri.reduce((acc, cur) => ({ ...acc, [cur.id]: cur }), {});
  const impList = (cer.impianti || []).map(imp => {
    const owner = memberIndex[imp.titolareId];
    const ownerName = owner ? owner.nome : (imp.titolareNome || '-');
    const shares = (imp.shares || []).map(share => {
      const target = memberIndex[share.membroId];
      const label = target ? target.nome : share.membroId;
      return `${label} (${share.percentuale}%)`;
    }).join(', ');
    return `<li><strong>${imp.nome}</strong> — titolare: ${ownerName} — riparto: ${shares}</li>`;
  }).join('');
  const impiantiBlock = impList
    ? `<h4>3-bis. Ripartizione per impianto</h4><ul>${impList}</ul>`
    : '';
  return `
  <style>
    body { font-family: 'Times New Roman', serif; color: #000; }
    h1,h2 { text-align:center; }
    ol, ul { margin:8px 0 8px 24px; }
  </style>
  <h1>REGOLAMENTO INTERNO</h1>
  <h2>"${cer.nome}"</h2>
  <p>Bozza generata automaticamente il ${today}. Da validare.</p>

  <h3>1. Membri e ruoli</h3>
  <ul>${rows}</ul>

  <h3>2. Procedura di ammissione</h3>
  <ol>
    <li>Domanda di adesione con POD e dati identificativi;</li>
    <li>Verifica requisito di prossimità alla medesima cabina primaria (<strong>${cer.cabina}</strong>);</li>
    <li>Accettazione da parte dell'Assemblea o del Responsabile, con aggiornamento del riparto.</li>
  </ol>

  <h3>3. Condivisione e riparti</h3>
  <p>Quota energia condivisa: <strong>${cer.quota}%</strong>. Riparto: <strong>${cer.riparto}</strong> o personalizzato (Prod. ${cer.rp_prod}%, Pros. ${cer.rp_pros}%, CER ${cer.rp_cer}%).</p>
  ${impiantiBlock}

  <h3>4. Gestione documentale</h3>
  <p>La CER adotta un cronoprogramma documentale in tre fasi: (i) Costituzione (Statuto, Atto costitutivo, Regolamento); (ii) Attivazione (contratti di connessione, delibere riparti, deleghe GSE); (iii) Operatività (rendicontazioni, variazioni membri).</p>

  <h3>5. Trader eccedenze</h3>
  <p>Trader indicato: <strong>${cer.trader||'-'}</strong>. I termini economici sono disciplinati dal relativo contratto.</p>

  <h3>6. Recesso ed esclusione</h3>
  <p>Preavviso, efficacia su riparti e incentivi, obbligo di aggiornamento comunicazioni al GSE.</p>

  <h3>7. Privacy e dati</h3>
  <p>La CER tratta i dati nel rispetto del GDPR. Il Responsabile tiene registro delle attività e degli accessi ai dati dei membri.</p>

  <h3>8. Disposizioni finali</h3>
  <p>Per quanto non espressamente previsto si rinvia allo Statuto e alle norme vigenti.</p>
  `;
}



export function attoCostitutivoTemplate(cer){
  const today = new Date().toLocaleDateString('it-IT');
  return `
  <style>body{font-family:'Times New Roman',serif;color:#000}</style>
  <h1>ATTO COSTITUTIVO</h1>
  <p>In data ${today}, in ${cer.comune}, si costituisce la Comunità Energetica Rinnovabile denominata "<strong>${cer.nome}</strong>" insistente sulla cabina primaria <strong>${cer.cabina}</strong>.</p>
  <p>La CER adotta lo Statuto allegato e il Regolamento interno. Il Responsabile/Amministratore è nominato dall'Assemblea costituente.</p>
  <p>Codice Fiscale (se già disponibile): ${cer.cf || '-'}</p>
  <p>Si conferisce mandato per gli adempimenti verso GSE/ARERA e per l'apertura di posizioni fiscali e bancarie ove necessario.</p>
  <p>Letto, confermato e sottoscritto.</p>
  `;
}

export function adesioneTemplate(cer, membro){
  const today = new Date().toLocaleDateString('it-IT');
  return `
  <style>body{font-family:'Times New Roman',serif;color:#000}</style>
  <h1>ATTO DI ADESIONE ALLA CER "${cer.nome}"</h1>
  <p>Il/La sottoscritto/a <strong>${membro.nome}</strong>, titolare del POD <strong>${membro.pod}</strong>, chiede l'adesione alla CER insistente sulla cabina <strong>${cer.cabina}</strong>, Comune di ${cer.comune}.</p>
  <p>Ruolo dichiarato: <strong>${membro.ruolo}</strong>. Dichiara di aver preso visione di Statuto e Regolamento e di accettarne integralmente i contenuti.</p>
  <p>Data: ${today} — Firma: ____________________</p>
  `;
}

export function delegaGSETemplate(cer, rappresentante){
  const today = new Date().toLocaleDateString('it-IT');
  return `
  <style>body{font-family:'Times New Roman',serif;color:#000}</style>
  <h1>DELEGA GSE</h1>
  <p>La CER "<strong>${cer.nome}</strong>" delega <strong>${rappresentante||'____________________'}</strong> a operare sul portale GSE per tutte le pratiche relative alla CER (richiesta incentivi, gestione componenti, rendicontazioni).</p>
  <p>Cabina primaria: ${cer.cabina} — Comune: ${cer.comune}</p>
  <p>Data: ${today} — Firma del Legale Rappresentante: ____________________</p>
  `;
}

export function contrattoTraderTemplate(cer){
  const today = new Date().toLocaleDateString('it-IT');
  return `
  <style>body{font-family:'Times New Roman',serif;color:#000}</style>
  <h1>CONTRATTO DI CESSIONE ECCEDENZE</h1>
  <p>Tra: CER "<strong>${cer.nome}</strong>" e il Trader <strong>${cer.trader||'________________'}</strong>.</p>
  <p>Oggetto: cessione dell'energia eccedente alle condivisioni, alle condizioni economiche concordate. Decorrenza: ${today}.</p>
  <p>Riparti interni CER: Prod. ${cer.rp_prod}%, Pros. ${cer.rp_pros}%, CER ${cer.rp_cer}%.</p>
  <p>Durata, penali, misurazione, fatturazione e corrispettivi saranno dettagliati in allegato tecnico.</p>
  `;
}

export function informativaGDPRTemplate(soggetto){
  const today = new Date().toLocaleDateString('it-IT');
  return `
  <style>body{font-family:'Times New Roman',serif;color:#000}</style>
  <h1>INFORMATIVA PRIVACY (GDPR)</h1>
  <p>Titolare: CER "${soggetto.denominazione||soggetto.nome||'CER'}". Finalità: gestione CER/CRM, adempimenti normativi GSE/ARERA, rapporti contrattuali.</p>
  <p>Base giuridica: contratto/obbligo legale/interesse legittimo. Dati trattati: anagrafici, contatti, POD, consumi.</p>
  <p>Conservazione: durata della CER e termini di legge. Diritti: accesso, rettifica, cancellazione, limitazione, opposizione.</p>
  <p>Data: ${today}</p>
  `;
}

export function accordoProduttoreProsumerTemplate(cer, membro) {
  const today = new Date().toLocaleDateString('it-IT');
  const ruolo = membro?.ruolo || 'Produttore/Prosumer';
  const ruoloLabel = ruolo.toLowerCase();
  return `
  <style>body{font-family:'Times New Roman',serif;color:#000}</style>
  <h1>ACCORDO PRODUTTORE/PROSUMER</h1>
  <p>Tra la Comunità Energetica Rinnovabile "<strong>${cer.nome}</strong>", con sede nel Comune di ${cer.comune} e cabina primaria ${cer.cabina},</p>
  <p>e il/la ${ruoloLabel} <strong>${membro?.nome || '________________'}</strong>, titolare del POD <strong>${membro?.pod || '________________'}</strong>.</p>
  <p>Le parti concordano di condividere l'energia prodotta e/o autoconsumata nel rispetto del DM 7 dicembre 2023, delle regole ARERA/GSE e del Regolamento interno della CER.</p>
  <p>Il membro si impegna a comunicare tempestivamente eventuali variazioni dei propri dati anagrafici e del POD, a collaborare per il monitoraggio energetico e ad attenersi alle delibere della CER.</p>
  <p>La CER si impegna a ripartire i benefici economici secondo i criteri approvati dall'Assemblea (quota condivisa ${cer.quota || 0}%, riparto ${cer.riparto || 'standard'} o personalizzato).</p>
  <p>Decorrenza: ${today}. Il presente accordo è valido finché il membro mantiene il ruolo di Produttore/Prosumer all'interno della CER.</p>
  <p>Firme:<br/>CER "${cer.nome}" ____________________<br/>${membro?.nome || '________________'} ____________________</p>
  `;
}
