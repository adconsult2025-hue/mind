const API_BASE = '/api';

const state = {
  plants: [],
  filterCerId: '',
  selectedPlantId: '',
  production: new Map()
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

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 200);
  }, 3000);
}
