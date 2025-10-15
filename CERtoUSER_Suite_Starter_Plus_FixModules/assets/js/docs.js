const CER_TEMPLATE_PATH = '/config/templates/cer';
const templateCache = new Map();
const runtimeTemplateOverrides = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) return `${num}%`;
  return escapeHtml(String(value));
}

const baseStyles = `
  <style>
    body { font-family: 'Times New Roman', serif; color: #000; }
    h1,h2,h3 { text-align:center; }
    table { width:100%; border-collapse: collapse; margin: 8px 0;}
    td,th { border:1px solid #000; padding:6px; }
    .small { font-size:12px; }
    ol, ul { margin:8px 0 8px 24px; }
  </style>
`;

function buildMembersArtifacts(membri = []) {
  const rows = membri.map((m) => `
    <tr><td>${escapeHtml(m.nome)}</td><td>${escapeHtml(m.ruolo)}</td><td>${escapeHtml(m.pod)}</td><td>${escapeHtml(m.comune || '')}</td></tr>
  `).join('');
  const list = membri.map((m) => `<li>${escapeHtml(m.nome)} — ${escapeHtml(m.ruolo)} — POD ${escapeHtml(m.pod)}</li>`).join('');
  const table = `
    <table>
      <tr><th>Nome/Ragione Sociale</th><th>Ruolo</th><th>POD</th><th>Comune</th></tr>
      ${rows}
    </table>
  `;
  return { rows, list, table };
}

function buildImpiantiArtifacts(cer = {}, membri = []) {
  const memberIndex = membri.reduce((acc, cur) => ({ ...acc, [cur.id]: cur }), {});
  const impianti = Array.isArray(cer.impianti) ? cer.impianti : [];
  const rows = impianti.map((imp) => {
    const owner = memberIndex[imp.titolareId];
    const ownerName = owner ? owner.nome : (imp.titolareNome || '-');
    const ownerRole = owner ? owner.ruolo : (imp.titolareRuolo || '');
    const shareText = (imp.shares || []).map((share) => {
      const target = memberIndex[share.membroId];
      const label = target ? target.nome : share.membroId;
      const perc = share.percentuale ?? share.share ?? '';
      return `${escapeHtml(label)}: ${escapeHtml(String(perc))}%`;
    }).join('<br/>');
    const kwp = imp.potenza_kwp ? `${escapeHtml(String(imp.potenza_kwp))} kWp` : '-';
    return `<tr><td>${escapeHtml(imp.nome)}</td><td>${escapeHtml(ownerName)} (${escapeHtml(ownerRole)})</td><td>${kwp}</td><td>${shareText}</td></tr>`;
  }).join('');

  if (!rows) {
    return { rows: '', list: '', table: '', section: '' };
  }

  const list = impianti.map((imp) => {
    const owner = memberIndex[imp.titolareId];
    const ownerName = owner ? owner.nome : (imp.titolareNome || '-');
    const shares = (imp.shares || []).map((share) => {
      const target = memberIndex[share.membroId];
      const label = target ? target.nome : share.membroId;
      const perc = share.percentuale ?? share.share ?? '';
      return `${escapeHtml(label)} (${escapeHtml(String(perc))}%)`;
    }).join(', ');
    return `<li><strong>${escapeHtml(imp.nome)}</strong> — titolare: ${escapeHtml(ownerName)} — riparto: ${shares}</li>`;
  }).join('');

  const table = `
    <table>
      <tr><th>Impianto</th><th>Titolare</th><th>Potenza</th><th>Riparto benefici</th></tr>
      ${rows}
    </table>
  `;

  const section = `
    <h3>Art. 4-bis - Impianti e criteri di riparto</h3>
    <p>Ogni impianto fotovoltaico della CER assegna il 100% dei benefici ai membri secondo le percentuali deliberate, nel rispetto del DM 7 dicembre 2023.</p>
    ${table}
  `;

  return { rows, list, table, section };
}

function buildDocContext(cer = {}, membri = []) {
  const today = new Date().toLocaleDateString('it-IT');
  const membriArtifacts = buildMembersArtifacts(membri);
  const impiantiArtifacts = buildImpiantiArtifacts(cer, membri);
  const traderDisplay = cer?.trader ? escapeHtml(cer.trader) : '-';
  const traderContract = cer?.trader ? escapeHtml(cer.trader) : '________________';

  const impiantiRegolamentoBlock = impiantiArtifacts.list
    ? `<h4>3-bis. Ripartizione per impianto</h4><ul>${impiantiArtifacts.list}</ul>`
    : '';

  const delegateName = cer?.referente ? escapeHtml(cer.referente) : '____________________';

  return {
    BASE_STYLE: baseStyles,
    TODAY: today,
    CER_NOME: escapeHtml(cer.nome || ''),
    CER_COMUNE: escapeHtml(cer.comune || ''),
    CER_CABINA: escapeHtml(cer.cabina || ''),
    CER_CF: escapeHtml(cer.cf || '-'),
    CER_NOTES: escapeHtml(cer.note || ''),
    CER_TEMPLATE_CODE: escapeHtml(cer.template_code || ''),
    CER_QUOTA: escapeHtml(cer.quota ?? ''),
    CER_QUOTA_PERCENT: formatPercent(cer.quota),
    CER_RIPARTO: escapeHtml(cer.riparto || ''),
    CER_RP_PROD: escapeHtml(cer.rp_prod ?? ''),
    CER_RP_PROS: escapeHtml(cer.rp_pros ?? ''),
    CER_RP_CER: escapeHtml(cer.rp_cer ?? ''),
    CER_RP_PROD_PERCENT: formatPercent(cer.rp_prod),
    CER_RP_PROS_PERCENT: formatPercent(cer.rp_pros),
    CER_RP_CER_PERCENT: formatPercent(cer.rp_cer),
    CER_TRADER: traderDisplay,
    CER_TRADER_CONTRACT: traderContract,
    CER_MEMBRI_COUNT: membri.length,
    CER_MEMBRI_TABLE_ROWS: membriArtifacts.rows,
    CER_MEMBRI_LIST: membriArtifacts.list,
    CER_MEMBRI_TABLE: membriArtifacts.table,
    CER_IMPIANTI_ROWS: impiantiArtifacts.rows,
    CER_IMPIANTI_LIST: impiantiArtifacts.list,
    CER_IMPIANTI_TABLE: impiantiArtifacts.table,
    CER_IMPIANTI_SECTION: impiantiArtifacts.section,
    CER_IMPIANTI_REGOLAMENTO_BLOCK: impiantiRegolamentoBlock,
    CER_IMPIANTI_COUNT: Array.isArray(cer.impianti) ? cer.impianti.length : 0,
    DELEGATE_NAME: delegateName,
  };
}

function extendContext(base, extra = {}) {
  return { ...base, ...extra };
}

function buildMemberContext(membro = {}) {
  if (!membro) membro = {};
  return {
    MEMBER_NOME: escapeHtml(membro.nome || 'Membro'),
    MEMBER_RUOLO: escapeHtml(membro.ruolo || ''),
    MEMBER_POD: escapeHtml(membro.pod || ''),
    MEMBER_COMUNE: escapeHtml(membro.comune || ''),
  };
}

function buildSubjectContext(soggetto = {}) {
  return {
    SUBJECT_DENOMINAZIONE: escapeHtml(soggetto.denominazione || soggetto.nome || 'CER'),
    SUBJECT_EMAIL: escapeHtml(soggetto.email || ''),
    SUBJECT_PEC: escapeHtml(soggetto.pec || ''),
    SUBJECT_ADDRESS: escapeHtml(soggetto.indirizzo || soggetto.address || ''),
  };
}

function getTemplateCacheKey(name) {
  if (!name && name !== 0) return '';
  return String(name).trim();
}

async function loadCustomTemplate(name) {
  const key = getTemplateCacheKey(name);
  if (!key) return null;

  if (runtimeTemplateOverrides.has(key)) {
    return runtimeTemplateOverrides.get(key);
  }

  if (templateCache.has(key)) {
    return templateCache.get(key);
  }
  try {
    const res = await fetch(`${CER_TEMPLATE_PATH}/${key}.html`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Template ${name} not found`);
    const text = await res.text();
    templateCache.set(key, text);
    return text;
  } catch (err) {
    templateCache.set(key, null);
    return null;
  }
}

export function setRuntimeTemplate(name, html) {
  const key = getTemplateCacheKey(name);
  if (!key) return;

  if (typeof html === 'string' && html.trim()) {
    const normalized = html;
    runtimeTemplateOverrides.set(key, normalized);
    templateCache.set(key, normalized);
  } else {
    runtimeTemplateOverrides.delete(key);
    templateCache.delete(key);
  }
}

function applyTemplate(html, context) {
  if (!html) return '';
  if (!context) return html;
  return html.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key) => (key in context ? context[key] : ''));
}

async function renderWithFallback(name, context, fallbackRenderer) {
  const tpl = await loadCustomTemplate(name);
  if (tpl) {
    return applyTemplate(tpl, context);
  }
  return fallbackRenderer(context);
}

// Generate .doc files using HTML content captured from templates
export function saveDocFile(filename, html) {
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${filename}</title></head><body>`;
  const footer = `</body></html>`;
  const blob = new Blob([header + html + footer], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.doc') ? filename : (`${filename}.doc`);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function defaultStatutoTemplate(ctx) {
  return `
    ${ctx.BASE_STYLE}
    <h1>STATUTO DELLA COMUNITÀ ENERGETICA RINNOVABILE</h1>
    <h2>"${ctx.CER_NOME}"</h2>
    <p class="small">Bozza generata automaticamente il ${ctx.TODAY}. Riferimenti: DM 7 dicembre 2023, regolazioni ARERA/GSE. Da validare.</p>

    <h3>Art. 1 - Denominazione, sede e durata</h3>
    <p>È costituita la Comunità Energetica Rinnovabile denominata "<strong>${ctx.CER_NOME}</strong>", con sede nel Comune di <strong>${ctx.CER_COMUNE}</strong>, insistente sulla cabina primaria <strong>${ctx.CER_CABINA}</strong>. La durata è fissata sino al completamento dei periodi incentivanti e potrà essere prorogata.</p>

    <h3>Art. 2 - Oggetto</h3>
    <p>La CER persegue finalità di condivisione dell'energia rinnovabile prodotta localmente, massimizzando l'autoconsumo, la riduzione delle perdite e i benefici ambientali ed economici dei membri, nel rispetto della normativa vigente (DM 7/12/2023) e delle regole ARERA/GSE.</p>

    <h3>Art. 3 - Membri</h3>
    ${ctx.CER_MEMBRI_TABLE}

    <h3>Art. 4 - Regole di condivisione e riparti</h3>
    <p>La quota di energia condivisa è fissata al <strong>${ctx.CER_QUOTA_PERCENT}</strong>. I benefici economici sono ripartiti secondo il criterio "<strong>${ctx.CER_RIPARTO}</strong>" oppure secondo i seguenti valori personalizzati: Produttore <strong>${ctx.CER_RP_PROD_PERCENT}</strong>, Prosumer <strong>${ctx.CER_RP_PROS_PERCENT}</strong>, CER <strong>${ctx.CER_RP_CER_PERCENT}</strong> (somma 100%).</p>

    ${ctx.CER_IMPIANTI_SECTION || ''}

    <h3>Art. 5 - Organi</h3>
    <p>L'Assemblea dei Membri e il Responsabile/Amministratore della CER. Le modalità di convocazione, deliberazione e sostituzione sono definite nel Regolamento interno.</p>

    <h3>Art. 6 - Ammissione, recesso ed esclusione</h3>
    <p>Dettagli operativi in Regolamento: istruttoria, termini, effetti sul riparto incentivi e sull'energia condivisa.</p>

    <h3>Art. 7 - Conferimenti e costi</h3>
    <p>Eventuali conferimenti, costi di gestione e servizi (incluso eventuale operatore/franchising) saranno definiti dalla CER. Il trader delle eccedenze: <strong>${ctx.CER_TRADER}</strong>.</p>

    <h3>Art. 8 - Durata incentivi e rapporti con GSE</h3>
    <p>La CER opera in conformità alla regolazione GSE per la richiesta, gestione e rendicontazione degli incentivi previsti dal DM 7/12/2023.</p>

    <h3>Art. 9 - Disposizioni finali</h3>
    <p>Per quanto non previsto, si rinvia alla normativa vigente. Il presente Statuto è approvato dall'Assemblea costituente in data ${ctx.TODAY}.</p>
  `;
}

function defaultRegolamentoTemplate(ctx) {
  return `
    ${ctx.BASE_STYLE}
    <h1>REGOLAMENTO INTERNO</h1>
    <h2>"${ctx.CER_NOME}"</h2>
    <p>Bozza generata automaticamente il ${ctx.TODAY}. Da validare.</p>

    <h3>1. Membri e ruoli</h3>
    <ul>${ctx.CER_MEMBRI_LIST}</ul>

    <h3>2. Procedura di ammissione</h3>
    <ol>
      <li>Domanda di adesione con POD e dati identificativi;</li>
      <li>Verifica requisito di prossimità alla medesima cabina primaria (<strong>${ctx.CER_CABINA}</strong>);</li>
      <li>Accettazione da parte dell'Assemblea o del Responsabile, con aggiornamento del riparto.</li>
    </ol>

    <h3>3. Condivisione e riparti</h3>
    <p>Quota energia condivisa: <strong>${ctx.CER_QUOTA_PERCENT}</strong>. Riparto: <strong>${ctx.CER_RIPARTO}</strong> o personalizzato (Prod. ${ctx.CER_RP_PROD_PERCENT}, Pros. ${ctx.CER_RP_PROS_PERCENT}, CER ${ctx.CER_RP_CER_PERCENT}).</p>
    ${ctx.CER_IMPIANTI_REGOLAMENTO_BLOCK || ''}

    <h3>4. Gestione documentale</h3>
    <p>La CER adotta un cronoprogramma documentale in tre fasi: (i) Costituzione (Statuto, Atto costitutivo, Regolamento); (ii) Attivazione (contratti di connessione, delibere riparti, deleghe GSE); (iii) Operatività (rendicontazioni, variazioni membri).</p>

    <h3>5. Trader eccedenze</h3>
    <p>Trader indicato: <strong>${ctx.CER_TRADER}</strong>. I termini economici sono disciplinati dal relativo contratto.</p>

    <h3>6. Recesso ed esclusione</h3>
    <p>Preavviso, efficacia su riparti e incentivi, obbligo di aggiornamento comunicazioni al GSE.</p>

    <h3>7. Privacy e dati</h3>
    <p>La CER tratta i dati nel rispetto del GDPR. Il Responsabile tiene registro delle attività e degli accessi ai dati dei membri.</p>

    <h3>8. Disposizioni finali</h3>
    <p>Per quanto non espressamente previsto si rinvia allo Statuto e alle norme vigenti.</p>
  `;
}

function defaultAttoCostitutivoTemplate(ctx) {
  return `
    ${ctx.BASE_STYLE}
    <h1>ATTO COSTITUTIVO</h1>
    <p>In data ${ctx.TODAY}, in ${ctx.CER_COMUNE}, si costituisce la Comunità Energetica Rinnovabile denominata "<strong>${ctx.CER_NOME}</strong>" insistente sulla cabina primaria <strong>${ctx.CER_CABINA}</strong>.</p>
    <p>La CER adotta lo Statuto allegato e il Regolamento interno. Il Responsabile/Amministratore è nominato dall'Assemblea costituente.</p>
    <p>Codice Fiscale (se già disponibile): ${ctx.CER_CF}</p>
    <p>Si conferisce mandato per gli adempimenti verso GSE/ARERA e per l'apertura di posizioni fiscali e bancarie ove necessario.</p>
    <p>Letto, confermato e sottoscritto.</p>
  `;
}

function defaultAdesioneTemplate(ctx) {
  return `
    ${ctx.BASE_STYLE}
    <h1>ATTO DI ADESIONE ALLA CER "${ctx.CER_NOME}"</h1>
    <p>Il/La sottoscritto/a <strong>${ctx.MEMBER_NOME}</strong>, titolare del POD <strong>${ctx.MEMBER_POD}</strong>, chiede l'adesione alla CER insistente sulla cabina <strong>${ctx.CER_CABINA}</strong>, Comune di ${ctx.CER_COMUNE}.</p>
    <p>Ruolo dichiarato: <strong>${ctx.MEMBER_RUOLO}</strong>. Dichiara di aver preso visione di Statuto e Regolamento e di accettarne integralmente i contenuti.</p>
    <p>Data: ${ctx.TODAY} — Firma: ____________________</p>
  `;
}

function defaultDelegaTemplate(ctx) {
  const delegate = ctx.DELEGATE_NAME || '____________________';
  return `
    ${ctx.BASE_STYLE}
    <h1>DELEGA GSE</h1>
    <p>La CER "<strong>${ctx.CER_NOME}</strong>" delega <strong>${delegate}</strong> a operare sul portale GSE per tutte le pratiche relative alla CER (richiesta incentivi, gestione componenti, rendicontazioni).</p>
    <p>Cabina primaria: ${ctx.CER_CABINA} — Comune: ${ctx.CER_COMUNE}</p>
    <p>Data: ${ctx.TODAY} — Firma del Legale Rappresentante: ____________________</p>
  `;
}

function defaultContrattoTemplate(ctx) {
  return `
    ${ctx.BASE_STYLE}
    <h1>CONTRATTO DI CESSIONE ECCEDENZE</h1>
    <p>Tra: CER "<strong>${ctx.CER_NOME}</strong>" e il Trader <strong>${ctx.CER_TRADER_CONTRACT}</strong>.</p>
    <p>Oggetto: cessione dell'energia eccedente alle condivisioni, alle condizioni economiche concordate. Decorrenza: ${ctx.TODAY}.</p>
    <p>Riparti interni CER: Prod. ${ctx.CER_RP_PROD_PERCENT}, Pros. ${ctx.CER_RP_PROS_PERCENT}, CER ${ctx.CER_RP_CER_PERCENT}.</p>
    <p>Durata, penali, misurazione, fatturazione e corrispettivi saranno dettagliati in allegato tecnico.</p>
  `;
}

function defaultPrivacyTemplate(ctx) {
  return `
    ${ctx.BASE_STYLE}
    <h1>INFORMATIVA PRIVACY (GDPR)</h1>
    <p>Titolare: CER "${ctx.SUBJECT_DENOMINAZIONE}". Finalità: gestione CER/CRM, adempimenti normativi GSE/ARERA, rapporti contrattuali.</p>
    <p>Base giuridica: contratto/obbligo legale/interesse legittimo. Dati trattati: anagrafici, contatti, POD, consumi.</p>
    <p>Conservazione: durata della CER e termini di legge. Diritti: accesso, rettifica, cancellazione, limitazione, opposizione.</p>
    <p>Data: ${ctx.TODAY}</p>
  `;
}

function defaultAccordoProduttoreProsumerTemplate(ctx) {
  return `
    ${ctx.BASE_STYLE}
    <h1>ACCORDO PRODUTTORE/PROSUMER</h1>
    <p>Tra la Comunità Energetica Rinnovabile "<strong>${ctx.CER_NOME}</strong>", con sede nel Comune di ${ctx.CER_COMUNE} e cabina primaria ${ctx.CER_CABINA},</p>
    <p>e il/la ${ctx.MEMBER_RUOLO ? ctx.MEMBER_RUOLO.toLowerCase() : 'membro'} <strong>${ctx.MEMBER_NOME}</strong>, titolare del POD <strong>${ctx.MEMBER_POD}</strong>.</p>
    <p>Le parti concordano di condividere l'energia prodotta e/o autoconsumata nel rispetto del DM 7 dicembre 2023, delle regole ARERA/GSE e del Regolamento interno della CER.</p>
    <p>Il membro si impegna a comunicare tempestivamente eventuali variazioni dei propri dati anagrafici e del POD, a collaborare per il monitoraggio energetico e ad attenersi alle delibere della CER.</p>
    <p>La CER si impegna a ripartire i benefici economici secondo i criteri approvati dall'Assemblea (quota condivisa ${ctx.CER_QUOTA_PERCENT}, riparto ${ctx.CER_RIPARTO} o personalizzato).</p>
    <p>Decorrenza: ${ctx.TODAY}. Il presente accordo è valido finché il membro mantiene il ruolo di Produttore/Prosumer all'interno della CER.</p>
    <p>Firme:<br/>CER "${ctx.CER_NOME}" ____________________<br/>${ctx.MEMBER_NOME} ____________________</p>
  `;
}

export async function statutoTemplate(cer, membri) {
  const context = buildDocContext(cer, membri);
  return renderWithFallback('statuto', context, defaultStatutoTemplate);
}

export async function regolamentoTemplate(cer, membri) {
  const context = buildDocContext(cer, membri);
  return renderWithFallback('regolamento', context, defaultRegolamentoTemplate);
}

export async function attoCostitutivoTemplate(cer) {
  const context = buildDocContext(cer, cer?.membri || []);
  return renderWithFallback('atto_costitutivo', context, defaultAttoCostitutivoTemplate);
}

export async function adesioneTemplate(cer, membro) {
  const context = extendContext(buildDocContext(cer, cer?.membri || []), buildMemberContext(membro));
  return renderWithFallback('adesione', context, defaultAdesioneTemplate);
}

export async function delegaGSETemplate(cer, membri) {
  const context = buildDocContext(cer, membri);
  return renderWithFallback('delega_gse', context, defaultDelegaTemplate);
}

export async function contrattoTraderTemplate(cer) {
  const context = buildDocContext(cer, cer?.membri || []);
  return renderWithFallback('contratto_trader', context, defaultContrattoTemplate);
}

export async function informativaGDPRTemplate(soggetto) {
  const context = extendContext(buildDocContext(soggetto, soggetto?.membri || []), buildSubjectContext(soggetto));
  return renderWithFallback('informativa_gdpr', context, defaultPrivacyTemplate);
}

export async function accordoProduttoreProsumerTemplate(cer, membro) {
  const context = extendContext(buildDocContext(cer, cer?.membri || []), buildMemberContext(membro));
  return renderWithFallback('accordo_produttore_prosumer', context, defaultAccordoProduttoreProsumerTemplate);
}
