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
  production: new Map(),
  plantWorkflows: new Map(),
  plantDocs: new Map()
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
let plantCronoContainer;
let plantCronoFeedback;
let presetButtons;
let exportChecklistBtn;

const docModal = {
  root: null,
  form: null,
  title: null,
  code: null,
  name: null,
  filename: null,
  feedback: null
};

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
  plantCronoContainer = document.getElementById('plant-crono-cards');
  plantCronoFeedback = document.getElementById('plant-crono-feedback');
  presetButtons = document.querySelectorAll('[data-preset-type]');
  exportChecklistBtn = document.getElementById('btn-export-plant-checklist');

  docModal.root = document.getElementById('plant-doc-modal');
  docModal.form = document.getElementById('plant-doc-form');
  docModal.title = document.getElementById('plant-doc-modal-title');
  docModal.code = document.getElementById('plant-doc-code');
  docModal.name = document.getElementById('plant-doc-name');
  docModal.filename = document.getElementById('plant-doc-filename');
  docModal.feedback = document.getElementById('plant-doc-feedback');

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
  presetButtons?.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.selectedPlantId) {
        toast('Seleziona un impianto prima di applicare un preset.');
        return;
      }
      applyPreset(state.selectedPlantId, btn.dataset.presetType);
    });
  });
  exportChecklistBtn?.addEventListener('click', () => {
    if (!state.selectedPlantId) {
      toast('Seleziona un impianto prima di esportare la checklist.');
      return;
    }
    exportPlantChecklistCSV(state.selectedPlantId);
  });
  docModal.form?.addEventListener('submit', handleDocModalSubmit);
  docModal.root?.querySelectorAll('[data-close-modal]')?.forEach(btn => {
    btn.addEventListener('click', () => closeDocModal());
  });

  loadPlants();
}

document.addEventListener('DOMContentLoaded', init);

async function loadPlants(force = false) {
  try {
    setFeedback('Caricamento impianti…');
    const res = await fetch(`${API_BASE}/plants${force ? `?ts=${Date.now()}` : ''}`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore caricamento impianti');
    state.plants = Array.isArray(payload.data) ? payload.data : [];
    buildCerOptions();
    renderPlantsTable();
    if (state.plants.length && !state.selectedPlantId) {
      selectPlant(state.plants[0].id);
    } else if (state.selectedPlantId) {
      const exists = state.plants.some(p => p.id === state.selectedPlantId);
      if (!exists && state.plants.length) {
        selectPlant(state.plants[0].id);
      } else if (exists) {
        renderPlantsTable();
      }
    }
    if (!state.plants.length) {
      detailCard?.setAttribute('hidden', 'hidden');
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
  const previous = cerSelect.value;
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
    if (plantCronoContainer) plantCronoContainer.innerHTML = '';
    if (plantCronoFeedback) plantCronoFeedback.textContent = '';
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
    const res = await fetch(`${API_BASE}/plants/${encodeURIComponent(state.selectedPlantId)}/production`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateValue, kwh: kwhValue })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore salvataggio produzione');
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

function onTabClick(event) {
  const button = event.target.closest('.tab-btn');
  if (!button) return;
  const tab = button.dataset.tab;
  document.querySelectorAll('#plant-detail .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn === button);
  });
  document.querySelectorAll('#plant-detail .tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
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

function formatDateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('it-IT');
}

async function renderPlantCrono(plantId) {
  if (!plantCronoContainer) return;
  if (!plantId) {
    plantCronoContainer.innerHTML = '';
    if (plantCronoFeedback) {
      plantCronoFeedback.textContent = 'Seleziona un impianto per visualizzare fasi e documenti.';
      plantCronoFeedback.classList.remove('error-text');
    }
    return;
  }
  try {
    if (plantCronoFeedback) {
      plantCronoFeedback.textContent = 'Caricamento cronoprogramma…';
      plantCronoFeedback.classList.remove('error-text');
    }
    const [wfRes, docsRes] = await Promise.all([
      fetch(`${API_BASE}/plants/workflows?plant_id=${encodeURIComponent(plantId)}`),
      fetch(`${API_BASE}/docs?entity_type=plant&entity_id=${encodeURIComponent(plantId)}`)
    ]);
    const wfPayload = await wfRes.json();
    const docsPayload = await docsRes.json();
    if (!wfRes.ok || wfPayload.ok === false) {
      throw new Error(wfPayload.error?.message || 'Errore lettura workflow impianto');
    }
    if (!docsRes.ok || docsPayload.ok === false) {
      throw new Error(docsPayload.error?.message || 'Errore lettura documenti impianto');
    }
    const workflows = Array.isArray(wfPayload.data) ? wfPayload.data : [];
    const docs = Array.isArray(docsPayload.data) ? docsPayload.data : [];
    state.plantWorkflows.set(plantId, workflows);
    state.plantDocs.set(plantId, docs);

    const workflowMap = new Map(workflows.map(entry => [entry.phase, entry]));
    const docsMap = new Map();
    docs.forEach(doc => {
      const list = docsMap.get(doc.phase) || [];
      list.push(doc);
      docsMap.set(doc.phase, list);
    });

    plantCronoContainer.innerHTML = '';

    PLANT_PHASES.forEach(phase => {
      const wf = workflowMap.get(phase.id) || { phase: phase.id, status: 'todo', owner: '', due_date: '' };
      const docsForPhase = docsMap.get(phase.id) || [];

      const card = document.createElement('section');
      card.className = 'card soft plant-phase-card';
      card.dataset.phase = phase.id;

      const header = document.createElement('div');
      header.className = 'row-between';

      const headerInfo = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = phase.title;
      headerInfo.appendChild(title);
      const meta = document.createElement('p');
      meta.className = 'info-text';
      const metaParts = [];
      if (wf.owner) metaParts.push(`Responsabile: ${wf.owner}`);
      if (wf.due_date) metaParts.push(`Scadenza: ${formatDateLabel(wf.due_date)}`);
      meta.textContent = metaParts.length ? metaParts.join(' · ') : 'Responsabile non assegnato';
      headerInfo.appendChild(meta);
      header.appendChild(headerInfo);

      const statusWrap = document.createElement('div');
      const badge = document.createElement('span');
      const badgePhase = STATUS_BADGE_CLASS[wf.status] || '';
      badge.className = `status-badge${badgePhase ? ` ${badgePhase}` : ''}`;
      badge.textContent = STATUS_LABELS[wf.status] || STATUS_LABELS.todo;
      statusWrap.appendChild(badge);
      header.appendChild(statusWrap);
      card.appendChild(header);

      const actions = document.createElement('div');
      actions.className = 'actions phase-actions';
      if (wf.status === 'todo') {
        actions.appendChild(createButton('Avvia revisione', () => advancePlantPhase(plantId, phase.id, 'in-review'), 'primary'));
      }
      if (wf.status === 'in-review') {
        actions.appendChild(createButton('Segna completata', () => advancePlantPhase(plantId, phase.id, 'done'), 'primary'));
      }
      if (wf.status === 'done') {
        actions.appendChild(createButton('Riporta in revisione', () => advancePlantPhase(plantId, phase.id, 'in-review'), 'ghost'));
      }
      card.appendChild(actions);

      const docsSection = document.createElement('div');
      docsSection.className = 'plant-docs-block';

      if (docsForPhase.length) {
        const tableWrap = document.createElement('div');
        tableWrap.className = 'table-wrap';
        const table = document.createElement('table');
        table.className = 'data-table mini';
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Codice</th><th>Documento</th><th>Stato</th><th>Azioni</th></tr>';
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        docsForPhase.forEach(doc => {
          const row = document.createElement('tr');

          const codeCell = document.createElement('td');
          codeCell.textContent = doc.code || '-';
          row.appendChild(codeCell);

          const nameCell = document.createElement('td');
          if (doc.url) {
            const link = document.createElement('a');
            link.href = doc.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = doc.name || doc.url;
            nameCell.appendChild(link);
          } else {
            nameCell.textContent = doc.name || '-';
          }
          row.appendChild(nameCell);

          const statusCell = document.createElement('td');
          const docBadge = document.createElement('span');
          const badgeClass = DOC_STATUS_BADGE[doc.status] || '';
          docBadge.className = `status-badge${badgeClass ? ` ${badgeClass}` : ''}`;
          docBadge.textContent = DOC_STATUS_LABELS[doc.status] || doc.status || 'Da caricare';
          statusCell.appendChild(docBadge);
          row.appendChild(statusCell);

          const actionsCell = document.createElement('td');
          const rowActions = document.createElement('div');
          rowActions.className = 'actions';

          rowActions.appendChild(createButton('Carica/aggiorna', () => uploadPlantDoc(plantId, phase.id, doc.id), 'ghost'));
          rowActions.appendChild(createButton('Approva', () => markDoc(doc.id, 'approved'), 'ghost'));
          rowActions.appendChild(createButton('Respingi', () => markDoc(doc.id, 'rejected'), 'ghost'));

          actionsCell.appendChild(rowActions);
          row.appendChild(actionsCell);
          tbody.appendChild(row);
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        docsSection.appendChild(tableWrap);
      } else {
        const empty = document.createElement('p');
        empty.className = 'info-text';
        empty.textContent = 'Nessun documento registrato per questa fase.';
        docsSection.appendChild(empty);
      }

      const docActions = document.createElement('div');
      docActions.className = 'actions doc-actions';
      docActions.appendChild(createButton('Nuovo documento', () => uploadPlantDoc(plantId, phase.id), 'ghost'));
      docsSection.appendChild(docActions);

      card.appendChild(docsSection);
      plantCronoContainer.appendChild(card);
    });

    if (plantCronoFeedback) {
      plantCronoFeedback.textContent = 'Cronoprogramma aggiornato.';
      plantCronoFeedback.classList.remove('error-text');
    }
  } catch (err) {
    plantCronoContainer.innerHTML = '';
    if (plantCronoFeedback) {
      plantCronoFeedback.textContent = err.message || 'Errore durante il caricamento del cronoprogramma';
      plantCronoFeedback.classList.add('error-text');
    }
  }
}

async function applyPreset(plantId, type) {
  if (!plantId || !type) return;
  try {
    if (plantCronoFeedback) {
      plantCronoFeedback.textContent = 'Applicazione preset documentale…';
      plantCronoFeedback.classList.remove('error-text');
    }
    const res = await fetch(`${API_BASE}/plants/docs/preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plant_id: plantId, type })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error?.message || 'Errore applicazione preset');
    }
    await renderPlantCrono(plantId);
    toast('Preset documentale applicato.');
  } catch (err) {
    if (plantCronoFeedback) {
      plantCronoFeedback.textContent = err.message || 'Errore applicazione preset';
      plantCronoFeedback.classList.add('error-text');
    }
  }
}

function uploadPlantDoc(plantId, phase, docId) {
  if (!docModal.root) return;
  const docs = state.plantDocs.get(plantId) || [];
  const existing = docs.find(doc => doc.id === docId);
  docModal.root.dataset.plantId = plantId;
  docModal.root.dataset.phase = phase;
  docModal.root.dataset.docId = docId || '';
  if (docModal.title) {
    docModal.title.textContent = existing ? `Aggiorna documento — ${existing.code || existing.name}` : `Nuovo documento — ${phase}`;
  }
  if (docModal.code) docModal.code.value = existing?.code || '';
  if (docModal.name) docModal.name.value = existing?.name || '';
  if (docModal.filename) docModal.filename.value = '';
  if (docModal.feedback) {
    docModal.feedback.textContent = 'Simulazione caricamento: il file sarà registrato come mock.';
    docModal.feedback.classList.remove('error-text');
  }
  docModal.root.classList.add('open');
  docModal.root.setAttribute('aria-hidden', 'false');
}

function closeDocModal() {
  if (!docModal.root) return;
  docModal.root.classList.remove('open');
  docModal.root.setAttribute('aria-hidden', 'true');
  docModal.root.dataset.plantId = '';
  docModal.root.dataset.phase = '';
  docModal.root.dataset.docId = '';
  docModal.form?.reset();
  if (docModal.feedback) {
    docModal.feedback.textContent = '';
    docModal.feedback.classList.remove('error-text');
  }
}

async function handleDocModalSubmit(event) {
  event.preventDefault();
  if (!docModal.root) return;
  const plantId = docModal.root.dataset.plantId;
  const phase = docModal.root.dataset.phase;
  const docId = docModal.root.dataset.docId;
  if (!plantId || !phase) return;
  const codeValue = docModal.code?.value.trim();
  const nameValue = docModal.name?.value.trim();
  const filenameValue = docModal.filename?.value.trim();
  if (!filenameValue) {
    if (docModal.feedback) {
      docModal.feedback.textContent = 'Inserisci un nome file (es. documento.pdf).';
      docModal.feedback.classList.add('error-text');
    }
    return;
  }
  if (!docId && (!codeValue || !nameValue)) {
    if (docModal.feedback) {
      docModal.feedback.textContent = 'Specifica codice e nome per il nuovo documento.';
      docModal.feedback.classList.add('error-text');
    }
    return;
  }
  try {
    if (docModal.feedback) {
      docModal.feedback.textContent = 'Registrazione documento…';
      docModal.feedback.classList.remove('error-text');
    }
    const res = await fetch(`${API_BASE}/docs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'plant',
        entity_id: plantId,
        phase,
        filename: filenameValue,
        code: codeValue,
        name: nameValue,
        doc_id: docId || undefined
      })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error?.message || 'Errore registrazione documento');
    }
    closeDocModal();
    toast('Documento registrato (mock). Usa il link per allegare il file reale.');
    await renderPlantCrono(plantId);
  } catch (err) {
    if (docModal.feedback) {
      docModal.feedback.textContent = err.message || 'Errore durante il caricamento simulato';
      docModal.feedback.classList.add('error-text');
    }
  }
}

async function markDoc(docId, status) {
  if (!docId || !status) return;
  try {
    const res = await fetch(`${API_BASE}/docs/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: docId, status })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error?.message || 'Errore aggiornamento documento');
    }
    const message = status === 'approved' ? 'Documento approvato.' : 'Documento respinto.';
    toast(message);
    if (state.selectedPlantId) {
      await renderPlantCrono(state.selectedPlantId);
    }
  } catch (err) {
    toast(err.message || 'Errore durante l’aggiornamento del documento.');
  }
}

async function advancePlantPhase(plantId, phase, status) {
  if (!plantId || !phase || !status) return;
  try {
    const res = await fetch(`${API_BASE}/plants/workflows/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plant_id: plantId, phase, status })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      if (payload.error?.code === 'GATE_NOT_MET') {
        toast(payload.error?.message || 'Documenti obbligatori mancanti');
        if (plantCronoFeedback) {
          const missing = payload.error?.details?.missing_docs || [];
          const phaseGate = payload.error?.details?.phase ? `Fase ${payload.error.details.phase}` : 'Documentazione precedente';
          plantCronoFeedback.textContent = `${phaseGate}: ${missing.join(', ') || 'revisione necessaria.'}`;
          plantCronoFeedback.classList.add('error-text');
        }
        return;
      }
      throw new Error(payload.error?.message || 'Errore avanzamento fase');
    }
    state.plantWorkflows.set(plantId, Array.isArray(payload.data) ? payload.data : []);
    const label = STATUS_LABELS[status] || status;
    const phaseMeta = PLANT_PHASES.find(item => item.id === phase);
    toast(`${phaseMeta ? phaseMeta.title : phase} → ${label}.`);
    if (plantCronoFeedback) {
      plantCronoFeedback.textContent = 'Fase aggiornata.';
      plantCronoFeedback.classList.remove('error-text');
    }
    await renderPlantCrono(plantId);
  } catch (err) {
    toast(err.message || 'Errore durante l’aggiornamento della fase.');
  }
}

function exportPlantChecklistCSV(plantId) {
  if (!plantId) return;
  const docs = state.plantDocs.get(plantId) || [];
  const workflows = state.plantWorkflows.get(plantId) || [];
  if (!docs.length && !workflows.length) {
    toast('Nessun dato disponibile per esportare la checklist.');
    return;
  }
  const workflowMap = new Map(workflows.map(entry => [entry.phase, entry]));
  const rows = [];
  if (docs.length) {
    docs.forEach(doc => {
      const wf = workflowMap.get(doc.phase) || {};
      rows.push({
        phase: doc.phase,
        code: doc.code || '',
        name: doc.name || '',
        status: doc.status || '',
        owner: wf.owner || '',
        due_date: wf.due_date || ''
      });
    });
  } else {
    PLANT_PHASES.forEach(phase => {
      const wf = workflowMap.get(phase.id) || {};
      rows.push({
        phase: phase.id,
        code: '',
        name: '',
        status: wf.status || '',
        owner: wf.owner || '',
        due_date: wf.due_date || ''
      });
    });
  }

  const header = ['plant_id', 'phase', 'code', 'name', 'status', 'owner', 'due_date'];
  const csvLines = [header.map(csvEscape).join(',')];
  rows.forEach(row => {
    const line = header.map(key => {
      if (key === 'plant_id') return csvEscape(plantId);
      return csvEscape(row[key] || '');
    }).join(',');
    csvLines.push(line);
  });
  const csvContent = csvLines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `plant_${plantId}_checklist_${stamp}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Checklist impianto esportata in CSV.');
}

function csvEscape(value) {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function createButton(label, handler, variant = 'ghost') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = variant === 'primary' ? 'btn' : 'btn ghost';
  btn.textContent = label;
  btn.addEventListener('click', handler);
  return btn;
}

function toast(message) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cer:notify', { detail: message }));
  }
}
