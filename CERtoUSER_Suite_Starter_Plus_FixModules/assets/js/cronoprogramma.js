import { apiFetch } from './api.js?v=26';

const API_BASE = '/api';

const SAFE_MODE = typeof window !== 'undefined' && (window.__SAFE_MODE__ === true || String(window.SAFE_MODE).toLowerCase() === 'true');

export const STATE = {
  currentClientId: null,
  currentCerId: null,
  currentPlantId: null
};

const docRegistry = new Map();

export const CER_PHASES = [
  {
    id: 0,
    key: 'scouting',
    title: 'Fase 0 — Scouting & Pre-check',
    description: 'Valutazione preliminare di membri, cabina primaria e potenziale di condivisione prima dell’avvio formale.',
    activities: [
      'Analizzare le anagrafiche CRM e individuare POD insistenti sulla stessa cabina primaria',
      'Verificare requisiti ARERA/GSE e vincoli urbanistici/territoriali',
      'Stimare volumi energetici condivisibili e modello di governance preliminare'
    ],
    deliverables: [
      'Checklist requisiti minimi (ARERA/GSE)',
      'Lettere di manifestazione di interesse firmate',
      'Report di fattibilità tecnico-economica'
    ],
    go_no_go: [
      'Cabina primaria e POD compatibili confermati',
      'Volume minimo di energia condivisibile raggiunto',
      'Sponsor e responsabile di progetto nominati'
    ]
  },
  {
    id: 1,
    key: 'legale',
    title: 'Fase 1 — Governance & Documenti costitutivi',
    description: 'Costituzione formale della CER con definizione ruoli, organi e documentazione legale.',
    activities: [
      'Redigere statuto, regolamento e atto costitutivo con riferimenti al DM 7 dicembre 2023',
      'Definire ruoli (Responsabile, Referenti tecnici, Organi deliberanti) e quorum assembleari',
      'Raccogliere dati anagrafici e POD dei membri ammessi'
    ],
    deliverables: [
      'Bozze statuto, regolamento e atto costitutivo in formato editabile',
      'Delibera di nomina organi e responsabile CER',
      'Registro membri con ruoli e quote di partecipazione'
    ],
    go_no_go: [
      'Documenti approvati dall’assemblea costituente',
      'Responsabile CER accetta l’incarico',
      'Membri allineati su governance e quote di partecipazione'
    ]
  },
  {
    id: 2,
    key: 'impianti',
    title: 'Fase 2 — Ingegneria & connessioni',
    description: 'Raccolta dati impiantistici, contratti di connessione e validazione tecnica.',
    activities: [
      'Mappare impianti fotovoltaici disponibili e relativa potenza',
      'Verificare stato connessione e convenzioni di uso/diritto sui siti',
      'Raccogliere schede tecniche e layout elettrici aggiornati'
    ],
    deliverables: [
      'Schede impianto (potenza, POD produttore, titolarità)',
      'Contratti di connessione e convenzioni d’uso',
      'Relazione tecnica con piano di entrata in esercizio'
    ],
    go_no_go: [
      'Tutti gli impianti richiesti dispongono di titolo di disponibilità',
      'Connessione attiva o con tempi certi di attivazione',
      'Layout elettrico conforme ai requisiti GSE'
    ]
  },
  {
    id: 3,
    key: 'riparti',
    title: 'Fase 3 — Configurazione impianti & riparti',
    description: 'Allineamento tra impianti, tipologie A/B, percentuali di riparto e simulazione economica.',
    activities: [
      'Configurare gli impianti nella Suite con tipologia A/B e percentuali CER/controparte',
      'Associare membri, ruoli e pesi di consumo per ciascun impianto',
      'Eseguire simulazione incentivi e “Ricalcola periodo” per il mese di avvio'
    ],
    deliverables: [
      'Matrici di riparto per impianto con dettaglio membri',
      'Report anteprima incentivi e quota energia condivisa',
      'Verbale di approvazione riparti e criteri economici'
    ],
    go_no_go: [
      'Tutte le tipologie impianto coerenti con i membri assegnati',
      'Riparti percentuali 100% validati e salvati',
      'Simulazione incentivo approvata dal responsabile finanziario'
    ]
  },
  {
    id: 4,
    key: 'gse',
    title: 'Fase 4 — Pratiche GSE & autorizzazioni',
    description: 'Predisposizione e invio della documentazione al portale GSE con controllo allegati.',
    activities: [
      'Raccogliere versioni firmate di statuto, regolamento e deleghe GSE',
      'Preparare prospetto POD e mappa cabina primaria',
      'Verificare completezza allegati richiesti dal portale GSE'
    ],
    deliverables: [
      'Dossier pratica GSE con tutti gli allegati',
      'Elenco POD firmato e dichiarazioni responsabile',
      'Upload ricevute di presentazione istanza'
    ],
    go_no_go: [
      'Documentazione caricata e validata sul portale GSE',
      'Conferma ricezione istanza e protocollazione',
      'Check list allegati completa senza non conformità'
    ]
  },
  {
    id: 5,
    key: 'avvio',
    title: 'Fase 5 — Attivazione & collaudo',
    description: 'Gestione lavori, collaudo impianti, attivazione convenzioni e avvio della CER.',
    activities: [
      'Coordinare lavori di adeguamento e collaudi su impianti e misure',
      'Attivare convenzioni di vendita eccedenze e servizi ancillari',
      'Formalizzare ingresso in esercizio e comunicazione ai membri'
    ],
    deliverables: [
      'Verbali di collaudo e rapporti di prova',
      'Contratti trader o controparte firmati',
      'Comunicazione ufficiale di entrata in esercizio'
    ],
    go_no_go: [
      'Impianti collaudati e misure attive',
      'Convenzioni economicamente efficaci',
      'Data di avvio comunicata e approvata dal GSE'
    ]
  },
  {
    id: 6,
    key: 'ottimizzazione',
    title: 'Fase 6 — Monitoraggio & ottimizzazione',
    description: 'Monitoraggio operativo della CER, ottimizzazione riparti e rendicontazione periodica.',
    activities: [
      'Monitorare KPI energia condivisa e incentivi con dashboard periodiche',
      'Aggiornare riparti e membership su base trimestrale o a seguito di variazioni',
      'Gestire caricamento documenti periodici (rendiconti, report ambientali)'
    ],
    deliverables: [
      'Report mensile energia condivisa e benefici economici',
      'Registro aggiornato membri/impianti con variazioni approvate',
      'Piano di ottimizzazione e interventi correttivi'
    ],
    go_no_go: [
      'KPI entro soglie target definite dalla governance',
      'Riparti aggiornati e comunicati ai membri',
      'Documentazione periodica caricata e condivisa'
    ]
  }
];

const workflowCache = new Map(); // cerId -> Map(phase -> workflow)
const docsCache = new Map(); // cerId -> Map(phase -> docs[])

let containerEl;
let feedbackEl;
let selectEl;
let exportBtnEl;
let printBtnEl;
let activeCerId = '';
let navigateToPlants = () => {};
let triggerRecalc = () => {};
let initialized = false;

if (typeof document !== 'undefined') {
  document.addEventListener('click', handleGlobalDocActions);
}

const phaseModal = {
  root: null,
  title: null,
  description: null,
  lists: null,
  owner: null,
  due: null,
  notes: null,
  hiddenId: null,
  shortcuts: null,
  saveBtn: null
};

const gseModal = { root: null };

export function initCronoprogrammaUI({ container, feedback, select, exportBtn, printBtn, onNavigateToPlants, onTriggerRecalc }) {
  containerEl = resolveElement(container);
  feedbackEl = resolveElement(feedback);
  selectEl = resolveElement(select);
  exportBtnEl = resolveElement(exportBtn);
  printBtnEl = resolveElement(printBtn);
  navigateToPlants = onNavigateToPlants || (() => {});
  triggerRecalc = onTriggerRecalc || (() => {});

  setupModals();

  if (selectEl) {
    selectEl.addEventListener('change', () => {
      renderCronoprogramma(selectEl.value);
    });
  }

  if (exportBtnEl) {
    exportBtnEl.addEventListener('click', () => {
      if (!activeCerId) {
        emit('cer:notify', 'Seleziona una CER prima di esportare la checklist.');
        return;
      }
      try {
        exportChecklistCSV(activeCerId);
        emit('cer:notify', 'Checklist esportata in formato CSV.');
      } catch (err) {
        emit('cer:notify', err.message || 'Impossibile esportare la checklist');
      }
    });
  }

  if (printBtnEl) {
    printBtnEl.addEventListener('click', () => window.print());
  }

  containerEl?.addEventListener('click', handleContainerClick);

  initialized = true;
  if (selectEl?.value) {
    renderCronoprogramma(selectEl.value);
  }
}

export async function renderCronoprogramma(cerId) {
  if (!initialized) return;
  activeCerId = cerId || '';
  if (!cerId) {
    if (feedbackEl) {
      feedbackEl.textContent = 'Seleziona una CER per visualizzare il cronoprogramma.';
      feedbackEl.classList.remove('error-text');
    }
    if (containerEl) containerEl.innerHTML = '';
    return;
  }

  try {
    setFeedback('Caricamento stato fasi…');
    const workflows = await fetchWorkflows(cerId);
    await loadDocs(cerId);
    renderPhaseCards(workflows, docsCache.get(cerId));
    setFeedback('');
  } catch (err) {
    setFeedback(err.message || 'Errore nel recupero del cronoprogramma', true);
    if (containerEl) containerEl.innerHTML = '';
  }
}

export async function advancePhase(cerId, phase, status, extra = {}) {
  if (!cerId && !activeCerId) throw new Error('Nessuna CER selezionata');
  const targetCer = cerId || activeCerId;
  const existing = getPhaseState(targetCer, phase);
  const payload = {
    entity_type: 'cer',
    entity_id: targetCer,
    phase,
    status,
    owner: extra.owner !== undefined ? extra.owner : (existing?.owner || ''),
    due_date: extra.due_date !== undefined ? extra.due_date : (existing?.due_date || ''),
    notes: extra.notes !== undefined ? extra.notes : (existing?.notes || '')
  };
  const fallback = {
    ...payload,
    dryRun: true,
    updatedAt: Date.now(),
    updated_at: new Date().toISOString()
  };
  const response = await apiFetch(`${API_BASE}/workflows/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    __safeFallback: fallback
  });
  const entry = response?.data ?? response;
  upsertWorkflowCache(targetCer, entry);
  renderPhaseCards(workflowCache.get(targetCer), docsCache.get(targetCer) || new Map());
  return response;
}

export function exportChecklistCSV(cerId) {
  const target = cerId || activeCerId;
  if (!target) throw new Error('Nessuna CER selezionata');
  const phases = workflowCache.get(target) || new Map();
  const headers = ['phase', 'id', 'activity', 'owner', 'status', 'due_date'];
  const lines = [headers.join(';')];
  CER_PHASES.forEach(phase => {
    const entry = phases.get(phase.id) || {};
    const owner = sanitizeCsv(entry.owner || '');
    const status = entry.status || 'todo';
    const due = entry.due_date || '';
    phase.activities.forEach((activity, idx) => {
      const row = [phase.id, `${phase.key}_${idx + 1}`, sanitizeCsv(activity), owner, status, due];
      lines.push(row.join(';'));
    });
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `cronoprogramma_${target}_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function openUploadDialog(cerId, phase) {
  const target = cerId || activeCerId;
  if (!target) {
    emit('cer:notify', 'Seleziona prima una CER.');
    return;
  }
  const phaseNumber = Number.isFinite(Number(phase)) && Number(phase) >= 0 ? Number(phase) : null;
  const filename = window.prompt('Nome del documento da caricare (mock upload)?');
  if (filename === null) return;
  try {
    const response = await apiFetch(`${API_BASE}/docs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'cer', entity_id: target, phase: phaseNumber, filename })
    });
    emit('cer:notify', 'Documento registrato (mock). Usa il link per caricare il file reale.');
    const group = docsCache.get(target) || new Map();
    const key = phaseNumber === null ? -1 : phaseNumber;
    const list = group.get(key) || [];
    const doc = response?.data ?? response;
    list.push(doc);
    group.set(key, list);
    docsCache.set(target, group);
    renderPhaseCards(workflowCache.get(target) || new Map(), group);
  } catch (err) {
    emit('cer:notify', err.message || 'Errore durante il caricamento simulato');
  }
}

async function markDocument(docId, status) {
  if (!docId || !activeCerId) return;
  try {
    await apiFetch(`${API_BASE}/docs/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: docId, status })
    });
    await loadDocs(activeCerId);
    renderPhaseCards(workflowCache.get(activeCerId) || new Map(), docsCache.get(activeCerId) || new Map());
    const label = status === 'approved' ? 'approvato' : 'rifiutato';
    emit('cer:notify', `Documento ${label}.`);
  } catch (err) {
    emit('cer:notify', err.message || 'Errore durante l’aggiornamento del documento');
  }
}

function resolveElement(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return document.querySelector(ref);
  return ref;
}

function setupModals() {
  phaseModal.root = document.getElementById('cronoprogramma-phase-modal');
  phaseModal.title = document.getElementById('phase-modal-title');
  phaseModal.description = document.getElementById('phase-modal-description');
  phaseModal.lists = document.getElementById('phase-modal-lists');
  phaseModal.owner = document.getElementById('phase-modal-owner');
  phaseModal.due = document.getElementById('phase-modal-due');
  phaseModal.notes = document.getElementById('phase-modal-notes');
  phaseModal.hiddenId = document.getElementById('phase-modal-id');
  phaseModal.shortcuts = document.getElementById('phase-modal-shortcuts');
  phaseModal.saveBtn = document.getElementById('phase-modal-save');

  if (phaseModal.saveBtn) {
    phaseModal.saveBtn.addEventListener('click', async () => {
      const phaseId = Number(phaseModal.hiddenId?.value || 'NaN');
      if (Number.isNaN(phaseId)) return;
      const entry = getPhaseState(activeCerId, phaseId) || {};
      try {
        const res = await advancePhase(activeCerId, phaseId, entry.status || 'todo', {
          owner: phaseModal.owner?.value?.trim() || '',
          due_date: phaseModal.due?.value || '',
          notes: phaseModal.notes?.value || ''
        });
        emit('cer:notify', res?.dryRun ? 'SAFE MODE: operazione simulata, nessuna modifica salvata.' : 'Checklist aggiornata.');
        closePhaseModal();
      } catch (err) {
        emit('cer:notify', err.message || 'Errore salvataggio checklist');
      }
    });
  }

  phaseModal.root?.querySelectorAll('[data-close-modal="phase"]').forEach(btn => {
    btn.addEventListener('click', closePhaseModal);
  });
  phaseModal.root?.addEventListener('click', (event) => {
    if (event.target?.dataset?.closeModal === 'phase') closePhaseModal();
  });

  phaseModal.shortcuts?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-shortcut]');
    if (!btn) return;
    const type = btn.dataset.shortcut;
    if (type === 'plants') navigateToPlants();
    if (type === 'recalc') triggerRecalc();
  });

  gseModal.root = document.getElementById('gse-info-modal');
  gseModal.root?.querySelectorAll('[data-close-modal="gse"]').forEach(btn => {
    btn.addEventListener('click', closeGseModal);
  });
  gseModal.root?.addEventListener('click', (event) => {
    if (event.target?.dataset?.closeModal === 'gse') closeGseModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePhaseModal();
      closeGseModal();
    }
  });
}

function handleContainerClick(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const phaseId = Number(btn.dataset.phase);
  const action = btn.dataset.action;
  if (Number.isNaN(phaseId) && action !== 'gse-info') return;

  switch (action) {
    case 'checklist':
      openPhaseModal(phaseId);
      break;
    case 'upload':
      if (btn.hasAttribute('data-doc-upload')) break;
      if (phaseId === 3) navigateToPlants();
      openUploadDialog(activeCerId, phaseId);
      break;
    case 'complete':
      if (phaseId === 3) triggerRecalc();
      confirmAdvance(phaseId);
      break;
    case 'gse-info':
      openGseModal();
      break;
    case 'doc-approve':
      if (btn.hasAttribute('data-doc-mark')) break;
      markDocument(btn.dataset.doc, 'approved', phaseId);
      break;
    case 'doc-reject':
      if (btn.hasAttribute('data-doc-mark')) break;
      markDocument(btn.dataset.doc, 'rejected', phaseId);
      break;
    default:
      break;
  }
}

function openPhaseModal(phaseId) {
  const phase = CER_PHASES.find(p => p.id === phaseId);
  if (!phase || !phaseModal.root) return;
  const entry = getPhaseState(activeCerId, phaseId) || {};
  if (phaseModal.title) phaseModal.title.textContent = phase.title;
  if (phaseModal.description) phaseModal.description.textContent = phase.description;
  if (phaseModal.hiddenId) phaseModal.hiddenId.value = String(phase.id);
  if (phaseModal.owner) phaseModal.owner.value = entry.owner || '';
  if (phaseModal.due) phaseModal.due.value = entry.due_date || '';
  if (phaseModal.notes) phaseModal.notes.value = entry.notes || '';
  if (phaseModal.lists) {
    phaseModal.lists.innerHTML = [
      renderListBlock('Attività', phase.activities),
      renderListBlock('Deliverable da caricare', phase.deliverables),
      renderListBlock('Go/No-Go', phase.go_no_go)
    ].join('');
  }
  if (phaseModal.shortcuts) {
    if (phase.id === 3) {
      phaseModal.shortcuts.innerHTML = `
        <button type="button" class="btn ghost" data-shortcut="plants">Vai alla tab Impianti</button>
        <button type="button" class="btn" data-shortcut="recalc">Ricalcola periodo</button>
      `;
    } else {
      phaseModal.shortcuts.innerHTML = '';
    }
  }
  phaseModal.root.classList.add('open');
}

function closePhaseModal() {
  phaseModal.root?.classList.remove('open');
}

function openGseModal() {
  gseModal.root?.classList.add('open');
}

function closeGseModal() {
  gseModal.root?.classList.remove('open');
}

function confirmAdvance(phaseId) {
  const phase = CER_PHASES.find(p => p.id === phaseId);
  if (!phase) return;
  const ok = window.confirm(`Segnare come completata "${phase.title}"?`);
  if (!ok) return;
  advancePhase(activeCerId, phaseId, 'done').then((res) => {
    const message = res?.dryRun
      ? 'SAFE MODE: operazione simulata, nessuna modifica salvata.'
      : 'Checklist aggiornata.';
    emit('cer:notify', message);
  }).catch(err => {
    emit('cer:notify', err.message || 'Errore durante l’aggiornamento della fase.');
  });
}

async function fetchWorkflows(cerId) {
  const response = await apiFetch(`${API_BASE}/workflows?entity_type=cer&entity_id=${encodeURIComponent(cerId)}`);
  const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
  const map = new Map();
  data.forEach(item => {
    map.set(Number(item.phase), item);
  });
  workflowCache.set(cerId, map);
  return map;
}

async function loadDocs(cerId) {
  const response = await apiFetch(`${API_BASE}/docs?entity_type=cer&entity_id=${encodeURIComponent(cerId)}`);
  const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
  const grouped = new Map();
  data.forEach(doc => {
    const phaseRaw = (doc.phase === null || doc.phase === undefined) ? -1 : Number(doc.phase);
    const phase = Number.isFinite(phaseRaw) ? phaseRaw : -1;
    if (!grouped.has(phase)) grouped.set(phase, []);
    grouped.get(phase).push(doc);
  });
  docsCache.set(cerId, grouped);
  return grouped;
}

function renderPhaseCards(workflows = new Map(), docsByPhase = new Map()) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  CER_PHASES.forEach(phase => {
    const entry = workflows.get(phase.id) || {};
    const status = entry.status || 'todo';
    const badgeClass = getBadgeClass(status);
    const badgeLabel = getStatusLabel(status);
    const owner = entry.owner ? escapeHtml(entry.owner) : 'Non assegnato';
    const due = entry.due_date ? formatDate(entry.due_date) : '—';
    const notes = entry.notes ? `<br/><strong>Note:</strong> ${escapeHtml(entry.notes).replace(/\n/g, '<br/>')}` : '';
    const card = document.createElement('article');
    card.className = 'card soft phase-card';
    card.dataset.phase = String(phase.id);
    const docsList = renderDocsList(phase.id, docsByPhase.get(phase.id) || []);
    card.innerHTML = `
      <div class="row-between">
        <div>
          <h3>${phase.title}</h3>
          <p class="info-text">${phase.description}</p>
        </div>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <p class="info-text"><strong>Referente:</strong> ${owner}<br/><strong>Scadenza:</strong> ${due}${notes}</p>
      ${renderListBlock('Attività', phase.activities)}
      ${renderListBlock('Deliverable (da caricare)', phase.deliverables)}
      ${docsList}
      ${renderListBlock('Go/No-Go', phase.go_no_go)}
      <div class="actions">
        <button class="btn ghost" data-action="checklist" data-phase="${phase.id}">Vedi checklist</button>
        <button class="btn ghost" data-action="upload" data-phase="${phase.id}" data-doc-upload data-entity="cer" data-entity-id="${activeCerId || ''}">Carica documento</button>
        <button class="btn" data-action="complete" data-phase="${phase.id}">Segna come completata</button>
      </div>
      ${phase.id === 4 ? '<div class="actions"><button class="btn ghost" data-action="gse-info">Apri portale GSE (info)</button></div>' : ''}
    `;
    containerEl.appendChild(card);
  });

  const generalDocs = docsByPhase.get(-1) || [];
  const wrap = document.createElement('article');
  wrap.className = 'card soft phase-card';
  wrap.innerHTML = `
    <div class="row-between">
      <div>
        <h3>Documenti generali CER</h3>
        <p class="info-text">Documenti caricati senza fase specifica.</p>
      </div>
      <div class="actions">
        <button class="btn ghost" data-action="upload" data-phase="-1" data-doc-upload data-entity="cer" data-entity-id="${activeCerId || ''}">Carica documento</button>
      </div>
    </div>
    ${renderDocsList(-1, generalDocs)}
  `;
  containerEl.appendChild(wrap);
}

function renderListBlock(title, items) {
  const list = (items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  return `
    <div class="phase-block">
      <h4>${title}</h4>
      <ul>${list}</ul>
    </div>
  `;
}

function renderDocsList(phaseId, docs) {
  const listItems = (docs || []).map(doc => {
    const statusInfo = getDocStatus(doc.status);
    const actions = `
      <div class="doc-actions">
        <a class="btn ghost" href="${doc.url}" target="_blank" rel="noopener">Apri</a>
        <button class="btn ghost" data-action="doc-approve" data-doc="${doc.doc_id}" data-phase="${phaseId}" data-doc-mark="${doc.doc_id}" data-status="approved" data-entity="cer" data-entity-id="${activeCerId}">Approva</button>
        <button class="btn ghost" data-action="doc-reject" data-doc="${doc.doc_id}" data-phase="${phaseId}" data-doc-mark="${doc.doc_id}" data-status="rejected" data-entity="cer" data-entity-id="${activeCerId}">Rifiuta</button>
      </div>
    `;
    return `
      <li data-doc="${doc.doc_id}">
        <div class="doc-row">
          <div>
            <strong>${escapeHtml(doc.filename)}</strong><br/>
            <small>Upload: ${formatDate(doc.uploaded_at)} · Stato: <span class="badge ${statusInfo.className}">${statusInfo.label}</span></small>
          </div>
          ${actions}
        </div>
      </li>
    `;
  }).join('');
  const emptyState = '<p class="info-text">Nessun documento caricato.</p>';
  return `
    <div class="phase-block docs-block">
      <h4>Documenti caricati</h4>
      ${docs && docs.length ? `<ul class="docs-list">${listItems}</ul>` : emptyState}
    </div>
  `;
}

function getPhaseState(cerId, phase) {
  return workflowCache.get(cerId)?.get(phase);
}

function upsertWorkflowCache(cerId, entry) {
  let map = workflowCache.get(cerId);
  if (!map) {
    map = new Map();
    workflowCache.set(cerId, map);
  }
  map.set(Number(entry.phase), entry);
}

function resolveDocContext(element) {
  const el = element || null;
  const entityAttr = el?.getAttribute('data-entity') || el?.closest('[data-entity]')?.getAttribute('data-entity');
  const entityType = entityAttr || 'client';
  const explicitId = el?.getAttribute('data-entity-id') || el?.closest('[data-entity-id]')?.getAttribute('data-entity-id');
  let entityId = explicitId || null;
  if (!entityId) {
    if (entityType === 'client') entityId = STATE.currentClientId;
    else if (entityType === 'cer') entityId = STATE.currentCerId;
    else if (entityType === 'plant') entityId = STATE.currentPlantId;
  }
  const phase = el?.getAttribute('data-phase') || el?.closest('[data-phase]')?.getAttribute('data-phase') || null;
  return { entityType, entityId, phase };
}

function normalizeDocPayload(doc = {}, context = {}) {
  const normalized = { ...doc };
  normalized.doc_id = normalized.doc_id || `doc_${Date.now()}`;
  normalized.filename = normalized.filename || normalized.name || '';
  normalized.status = normalized.status || 'uploaded';
  normalized.entity_type = normalized.entity_type || context.entityType || 'client';
  normalized.entity_id = normalized.entity_id || context.entityId || null;
  if (normalized.entity_id !== null && normalized.entity_id !== undefined) {
    normalized.entity_id = String(normalized.entity_id);
  }
  if (normalized.phase === undefined) normalized.phase = context.phase ?? null;
  normalized.uploaded_at = normalized.uploaded_at || new Date().toISOString();
  normalized.url = normalized.url || '#';
  return normalized;
}

function phaseCacheKey(value) {
  if (value === null || value === undefined || value === '') return -1;
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  return String(value);
}

export function addDocRowLocally(docInput, context = {}) {
  const normalized = normalizeDocPayload(docInput, context);
  docRegistry.set(normalized.doc_id, normalized);
  if (normalized.entity_type === 'cer' && normalized.entity_id) {
    const key = phaseCacheKey(normalized.phase);
    const cache = docsCache.get(normalized.entity_id) || new Map();
    const list = cache.get(key) || [];
    const idx = list.findIndex(item => item.doc_id === normalized.doc_id);
    if (idx >= 0) {
      list[idx] = normalized;
    } else {
      list.push(normalized);
    }
    cache.set(key, list);
    docsCache.set(normalized.entity_id, cache);
    if (normalized.entity_id === activeCerId) {
      renderPhaseCards(workflowCache.get(activeCerId) || new Map(), cache);
    }
  }
  window.dispatchEvent(new CustomEvent('cronoprogramma:doc-added', { detail: normalized }));
  return normalized;
}

export function updateDocRowLocally(docId, status, context = {}) {
  if (!docId) return null;
  const existing = docRegistry.get(docId) || {};
  const normalized = normalizeDocPayload({ ...existing, status }, context);
  docRegistry.set(docId, normalized);
  if (normalized.entity_type === 'cer' && normalized.entity_id) {
    const key = phaseCacheKey(normalized.phase);
    const cache = docsCache.get(normalized.entity_id) || new Map();
    const list = cache.get(key) || [];
    const idx = list.findIndex(item => item.doc_id === normalized.doc_id);
    if (idx >= 0) {
      list[idx] = normalized;
    } else {
      list.push(normalized);
    }
    cache.set(key, list);
    docsCache.set(normalized.entity_id, cache);
    if (normalized.entity_id === activeCerId) {
      renderPhaseCards(workflowCache.get(activeCerId) || new Map(), cache);
    }
  }
  window.dispatchEvent(new CustomEvent('cronoprogramma:doc-updated', { detail: normalized }));
  return normalized;
}

async function handleGlobalDocActions(event) {
  const uploadBtn = event.target.closest('[data-doc-upload]');
  if (uploadBtn) {
    event.preventDefault();
    const context = resolveDocContext(uploadBtn);
    if (!context.entityId) {
      emit('cer:notify', 'Seleziona un elemento prima di caricare un documento.');
      return;
    }
    const filename = typeof window !== 'undefined' ? window.prompt('Nome file (mock):') : null;
    if (!filename) return;
    const payload = {
      entity_type: context.entityType,
      entity_id: context.entityId,
      phase: context.phase ?? null,
      filename
    };
    try {
      const response = await fetchJSON('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const docData = response.data || {};
      const doc = addDocRowLocally({
        ...docData,
        filename: docData.filename || filename,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        phase: payload.phase
      }, context);
      if (response.dryRun || SAFE_MODE || doc.dryRun) {
        doc.dryRun = true;
        emit('cer:notify', 'SAFE_MODE attivo: documento registrato in anteprima.');
      } else {
        emit('cer:notify', 'Documento caricato (mock).');
      }
    } catch (err) {
      emit('cer:notify', err.message || 'Errore durante il caricamento del documento');
    }
    return;
  }

  const markBtn = event.target.closest('[data-doc-mark]');
  if (markBtn) {
    event.preventDefault();
    const docId = markBtn.getAttribute('data-doc-mark');
    const status = markBtn.getAttribute('data-status');
    if (!docId || !status) return;
    const context = resolveDocContext(markBtn);
    if (!context.entityId) {
      emit('cer:notify', 'Seleziona un elemento prima di aggiornare il documento.');
      return;
    }
    try {
      const response = await fetchJSON('/api/docs/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: docId, status })
      });
      updateDocRowLocally(docId, status, context);
      emit('cer:notify', response.dryRun || SAFE_MODE ? 'SAFE_MODE attivo: stato aggiornato in anteprima.' : 'Stato documento aggiornato.');
    } catch (err) {
      emit('cer:notify', err.message || 'Errore durante l’aggiornamento del documento');
    }
  }
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  let payload;
  if (contentType.includes('application/json')) {
    payload = await res.json();
  } else {
    const text = await res.text();
    throw new Error(`Risposta non JSON (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  if (!res.ok || payload.ok === false) {
    const error = payload?.error;
    const message = error?.message || payload?.message || 'Errore API';
    const err = new Error(message);
    err.payload = payload;
    throw err;
  }
  return payload;
}

function getBadgeClass(status) {
  if (status === 'in-review') return 'blue';
  if (status === 'done') return 'green';
  return '';
}

function getStatusLabel(status) {
  switch (status) {
    case 'in-review':
      return 'In revisione';
    case 'done':
      return 'Completata';
    default:
      return 'Da avviare';
  }
}

function getDocStatus(status) {
  const normalized = String(status || 'uploaded');
  if (normalized === 'approved') return { label: 'Approvato', className: 'green' };
  if (normalized === 'rejected') return { label: 'Rifiutato', className: 'danger' };
  return { label: 'Caricato', className: 'blue' };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeCsv(value) {
  const str = String(value || '');
  if (str.includes(';') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function setFeedback(message, isError = false) {
  if (!feedbackEl) return;
  feedbackEl.textContent = message || '';
  feedbackEl.classList.toggle('error-text', Boolean(isError && message));
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

