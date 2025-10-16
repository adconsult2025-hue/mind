import { STATE as CRONO_STATE } from './cronoprogramma.js?v=36';
import { apiFetch } from './api.js?v=36';
import { safeGuardAction, isDryRunResult } from './safe.js';

const API_BASE = '/api';

const PLANT_PHASES = [
  { id: 'P0', title: 'Fase P0 — Audit preliminare' },
  { id: 'P1', title: 'Fase P1 — Documenti costitutivi' },
  { id: 'P2', title: 'Fase P2 — Ingegneria & connessioni' },
  { id: 'P3', title: 'Fase P3 — Configurazione riparti CER' },
  { id: 'P4', title: 'Fase P4 — Pratiche GSE' }
];

const STATUS_LABELS = {
  'todo': 'Da avviare',
  'in-review': 'In revisione',
  'done': 'Completata'
};

const STATUS_BADGE_CLASS = {
  'todo': 'warn',
  'in-review': '',
  'done': ''
};

const DOC_STATUS_LABELS = {
  uploaded: 'Caricato',
  approved: 'Approvato',
  rejected: 'Respinto'
};

const DOC_STATUS_BADGE = {
  uploaded: 'warn',
  approved: '',
  rejected: 'error'
};

const state = {
  plants: [],
  filterCerId: '',
  selectedPlantId: '',
  pendingSelectPlantId: '',
  pendingTab: '',
  production: new Map(),
  workflows: new Map(),
  docs: new Map()
};

let tableBody;
let feedbackEl;
let cerSelect;
let detailCard;
let detailName;
let detailMeta;
let metricDaily;
let metricMonthly;
let metricYearly;
let metricLast;
let webhookEndpoint;
let webhookApiKey;
let webhookLastStatus;
let productionForm;
let productionDate;
let productionKwh;
let productionFeedback;
let refreshPlantsBtn;
let refreshDetailBtn;
let tabs;
let cronoContainer;
let cronoFeedback;
let exportChecklistBtn;
let presetButtons;

const docModal = {
  root: null,
  title: null,
  form: null,
  filename: null,
  phaseLabel: null,
  phaseValue: null,
  error: null
};

const PLANT_PHASES = [
  { id: 'P0', title: 'Fase P0 — Pre-analisi impianto', description: 'Raccolta dati di base, titolarità e requisiti minimi.' },
  { id: 'P1', title: 'Fase P1 — Governance locale', description: 'Allineamento documentale su deleghe, delibere e ruoli operativi.' },
  { id: 'P2', title: 'Fase P2 — Tecnica & connessioni', description: 'Verifica schemi elettrici, contratti di connessione e layout aggiornati.' },
  { id: 'P3', title: 'Fase P3 — Riparti e onboarding', description: 'Approvazione riparti economici e caricamento checklist documentale.' },
  { id: 'P4', title: 'Fase P4 — Pratiche GSE', description: 'Upload documenti definitivi per invio domanda e monitoraggio riscontri.' }
];

function init() {
  tableBody = document.querySelector('#impianti-table tbody');
  feedbackEl = document.getElementById('impianti-feedback');
  cerSelect = document.getElementById('impianti-cer-select');
  detailCard = document.getElementById('plant-detail');
  detailName = document.getElementById('plant-detail-name');
  detailMeta = document.getElementById('plant-detail-meta');
  metricDaily = document.getElementById('metric-daily');
  metricMonthly = document.getElementById('metric-monthly');
  metricYearly = document.getElementById('metric-yearly');
  metricLast = document.getElementById('metric-last');
  webhookEndpoint = document.getElementById('webhook-endpoint');
  webhookApiKey = document.getElementById('webhook-api-key');
  webhookLastStatus = document.getElementById('webhook-last-status');
  productionForm = document.getElementById('production-form');
  productionDate = document.getElementById('production-date');
  productionKwh = document.getElementById('production-kwh');
  productionFeedback = document.getElementById('production-feedback');
  refreshPlantsBtn = document.getElementById('btn-refresh-plants');
  refreshDetailBtn = document.getElementById('btn-refresh-detail');
  tabs = document.getElementById('plant-detail-tabs');
  cronoContainer = document.getElementById('plant-crono-content');
  cronoFeedback = document.getElementById('plant-crono-feedback');
  exportChecklistBtn = document.getElementById('btn-export-plant-checklist');
  presetButtons = document.querySelectorAll('[data-plant-preset]');

  const params = new URLSearchParams(window.location.search);
  const cerParam = params.get('cer_id');
  const plantParam = params.get('plant_id');
  const tabParam = params.get('tab');
  if (cerParam) state.filterCerId = cerParam;
  if (plantParam) state.pendingSelectPlantId = plantParam;
  if (tabParam) state.pendingTab = tabParam;
  if (cerSelect && state.filterCerId) cerSelect.value = state.filterCerId;

  cerSelect?.addEventListener('change', () => {
    state.filterCerId = cerSelect.value || '';
    renderPlantsTable();
  });
  refreshPlantsBtn?.addEventListener('click', () => loadPlants(true));
  refreshDetailBtn?.addEventListener('click', () => {
    if (state.selectedPlantId) loadPlantProduction(state.selectedPlantId, true);
  });
  productionForm?.addEventListener('submit', submitProductionForm);
  tabs?.addEventListener('click', onTabClick);
  cronoContainer?.addEventListener('click', onCronoAction);

  presetButtons?.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.plantPreset;
      if (!state.selectedPlantId) {
        toast('Seleziona un impianto prima di applicare il preset.');
        return;
      }
      applyPreset(state.selectedPlantId, type);
    });
  });

  exportChecklistBtn?.addEventListener('click', () => {
    if (!state.selectedPlantId) {
      toast('Seleziona un impianto per esportare la checklist.');
      return;
    }
    exportPlantChecklistCSV(state.selectedPlantId);
  });

  setupDocModal();

  loadPlants();
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('cronoprogramma:doc-added', (event) => {
  handlePlantDocEvent(event.detail);
});

window.addEventListener('cronoprogramma:doc-updated', (event) => {
  handlePlantDocEvent(event.detail);
});

async function loadPlants(force = false) {
  try {
    setFeedback('Caricamento impianti…');
    const res = await fetch(`${API_BASE}/plants${force ? `?ts=${Date.now()}` : ''}`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore caricamento impianti');
    state.plants = Array.isArray(payload.data) ? payload.data : [];
    buildCerOptions();
    renderPlantsTable();
    if (state.pendingSelectPlantId) {
      const pending = state.plants.find(p => p.id === state.pendingSelectPlantId);
      if (pending) {
        selectPlant(pending.id);
        if (state.pendingTab) activatePlantTab(state.pendingTab);
        state.pendingSelectPlantId = '';
        state.pendingTab = '';
      }
    }
    if (!state.selectedPlantId) {
      const filtered = state.plants.filter(p => !state.filterCerId || p.cer_id === state.filterCerId);
      if (filtered.length) {
        selectPlant(filtered[0].id);
      }
    } else {
      const exists = state.plants.some(p => p.id === state.selectedPlantId);
      if (!exists) {
        const filtered = state.plants.filter(p => !state.filterCerId || p.cer_id === state.filterCerId);
        if (filtered.length) {
          selectPlant(filtered[0].id);
        } else {
          state.selectedPlantId = '';
          renderPlantDetail();
          clearPlantCrono();
        }
      } else {
        renderPlantsTable();
        renderPlantCrono(state.selectedPlantId);
      }
    }
    if (!state.plants.length) {
      detailCard?.setAttribute('hidden', 'hidden');
      clearPlantCrono();
    }
    setFeedback(state.plants.length ? `${state.plants.length} impianti disponibili` : 'Nessun impianto configurato');
  } catch (err) {
    setFeedback(err.message || 'Errore durante il caricamento degli impianti', true);
  }
}

function setFeedback(message, error = false) {
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.classList.toggle('error-text', !!error);
}

function buildCerOptions() {
  if (!cerSelect) return;
  const previous = state.filterCerId || cerSelect.value;
  const options = new Map();
  options.set('', 'Tutte le CER');
  state.plants.forEach(plant => {
    if (plant.cer_id) options.set(plant.cer_id, plant.cer_id);
  });
  cerSelect.innerHTML = '';
  options.forEach((label, value) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    cerSelect.appendChild(opt);
  });
  if (previous && options.has(previous)) {
    cerSelect.value = previous;
    state.filterCerId = previous;
  } else {
    cerSelect.value = '';
    state.filterCerId = '';
  }
}

function renderPlantsTable() {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  const plants = state.plants.filter(p => !state.filterCerId || p.cer_id === state.filterCerId);
  if (!plants.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6">Nessun impianto trovato.</td>';
    tableBody.appendChild(tr);
    return;
  }
  plants.forEach(plant => {
    const totals = plant.production_totals || { daily: 0, monthly: 0, yearly: 0 };
    const last = plant.last_reading || null;
    const tr = document.createElement('tr');
    tr.dataset.id = plant.id;
    if (plant.id === state.selectedPlantId) tr.classList.add('active');
    tr.innerHTML = `
      <td><strong>${plant.name}</strong><br/><small>${plant.pod_id_produttore || ''}</small></td>
      <td>${plant.tipologia || '-'}</td>
      <td>${formatLastReading(last)}</td>
      <td>${formatKwh(totals.daily)}</td>
      <td>${formatKwh(totals.monthly)}</td>
      <td>${formatKwh(totals.yearly)}</td>
    `;
    tr.addEventListener('click', () => selectPlant(plant.id));
    tableBody.appendChild(tr);
  });
}

function selectPlant(plantId) {
  state.selectedPlantId = plantId;
  CRONO_STATE.currentPlantId = plantId;
  renderPlantsTable();
  loadPlantProduction(plantId);
  renderPlantCrono(plantId);
}

async function loadPlantProduction(plantId, force = false) {
  try {
    const url = `${API_BASE}/plants/${encodeURIComponent(plantId)}/production${force ? `?ts=${Date.now()}` : ''}`;
    const res = await fetch(url);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore caricamento produzione');
    state.production.set(plantId, payload.data);
    renderPlantDetail();
  } catch (err) {
    productionFeedback.textContent = err.message || 'Errore lettura produzione';
    productionFeedback.classList.add('error-text');
  }
}

function renderPlantDetail() {
  if (!detailCard || !state.selectedPlantId) return;
  const plant = state.plants.find(p => p.id === state.selectedPlantId);
  const prod = state.production.get(state.selectedPlantId);
  if (!plant) {
    detailCard.setAttribute('hidden', 'hidden');
    clearPlantCrono();
    return;
  }
  detailCard.removeAttribute('hidden');
  detailName.textContent = plant.name;
  detailMeta.textContent = plant.cer_id ? `CER: ${plant.cer_id} · Tipologia ${plant.tipologia || '-'}` : `Tipologia ${plant.tipologia || '-'}`;

  const totals = prod?.totals || plant.production_totals || { daily: 0, monthly: 0, yearly: 0 };
  metricDaily.textContent = `${formatKwh(totals.daily)} kWh`;
  metricMonthly.textContent = `${formatKwh(totals.monthly)} kWh`;
  metricYearly.textContent = `${formatKwh(totals.yearly)} kWh`;
  metricLast.textContent = formatLastReading(prod?.last_reading || plant.last_reading);

  productionFeedback.textContent = '';
  productionFeedback.classList.remove('error-text');
  productionForm?.reset();

  webhookEndpoint.textContent = '/api/inverter/webhook';
  webhookApiKey.textContent = plant.inverter_api_key || 'N/D';
  webhookLastStatus.textContent = formatLastReading(prod?.last_reading || plant.last_reading, true);
}

async function submitProductionForm(event) {
  event.preventDefault();
  if (!state.selectedPlantId) return;
  const dateValue = productionDate?.value;
  const kwhValue = Number(productionKwh?.value || 0);
  if (!dateValue) {
    productionFeedback.textContent = 'Seleziona una data valida (ISO)';
    productionFeedback.classList.add('error-text');
    return;
  }
  if (!(kwhValue > 0)) {
    productionFeedback.textContent = 'Inserisci un valore kWh maggiore di 0.';
    productionFeedback.classList.add('error-text');
    return;
  }
  try {
    productionFeedback.textContent = 'Invio in corso…';
    productionFeedback.classList.remove('error-text');
    const res = await safeGuardAction(() => fetch(`${API_BASE}/plants/${encodeURIComponent(state.selectedPlantId)}/production`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateValue, kwh: kwhValue })
    }));
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore salvataggio produzione');
    if (isDryRunResult(res, payload)) {
      productionFeedback.textContent = 'SAFE MODE attivo: registrazione produzione simulata (nessun dato salvato).';
      productionFeedback.classList.remove('error-text');
      toast('SAFE MODE attivo: salvataggio produzione in dry-run.');
      return;
    }
    state.production.set(state.selectedPlantId, payload.data);
    // aggiorna entry in elenco
    const index = state.plants.findIndex(p => p.id === state.selectedPlantId);
    if (index !== -1) {
      const updated = { ...state.plants[index] };
      updated.last_reading = payload.data.last_reading;
      updated.production_totals = payload.data.totals;
      state.plants[index] = updated;
    }
    renderPlantDetail();
    renderPlantsTable();
    toast('Produzione registrata correttamente');
  } catch (err) {
    productionFeedback.textContent = err.message || 'Errore durante il salvataggio';
    productionFeedback.classList.add('error-text');
  }
}

function activatePlantTab(tab) {
  if (!tabs) return;
  const targetButton = tabs.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const fallbackButton = targetButton || tabs.querySelector('.tab-btn');
  const buttons = tabs.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('#plant-detail .tab-panel');
  const activeTab = fallbackButton ? fallbackButton.dataset.tab : tab;
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn === fallbackButton);
  });
  panels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === activeTab);
  });
}

function onTabClick(event) {
  const button = event.target.closest('.tab-btn');
  if (!button) return;
  activatePlantTab(button.dataset.tab);
}

function formatKwh(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(2);
}

function formatLastReading(reading, includeStatus = false) {
  if (!reading) return '-';
  const ts = reading.ts || reading.date;
  if (!ts) return '-';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '-';
  const when = `${date.toLocaleDateString('it-IT')} ${date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  if (includeStatus && reading.status) {
    return `${when} · ${reading.status}`;
  }
  return when;
}

function setCronoFeedback(message, error = false) {
  if (!cronoFeedback) return;
  cronoFeedback.textContent = message;
  cronoFeedback.classList.toggle('error-text', !!error);
}

function clearPlantCrono() {
  if (!cronoContainer) return;
  cronoContainer.innerHTML = '';
  setCronoFeedback('Seleziona un impianto per consultare il cronoprogramma.');
  CRONO_STATE.currentPlantId = '';
}

const PLANT_WORKFLOWS_API = `${API_BASE}/plant_workflows`;
const PLANT_DOCS_API = `${API_BASE}/plant_docs`;

async function renderPlantCrono(plantId) {
  if (!cronoContainer) return;
  if (!plantId) {
    clearPlantCrono();
    return;
  }
  setCronoFeedback('Caricamento cronoprogramma…');
  try {
    const [workflows, docs] = await Promise.all([
      apiFetch(`${PLANT_WORKFLOWS_API}?plant_id=${encodeURIComponent(plantId)}`),
      apiFetch(`${API_BASE}/docs?entity_type=plant&entity_id=${encodeURIComponent(plantId)}`)
    ]);
    state.workflows.set(plantId, Array.isArray(workflows) ? workflows : []);
    state.docs.set(plantId, Array.isArray(docs) ? docs : []);
    buildPlantCronoUI(plantId);
    setCronoFeedback('Cronoprogramma aggiornato.');
  } catch (err) {
    setCronoFeedback(err.message || 'Errore nel caricamento del cronoprogramma', true);
  }
}

function upsertPlantDoc(doc) {
  const pid = String(doc.plant_id || doc.entity_id || '');
  if (!pid) return;
  const list = state.docs.get(pid) || [];
  const index = list.findIndex(item => item.doc_id === doc.doc_id);
  if (index >= 0) {
    list[index] = { ...list[index], ...doc };
  } else {
    list.push(doc);
  }
  state.docs.set(pid, list);
  if (pid === state.selectedPlantId) {
    buildPlantCronoUI(pid);
  }
}

function handlePlantDocEvent(detail) {
  if (!detail || String(detail.entity_type || '') !== 'plant') return;
  const normalized = {
    ...detail,
    plant_id: detail.entity_id || detail.plant_id,
    entity_type: 'plant',
    entity_id: String(detail.entity_id || detail.plant_id || '')
  };
  upsertPlantDoc(normalized);
}

function buildPlantCronoUI(plantId) {
  if (!cronoContainer) return;
  const workflows = new Map((state.workflows.get(plantId) || []).map(item => [item.phase, item]));
  const docs = state.docs.get(plantId) || [];
  cronoContainer.innerHTML = '';
  PLANT_PHASES.forEach(phase => {
    const entry = workflows.get(phase.id) || { status: 'todo', owner: '', due_date: '' };
    const card = document.createElement('article');
    card.className = 'card soft plant-phase';
    card.dataset.phase = phase.id;
    card.innerHTML = renderPhaseTemplate(phase, entry, docs.filter(doc => doc.phase === phase.id));
    cronoContainer.appendChild(card);
  });
}

function renderPhaseTemplate(phase, entry, docs) {
  const statusInfo = getPhaseStatusInfo(entry.status);
  const owner = entry.owner ? escapeHtml(entry.owner) : 'Non assegnato';
  const due = entry.due_date ? formatDate(entry.due_date) : '—';
  const reviewLabel = entry.status === 'done' ? 'Riapri revisione' : 'Segna in revisione';
  const completeDisabled = entry.status === 'todo' ? 'disabled' : '';
  return `
    <div class="row-between">
      <div>
        <h3>${escapeHtml(phase.title)}</h3>
        <p class="info-text">${escapeHtml(phase.description)}</p>
      </div>
      <span class="badge ${statusInfo.className}">${statusInfo.label}</span>
    </div>
    <p class="info-text"><strong>Referente:</strong> ${owner}<br/><strong>Scadenza:</strong> ${due}</p>
    ${renderDocsTable(phase.id, docs)}
    <div class="actions">
      <button class="btn ghost" type="button" data-action="upload-doc" data-phase="${phase.id}" data-doc-upload data-entity="plant" data-entity-id="${state.selectedPlantId || ''}">Carica documento</button>
      <button class="btn ghost" type="button" data-action="advance-phase" data-phase="${phase.id}" data-status="in-review">${reviewLabel}</button>
      <button class="btn" type="button" data-action="advance-phase" data-phase="${phase.id}" data-status="done" ${completeDisabled}>Completa fase</button>
    </div>
  `;
}

function renderDocsTable(phaseId, docs) {
  if (!docs.length) {
    return `
      <div class="table-wrap">
        <table class="data-table plant-docs-table">
          <thead>
            <tr><th>Codice</th><th>Nome</th><th>Stato</th><th>Azioni</th></tr>
          </thead>
          <tbody>
            <tr><td colspan="4"><p class="info-text">Nessun documento associato alla fase.</p></td></tr>
          </tbody>
        </table>
      </div>
    `;
  }
  const rows = docs
    .slice()
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    .map(doc => {
      const statusInfo = getDocStatusInfo(doc.status);
      const openLink = doc.url ? `<a class="btn ghost" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">Apri</a>` : '';
      const plantId = escapeHtml(doc.plant_id || state.selectedPlantId || '');
      const actions = `
        <div class="doc-actions">
          ${openLink}
          <button class="btn ghost" type="button" data-action="mark-doc" data-status="approved" data-doc="${doc.doc_id}" data-phase="${phaseId}" data-doc-mark="${doc.doc_id}" data-entity="plant" data-entity-id="${plantId}">Approva</button>
          <button class="btn ghost" type="button" data-action="mark-doc" data-status="rejected" data-doc="${doc.doc_id}" data-phase="${phaseId}" data-doc-mark="${doc.doc_id}" data-entity="plant" data-entity-id="${plantId}">Rifiuta</button>
        </div>
      `;
      return `
        <tr data-doc="${doc.doc_id}">
          <td>${escapeHtml(doc.code || '-')}</td>
          <td>${escapeHtml(doc.name || doc.filename || '-')}</td>
          <td><span class="badge ${statusInfo.className}">${statusInfo.label}</span></td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
  return `
    <div class="table-wrap">
      <table class="data-table plant-docs-table">
        <thead>
          <tr><th>Codice</th><th>Nome</th><th>Stato</th><th>Azioni</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function getPhaseStatusInfo(status = 'todo') {
  switch (status) {
    case 'done':
      return { label: 'Completata', className: 'green' };
    case 'in-review':
      return { label: 'In revisione', className: 'warn' };
    default:
      return { label: 'Da avviare', className: 'muted' };
  }
}

function getDocStatusInfo(status = 'uploaded') {
  switch (status) {
    case 'approved':
      return { label: 'Approvato', className: 'green' };
    case 'rejected':
      return { label: 'Respinto', className: 'warn' };
    default:
      return { label: 'Caricato', className: 'blue' };
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT');
}

function onCronoAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const phase = button.dataset.phase;
  if (action === 'upload-doc') {
    openDocModal(phase);
    return;
  }
  if (!state.selectedPlantId) {
    toast('Seleziona un impianto per continuare.');
    return;
  }
  if (action === 'advance-phase') {
    const status = button.dataset.status;
    advancePlantPhase(state.selectedPlantId, phase, status);
    return;
  }
  if (action === 'mark-doc') {
    const docId = button.dataset.doc;
    const status = button.dataset.status;
    markDoc(docId, status);
  }
}

function setupDocModal() {
  docModal.root = document.getElementById('plant-doc-modal');
  if (!docModal.root) return;
  docModal.title = docModal.root.querySelector('[data-modal-title]');
  docModal.form = document.getElementById('plant-doc-form');
  docModal.filename = document.getElementById('plant-doc-filename');
  docModal.phaseLabel = document.getElementById('plant-doc-phase-label');
  docModal.phaseValue = document.getElementById('plant-doc-phase-value');
  docModal.error = document.getElementById('plant-doc-error');
  docModal.root.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeDocModal());
  });
  docModal.form?.addEventListener('submit', submitDocForm);
}

function openDocModal(phase) {
  if (!docModal.root) return;
  docModal.phaseValue.value = phase || '';
  docModal.phaseLabel.textContent = phase || '-';
  if (docModal.title) {
    docModal.title.textContent = 'Carica documento fase ' + (phase || '');
  }
  if (docModal.filename) {
    docModal.filename.value = '';
    docModal.filename.focus();
  }
  if (docModal.error) docModal.error.textContent = '';
  docModal.root.classList.add('open');
  docModal.root.setAttribute('aria-hidden', 'false');
}

function closeDocModal() {
  if (!docModal.root) return;
  docModal.root.classList.remove('open');
  docModal.root.setAttribute('aria-hidden', 'true');
}

async function submitDocForm(event) {
  event.preventDefault();
  if (!state.selectedPlantId) {
    if (docModal.error) docModal.error.textContent = 'Seleziona un impianto prima di caricare documenti.';
    return;
  }
  const filename = docModal.filename?.value?.trim();
  if (!filename) {
    if (docModal.error) docModal.error.textContent = 'Inserisci il nome del file da caricare (es. documento.pdf).';
    return;
  }
  if (docModal.error) docModal.error.textContent = '';
  try {
    await uploadPlantDoc(state.selectedPlantId, docModal.phaseValue?.value, filename);
    closeDocModal();
  } catch (err) {
    if (docModal.error) docModal.error.textContent = err.message || 'Errore durante il caricamento del documento';
  }
}

async function applyPreset(plantId, type) {
  if (!plantId || !type) return;
  setCronoFeedback('Applicazione preset documentale…');
  try {
    await apiFetch(`${PLANT_DOCS_API}/preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plant_id: plantId, type })
    });
    toast('Preset documentale applicato.');
    await renderPlantCrono(plantId);
  } catch (err) {
    setCronoFeedback(err.message || 'Errore durante l\'applicazione del preset', true);
  }
}

async function uploadPlantDoc(plantId, phase, filename) {
  if (!plantId || !phase) throw new Error('Fase o impianto non valido');
  try {
    await apiFetch(`${API_BASE}/docs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'plant', entity_id: plantId, phase, filename })
    });
    toast('Documento caricato correttamente.');
    await renderPlantCrono(plantId);
  } catch (err) {
    setCronoFeedback(err.message || 'Errore durante il caricamento del documento', true);
    throw err;
  }
}

async function markDoc(docId, status) {
  if (!docId || !status) return;
  try {
    await apiFetch(`${API_BASE}/docs/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: docId, status })
    });
    toast(status === 'approved' ? 'Documento approvato.' : 'Documento respinto.');
    await renderPlantCrono(state.selectedPlantId);
  } catch (err) {
    setCronoFeedback(err.message || 'Errore durante l\'aggiornamento del documento', true);
  }
}

async function advancePlantPhase(plantId, phase, status) {
  if (!plantId || !phase || !status) return;
  try {
    await apiFetch(`${PLANT_WORKFLOWS_API}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      __safeFallback: fallback
    });
    toast(res?.dryRun ? 'SAFE MODE: operazione simulata, nessuna modifica salvata.' : 'Checklist aggiornata.');
    await renderPlantCrono(plantId);
  } catch (err) {
    if (err.code === 'GATE_NOT_MET') {
      const missing = Array.isArray(err.details?.missing_docs) ? err.details.missing_docs.join(', ') : '';
      const message = missing ? `${err.message}. Mancanti: ${missing}` : err.message || 'Gate non superato.';
      toast(message);
      setCronoFeedback(message, true);
    } else {
      setCronoFeedback(err.message || 'Errore durante l\'aggiornamento della fase', true);
    }
  }
}

function exportPlantChecklistCSV(plantId) {
  const docs = state.docs.get(plantId) || [];
  const workflows = new Map((state.workflows.get(plantId) || []).map(item => [item.phase, item]));
  const rows = [];
  if (!docs.length) {
    PLANT_PHASES.forEach(phase => {
      const wf = workflows.get(phase.id) || {};
      rows.push([
        plantId,
        phase.id,
        '',
        '',
        wf.status || 'todo',
        wf.owner || '',
        wf.due_date || ''
      ]);
    });
  } else {
    docs.forEach(doc => {
      const wf = workflows.get(doc.phase) || {};
      rows.push([
        plantId,
        doc.phase,
        doc.code || '',
        doc.name || doc.filename || '',
        doc.status || '',
        wf.owner || '',
        wf.due_date || ''
      ]);
    });
  }
  const header = ['plant_id', 'phase', 'code', 'name', 'status', 'owner', 'due_date'];
  const csv = [header, ...rows]
    .map(row => row.map(csvEscape).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${plantId}_checklist.csv`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 500);
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  if (/[",\n\r]/.test(str)) {
    return `"${str}"`;
  }
  return str;
}

function toast(message) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cer:notify', { detail: message }));
}
