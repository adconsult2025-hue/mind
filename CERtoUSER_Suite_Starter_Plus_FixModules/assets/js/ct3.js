import {
  CT3_CATALOG as FALLBACK_CATALOG,
  fallbackEligibility,
  getFallbackCatalog,
  getFallbackPhases,
  getFallbackPresetDocs
} from './ct3_rules.js?v=21';
import { safeGuardAction } from './safe.js';

const API_BASE = '/api';
const STORAGE_CLIENTS_KEY = 'customers';

const state = {
  caseId: '',
  currentCase: createEmptyCase(),
  cases: [],
  clients: [],
  selectedClient: null,
  catalog: getFallbackCatalog(),
  phases: getFallbackPhases(),
  docPreset: [],
  requiredDocs: [],
  timelineDocs: [],
  uploadedDocs: new Map(),
  expandAll: true
};

const elements = {};

// inizializzazione
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    bindEvents();
    renderCaseMeta();
    renderInterventionOptions();
    renderDocumentTimeline();
    renderIncentiveTable([]);
    updateClientSummary();
    updateActionStates();
    loadClients();
    loadCatalog();
    loadCases();
    refreshDocumentPreset();
    computeIncentive();
  });
}

function cacheElements() {
  elements.form = document.getElementById('ct3-form');
  elements.caseSelector = document.getElementById('ct3-case-selector');
  elements.caseMeta = document.getElementById('ct3-case-meta');
  elements.statusSelect = document.getElementById('ct3-status-select');
  elements.phaseSelect = document.getElementById('ct3-phase-select');
  elements.newCaseBtn = document.getElementById('ct3-new-case');
  elements.refreshCasesBtn = document.getElementById('ct3-refresh-cases');
  elements.clientSearch = document.getElementById('ct3-client-search');
  elements.clientSuggestions = document.getElementById('ct3-client-suggestions');
  elements.subjectType = document.getElementById('ct3-subject-type');
  elements.clientSummary = document.getElementById('ct3-client-summary');
  elements.clientName = document.getElementById('ct3-client-name');
  elements.clientType = document.getElementById('ct3-client-type');
  elements.clientPods = document.getElementById('ct3-client-pods');
  elements.linkClientBtn = document.getElementById('ct3-link-client');
  elements.buildingTypes = document.getElementById('ct3-building-types');
  elements.buildingZone = document.getElementById('ct3-building-zone');
  elements.buildingCity = document.getElementById('ct3-building-city');
  elements.buildingYear = document.getElementById('ct3-building-year');
  elements.buildingExisting = document.getElementById('ct3-building-existing');
  elements.interventionType = document.getElementById('ct3-intervention-type');
  elements.interventionSubtypeWrap = document.getElementById('ct3-intervention-subtype-wrap');
  elements.interventionSubtype = document.getElementById('ct3-intervention-subtype');
  elements.interventionRange = document.getElementById('ct3-intervention-range');
  elements.sizeKwWrap = document.getElementById('ct3-size-kw-wrap');
  elements.sizeKw = document.getElementById('ct3-size-kw');
  elements.areaWrap = document.getElementById('ct3-area-m2-wrap');
  elements.areaM2 = document.getElementById('ct3-area-m2');
  elements.capex = document.getElementById('ct3-capex');
  elements.opex = document.getElementById('ct3-opex');
  elements.lifeYears = document.getElementById('ct3-life-years');
  elements.incentivePct = document.getElementById('ct3-incentive-pct');
  elements.incentiveCapUnit = document.getElementById('ct3-incentive-cap-unit');
  elements.incentiveCapTotal = document.getElementById('ct3-incentive-cap-total');
  elements.incentiveYears = document.getElementById('ct3-incentive-years');
  elements.incentiveThreshold = document.getElementById('ct3-incentive-threshold');
  elements.incentiveSavings = document.getElementById('ct3-incentive-savings');
  elements.singlePayment = document.getElementById('ct3-single-payment');
  elements.eligibilityBadge = document.getElementById('ct3-eligibility-badge');
  elements.eligibilityFeedback = document.getElementById('ct3-eligibility-feedback');
  elements.phasesContainer = document.getElementById('ct3-phases');
  elements.expandAllBtn = document.getElementById('ct3-expand-all');
  elements.incentiveTable = document.getElementById('ct3-incentive-table');
  elements.saveDraftBtn = document.getElementById('ct3-save-draft');
  elements.runEligibilityBtn = document.getElementById('ct3-run-eligibility');
  elements.exportChecklistBtn = document.getElementById('ct3-export-checklist');
  elements.sendCronoBtn = document.getElementById('ct3-send-crono');
}

function bindEvents() {
  if (elements.caseSelector) {
    elements.caseSelector.addEventListener('change', handleCaseSelection);
  }
  if (elements.newCaseBtn) {
    elements.newCaseBtn.addEventListener('click', resetForm);
  }
  if (elements.refreshCasesBtn) {
    elements.refreshCasesBtn.addEventListener('click', loadCases);
  }
  if (elements.statusSelect) {
    elements.statusSelect.addEventListener('change', handleStatusChange);
  }
  if (elements.phaseSelect) {
    elements.phaseSelect.addEventListener('change', () => {
      state.currentCase.checklist_state = state.currentCase.checklist_state || { phase: 'F0', docs: [] };
      state.currentCase.checklist_state.phase = elements.phaseSelect.value;
      renderDocumentTimeline();
    });
  }
  if (elements.clientSearch) {
    elements.clientSearch.addEventListener('input', handleClientSearch);
    elements.clientSearch.addEventListener('focus', handleClientSearch);
  }
  if (elements.clientSuggestions) {
    elements.clientSuggestions.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-client-id]');
      if (!button) return;
      const client = state.clients.find((item) => item.id === button.dataset.clientId);
      if (client) {
        selectClient(client);
        elements.clientSuggestions.classList.remove('show');
      }
    });
  }
  if (elements.linkClientBtn) {
    elements.linkClientBtn.addEventListener('click', () => {
      if (!state.selectedClient) {
        const match = findClientByInput(elements.clientSearch.value);
        if (match) {
          selectClient(match);
        }
      }
      if (state.selectedClient) {
        state.currentCase.client_id = state.selectedClient.id;
        updateClientSummary();
        notify('Cliente CRM collegato alla pratica.');
        updateActionStates();
      } else {
        notify('Seleziona un cliente dal CRM tramite la ricerca.');
      }
    });
  }
  if (elements.subjectType) {
    elements.subjectType.addEventListener('change', () => {
      state.currentCase.subject_type = elements.subjectType.value;
      refreshDocumentPreset();
      updateActionStates();
    });
  }
  if (elements.interventionType) {
    elements.interventionType.addEventListener('change', () => handleInterventionChange(true));
  }
  if (elements.interventionSubtype) {
    elements.interventionSubtype.addEventListener('change', () => {
      state.currentCase.intervention.subtype = elements.interventionSubtype.value;
      updateActionStates();
    });
  }
  if (elements.buildingTypes) {
    elements.buildingTypes.addEventListener('change', updateActionStates);
  }
  [elements.buildingZone, elements.buildingCity, elements.buildingYear, elements.buildingExisting,
   elements.sizeKw, elements.areaM2, elements.capex, elements.opex, elements.lifeYears,
   elements.incentivePct, elements.incentiveCapUnit, elements.incentiveCapTotal,
   elements.incentiveYears, elements.incentiveThreshold, elements.incentiveSavings,
   elements.singlePayment].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => {
      updateActionStates();
      computeIncentive();
    });
    input.addEventListener('change', () => {
      updateActionStates();
      computeIncentive();
    });
  });
  if (elements.expandAllBtn) {
    elements.expandAllBtn.addEventListener('click', toggleExpandAll);
  }
  if (elements.saveDraftBtn) {
    elements.saveDraftBtn.addEventListener('click', saveCase);
  }
  if (elements.runEligibilityBtn) {
    elements.runEligibilityBtn.addEventListener('click', runEligibility);
  }
  if (elements.exportChecklistBtn) {
    elements.exportChecklistBtn.addEventListener('click', exportChecklist);
  }
  if (elements.sendCronoBtn) {
    elements.sendCronoBtn.addEventListener('click', sendToCronoprogramma);
  }
}

function createEmptyCase() {
  return {
    id: '',
    tenant_id: 'demo',
    client_id: '',
    subject_type: '',
    building: {
      types: [],
      zone: '',
      comune: '',
      year: null,
      existing: false
    },
    intervention: {
      type: '',
      subtype: '',
      size_kw: 0,
      area_m2: 0,
      capex_eur: 0,
      opex_eur: 0,
      life_years: 0
    },
    incentive_params: {
      pct: 0,
      cap_per_unit: 0,
      cap_total: 0,
      years: 1,
      single_pay_threshold_eur: 5000,
      expected_savings_eur: 0,
      single_payment_if_threshold: false
    },
    status: 'draft',
    checklist_state: { phase: 'F0', docs: [] },
    created_at: null,
    updated_at: null
  };
}

async function loadClients() {
  try {
    const res = await fetch(`${API_BASE}/clients`);
    if (res.ok) {
      const json = await res.json();
      if (json?.ok && Array.isArray(json.data)) {
        state.clients = json.data.map(normalizeClient).filter(Boolean);
        return;
      }
    }
  } catch (err) {
    console.warn('CRM API non disponibile, uso localStorage', err);
  }
  state.clients = readLocalClients().map(normalizeClient).filter(Boolean);
}

function readLocalClients() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_CLIENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeClient(client) {
  if (!client) return null;
  return {
    id: client.id || client.client_id || '',
    nome: client.nome || client.name || 'Cliente',
    tipo: client.tipo || client.subject_type || '',
    cf: client.cf || client.codice_fiscale || client.piva || '',
    pod: client.pod || '',
    pods: Array.isArray(client.pods) ? client.pods : (client.pod ? [client.pod] : []),
    comune: client.comune || client.city || '',
    email: client.email || '',
    telefono: client.tel || client.telefono || ''
  };
}

async function loadCatalog() {
  try {
    const res = await fetch(`${API_BASE}/ct3/rules/catalog`);
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Catalogo non disponibile');
    state.catalog = Array.isArray(json.data) ? json.data : getFallbackCatalog();
  } catch (err) {
    console.warn('Uso catalogo fallback CT3', err);
    state.catalog = getFallbackCatalog();
  }
  renderInterventionOptions();
}

function renderInterventionOptions() {
  if (!elements.interventionType) return;
  const current = elements.interventionType.value || state.currentCase.intervention?.type || '';
  const options = state.catalog
    .map((item) => `<option value="${item.type}">${item.label}</option>`)
    .join('');
  elements.interventionType.innerHTML = `<option value="">Seleziona intervento</option>${options}`;
  elements.interventionType.value = current;
  handleInterventionChange(false);
}

async function loadCases() {
  try {
    const res = await fetch(`${API_BASE}/ct3/cases`);
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Impossibile recuperare le pratiche');
    state.cases = Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    console.warn('Impossibile recuperare le pratiche CT3', err);
    state.cases = state.cases || [];
  }
  renderCaseSelector();
}

async function handleCaseSelection() {
  const id = elements.caseSelector.value;
  if (!id) {
    resetForm();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/ct3/cases/${encodeURIComponent(id)}`);
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Pratica non trovata');
    const data = json.data;
    state.caseId = data.id;
    state.currentCase = enrichCase(data);
    elements.statusSelect.value = state.currentCase.status || 'draft';
    elements.phaseSelect.value = state.currentCase.checklist_state?.phase || 'F0';
    populateFormFromCase(state.currentCase);
    updateClientSummary();
    renderCaseMeta();
    refreshDocumentPreset();
    await loadCaseDocs(state.caseId);
    computeIncentive();
    notify('Pratica CT 3.0 caricata.');
  } catch (err) {
    console.error(err);
    notify(err.message || 'Impossibile caricare la pratica selezionata.');
  }
}

function enrichCase(data) {
  const base = createEmptyCase();
  const copy = data ? JSON.parse(JSON.stringify(data)) : {};
  base.id = copy.id || '';
  base.tenant_id = copy.tenant_id || 'demo';
  base.client_id = copy.client_id || '';
  base.subject_type = copy.subject_type || '';
  base.building = { ...base.building, ...(copy.building || {}) };
  base.intervention = { ...base.intervention, ...(copy.intervention || {}) };
  base.incentive_params = { ...base.incentive_params, ...(copy.incentive_params || {}) };
  base.status = copy.status || 'draft';
  base.checklist_state = { ...base.checklist_state, ...(copy.checklist_state || {}) };
  base.created_at = copy.created_at || null;
  base.updated_at = copy.updated_at || null;
  return base;
}

function populateFormFromCase(caseData) {
  elements.subjectType.value = caseData.subject_type || '';
  setSelectMultiple(elements.buildingTypes, caseData.building?.types || []);
  elements.buildingZone.value = caseData.building?.zone || '';
  elements.buildingCity.value = caseData.building?.comune || '';
  elements.buildingYear.value = caseData.building?.year || '';
  elements.buildingExisting.checked = caseData.building?.existing === true;
  elements.interventionType.value = caseData.intervention?.type || '';
  handleInterventionChange(false);
  elements.interventionSubtype.value = caseData.intervention?.subtype || '';
  elements.sizeKw.value = formatNumber(caseData.intervention?.size_kw);
  elements.areaM2.value = formatNumber(caseData.intervention?.area_m2);
  elements.capex.value = formatNumber(caseData.intervention?.capex_eur);
  elements.opex.value = formatNumber(caseData.intervention?.opex_eur);
  elements.lifeYears.value = caseData.intervention?.life_years || '';
  elements.incentivePct.value = caseData.incentive_params?.pct ? (Number(caseData.incentive_params.pct) * 100).toFixed(2) : '';
  elements.incentiveCapUnit.value = formatNumber(caseData.incentive_params?.cap_per_unit);
  elements.incentiveCapTotal.value = formatNumber(caseData.incentive_params?.cap_total);
  elements.incentiveYears.value = caseData.incentive_params?.years || 1;
  elements.incentiveThreshold.value = formatNumber(caseData.incentive_params?.single_pay_threshold_eur);
  elements.incentiveSavings.value = formatNumber(caseData.incentive_params?.expected_savings_eur);
  elements.singlePayment.checked = caseData.incentive_params?.single_payment_if_threshold === true;
  state.selectedClient = state.clients.find((item) => item.id === caseData.client_id) || null;
  elements.clientSearch.value = state.selectedClient ? state.selectedClient.nome : '';
  updateClientSummary();
  updateActionStates();
}

function setSelectMultiple(select, values) {
  if (!select) return;
  const set = new Set(values || []);
  Array.from(select.options).forEach((option) => {
    option.selected = set.has(option.value);
  });
}

function handleInterventionChange(refreshPreset = true) {
  const value = elements.interventionType.value;
  state.currentCase.intervention.type = value;
  const item = state.catalog.find((entry) => entry.type === value) || FALLBACK_CATALOG.find((entry) => entry.type === value);
  if (item?.subtypes?.length) {
    elements.interventionSubtypeWrap.hidden = false;
    elements.interventionSubtype.innerHTML = '<option value="">Seleziona sottotipo</option>' + item.subtypes.map((sub) => `<option value="${sub.code}">${sub.label}</option>`).join('');
  } else {
    elements.interventionSubtypeWrap.hidden = true;
    elements.interventionSubtype.innerHTML = '';
    elements.interventionSubtype.value = '';
    state.currentCase.intervention.subtype = '';
  }
  if (item) {
    const range = [];
    if (item.min_size) range.push(`min ${item.min_size} ${item.unit}`);
    if (item.max_size) range.push(`max ${item.max_size} ${item.unit}`);
    elements.interventionRange.textContent = `${item.label} — ${item.unit.toUpperCase()} ${range.join(' · ')}`;
    if (item.unit === 'm2') {
      elements.areaWrap.hidden = false;
      elements.sizeKwWrap.hidden = true;
    } else {
      elements.areaWrap.hidden = true;
      elements.sizeKwWrap.hidden = false;
    }
  } else {
    elements.interventionRange.textContent = 'Seleziona una tecnologia dal catalogo CT 3.0.';
    elements.areaWrap.hidden = true;
    elements.sizeKwWrap.hidden = false;
  }
  if (refreshPreset) {
    refreshDocumentPreset();
  }
  updateActionStates();
  computeIncentive();
}

function createCasePayload() {
  const payload = enrichCase(state.currentCase);
  payload.id = state.caseId || payload.id || undefined;
  payload.client_id = state.selectedClient?.id || payload.client_id || '';
  payload.subject_type = elements.subjectType.value || payload.subject_type;
  payload.building = {
    ...payload.building,
    types: Array.from(elements.buildingTypes.selectedOptions || []).map((option) => option.value),
    zone: elements.buildingZone.value || '',
    comune: elements.buildingCity.value || '',
    year: optionalNumber(elements.buildingYear.value),
    existing: elements.buildingExisting.checked
  };
  payload.intervention = {
    ...payload.intervention,
    type: elements.interventionType.value || '',
    subtype: elements.interventionSubtype.value || '',
    size_kw: parseNumber(elements.sizeKw.value),
    area_m2: parseNumber(elements.areaM2.value),
    capex_eur: parseNumber(elements.capex.value),
    opex_eur: parseNumber(elements.opex.value),
    life_years: parseNumber(elements.lifeYears.value)
  };
  const pctInput = Number(elements.incentivePct.value || 0);
  payload.incentive_params = {
    pct: pctInput / 100,
    cap_per_unit: parseNumber(elements.incentiveCapUnit.value),
    cap_total: parseNumber(elements.incentiveCapTotal.value),
    years: parseInt(elements.incentiveYears.value || '0', 10),
    single_pay_threshold_eur: parseNumber(elements.incentiveThreshold.value),
    expected_savings_eur: parseNumber(elements.incentiveSavings.value),
    single_payment_if_threshold: elements.singlePayment.checked === true
  };
  payload.status = elements.statusSelect.value || payload.status || 'draft';
  payload.checklist_state = {
    ...(payload.checklist_state || {}),
    phase: elements.phaseSelect.value || payload.checklist_state?.phase || 'F0'
  };
  return payload;
}

function updateActionStates() {
  if (!elements.runEligibilityBtn) return;
  elements.runEligibilityBtn.disabled = !canEvaluateEligibility();
}

function canEvaluateEligibility() {
  const subject = elements.subjectType.value;
  const hasClient = Boolean(state.selectedClient?.id || state.currentCase.client_id);
  const existing = elements.buildingExisting.checked;
  const intervention = elements.interventionType.value;
  const sizeKw = parseNumber(elements.sizeKw.value);
  const area = parseNumber(elements.areaM2.value);
  const pct = Number(elements.incentivePct.value || 0);
  const years = Number(elements.incentiveYears.value || 0);
  const threshold = Number(elements.incentiveThreshold.value || 0);
  const hasSize = sizeKw > 0 || area > 0;
  return Boolean(subject && intervention && hasClient && existing && hasSize && pct > 0 && years >= 1 && years <= 5 && threshold >= 0);
}

async function saveCase() {
  const payload = createCasePayload();
  try {
    const res = await safeGuardAction(() => fetch(`${API_BASE}/ct3/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Salvataggio fallito');
    const saved = enrichCase(json.data || {});
    state.caseId = saved.id;
    state.currentCase = saved;
    elements.caseSelector.value = saved.id || '';
    elements.statusSelect.value = saved.status || 'draft';
    elements.phaseSelect.value = saved.checklist_state?.phase || 'F0';
    populateFormFromCase(saved);
    renderCaseMeta();
    await loadCases();
    await loadCaseDocs(state.caseId);
    notify('Bozza pratica CT 3.0 salvata.');
  } catch (err) {
    console.error(err);
    notify(err.message || 'Impossibile salvare la pratica.');
  }
}

async function handleStatusChange() {
  state.currentCase.status = elements.statusSelect.value;
  if (!state.caseId) return;
  try {
    const res = await safeGuardAction(() => fetch(`${API_BASE}/ct3/cases/${encodeURIComponent(state.caseId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: state.currentCase.status })
    }));
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Cambio stato non riuscito');
    notify('Stato pratica aggiornato.');
  } catch (err) {
    console.error(err);
    notify(err.message || 'Impossibile aggiornare lo stato.');
  }
  renderCaseMeta();
}

async function runEligibility() {
  const payload = createCasePayload();
  const issues = validateBeforeCheck(payload);
  if (issues.length) {
    showEligibility({ eligible: false, reasons: issues, required_docs: state.requiredDocs });
    notify('Compila i campi obbligatori prima di avviare la verifica.');
    return;
  }
  let response;
  try {
    const res = await safeGuardAction(() => fetch(`${API_BASE}/ct3/rules/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case: payload })
    }));
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Motore regole non disponibile');
    response = json.data;
  } catch (err) {
    console.warn('Motore regole indisponibile, uso fallback', err);
    response = fallbackEligibility(payload);
  }
  state.requiredDocs = Array.isArray(response?.required_docs) ? response.required_docs : [];
  showEligibility(response);
  refreshDocumentPreset();
  if (['draft', 'in_review'].includes(state.currentCase.status)) {
    const nextStatus = response?.eligible ? 'eligible' : 'ineligible';
    elements.statusSelect.value = nextStatus;
    state.currentCase.status = nextStatus;
  }
  computeIncentive(payload);
}

function validateBeforeCheck(payload) {
  const errors = [];
  if (!payload.client_id) errors.push('Associare un cliente CRM alla pratica.');
  if (!payload.subject_type) errors.push('Selezionare la tipologia di soggetto.');
  if (!payload.building?.existing) errors.push('Confermare che l’edificio è esistente.');
  if (!payload.intervention?.type) errors.push('Selezionare l’intervento dal catalogo CT 3.0.');
  const unit = getInterventionUnit(payload.intervention?.type);
  const size = unit === 'm2' ? Number(payload.intervention?.area_m2 || 0) : Number(payload.intervention?.size_kw || 0);
  if (!(size > 0)) errors.push('Indicare la taglia (kW/m²) dell’intervento.');
  if (!(payload.incentive_params?.pct > 0)) errors.push('Impostare la percentuale di incentivo base.');
  const years = Number(payload.incentive_params?.years || 0);
  if (!(years >= 1 && years <= 5)) errors.push('Gli anni di erogazione devono essere compresi tra 1 e 5.');
  return errors;
}

function showEligibility(result) {
  const eligible = Boolean(result?.eligible);
  const reasons = Array.isArray(result?.reasons) ? result.reasons.filter(Boolean) : [];
  const badge = elements.eligibilityBadge;
  badge.className = 'badge ' + (eligible ? 'green' : reasons.length ? 'warn' : 'muted');
  badge.textContent = eligible ? 'Ammissibile' : reasons.length ? 'Non ammissibile' : 'Da completare';
  elements.eligibilityFeedback.innerHTML = '';
  if (eligible) {
    const success = document.createElement('div');
    success.innerHTML = '<p class="info-text">La pratica soddisfa i requisiti minimi CT 3.0 secondo le regole parametriche.</p>';
    elements.eligibilityFeedback.appendChild(success);
  } else if (reasons.length) {
    const list = document.createElement('ul');
    reasons.forEach((reason) => {
      const li = document.createElement('li');
      li.textContent = reason;
      list.appendChild(li);
    });
    const header = document.createElement('div');
    header.innerHTML = '<strong>Requisiti mancanti / criticità:</strong>';
    elements.eligibilityFeedback.appendChild(header);
    elements.eligibilityFeedback.appendChild(list);
  } else {
    elements.eligibilityFeedback.innerHTML = '<p class="info-text">Completa i dati obbligatori e riesegui la verifica.</p>';
  }
}

function refreshDocumentPreset() {
  const subject = elements.subjectType.value || state.currentCase.subject_type;
  const intervention = elements.interventionType.value || state.currentCase.intervention.type;
  const fallback = getFallbackPresetDocs(subject, intervention);
  state.phases = fallback.phases;
  state.docPreset = fallback.documents;
  fetchPresetFromApi(subject, intervention);
}

async function fetchPresetFromApi(subject, intervention) {
  try {
    const params = new URLSearchParams();
    if (subject) params.set('subject_type', subject);
    if (intervention) params.set('intervention_type', intervention);
    const url = `${API_BASE}/ct3/docs/preset${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Preset documentale non disponibile');
    if (Array.isArray(json.data?.phases)) state.phases = json.data.phases;
    if (Array.isArray(json.data?.documents)) state.docPreset = json.data.documents;
  } catch (err) {
    console.warn('Preset documentale CT3 offline, uso fallback', err);
  }
  updateTimelineDocs();
}

function updateTimelineDocs() {
  const map = new Map();
  const addDoc = (doc, source) => {
    if (!doc || !doc.code) return;
    const key = `${doc.phase || ''}:${doc.code}`;
    const existing = map.get(key);
    const payload = {
      phase: doc.phase,
      code: doc.code,
      name: doc.name,
      mandatory: doc.mandatory !== false,
      sources: existing ? existing.sources : []
    };
    const sources = new Set(payload.sources);
    if (source) sources.add(source);
    payload.sources = Array.from(sources);
    if (existing) {
      payload.mandatory = existing.mandatory || payload.mandatory;
    }
    map.set(key, payload);
  };
  state.docPreset.forEach((doc) => addDoc(doc, 'preset'));
  state.requiredDocs.forEach((doc) => addDoc(doc, 'rule'));
  state.timelineDocs = Array.from(map.values()).sort((a, b) => {
    const diff = phaseOrder(a.phase) - phaseOrder(b.phase);
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
  });
  renderDocumentTimeline();
}

async function loadCaseDocs(caseId) {
  if (!caseId) {
    state.uploadedDocs = new Map();
    renderDocumentTimeline();
    return;
  }
  try {
    const params = new URLSearchParams({ entity_type: 'ct3_case', entity_id: caseId });
    const res = await fetch(`${API_BASE}/docs?${params.toString()}`);
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Impossibile recuperare i documenti caricati');
    const docs = Array.isArray(json.data) ? json.data : [];
    state.uploadedDocs = new Map();
    docs.forEach((doc) => registerUploadedDoc(doc));
  } catch (err) {
    console.warn('Documenti caricati non disponibili', err);
    state.uploadedDocs = state.uploadedDocs || new Map();
  }
  renderDocumentTimeline();
}

function renderDocumentTimeline() {
  if (!elements.phasesContainer) return;
  elements.phasesContainer.innerHTML = '';
  const activePhase = elements.phaseSelect?.value || state.currentCase.checklist_state?.phase || 'F0';
  state.phases.forEach((phase) => {
    const card = document.createElement('article');
    card.className = 'ct3-phase-card';
    if (state.expandAll || phase.id === activePhase) {
      card.classList.add('expanded');
    }
    const header = document.createElement('header');
    header.innerHTML = `<div><h3>${phase.title || phase.id}</h3><p class="info-text">${phase.description || ''}</p></div>`;
    header.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
    const status = document.createElement('span');
    status.className = 'badge muted';
    status.textContent = phase.id;
    header.appendChild(status);
    card.appendChild(header);

    const list = document.createElement('div');
    list.className = 'ct3-doc-list';
    const docs = state.timelineDocs.filter((doc) => doc.phase === phase.id);
    if (!docs.length) {
      const empty = document.createElement('p');
      empty.className = 'info-text';
      empty.textContent = 'Nessun documento richiesto per questa fase.';
      list.appendChild(empty);
    } else {
      docs.forEach((doc) => {
        list.appendChild(renderDocRow(phase.id, doc));
      });
    }
    card.appendChild(list);
    elements.phasesContainer.appendChild(card);
  });
  updateExpandButton();
}

function renderDocRow(phaseId, doc) {
  const row = document.createElement('div');
  row.className = 'ct3-doc-row';
  const info = document.createElement('div');
  const title = document.createElement('p');
  title.innerHTML = `<strong>${doc.name || doc.code}</strong>`;
  const meta = document.createElement('p');
  meta.className = 'ct3-doc-status';
  const uploaded = getUploadedDoc(doc);
  const badge = document.createElement('span');
  const status = uploaded?.status || 'pending';
  if (status === 'approved') badge.className = 'badge green';
  else if (status === 'rejected') badge.className = 'badge warn';
  else if (status === 'uploaded') badge.className = 'badge blue';
  else badge.className = 'badge muted';
  badge.textContent = status === 'pending' ? 'Da caricare' : status;
  meta.appendChild(badge);
  if (doc.mandatory) {
    const flag = document.createElement('span');
    flag.className = 'badge';
    flag.textContent = 'Obbligatorio';
    meta.appendChild(flag);
  }
  if (uploaded?.url) {
    const link = document.createElement('a');
    link.href = uploaded.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Apri';
    meta.appendChild(link);
  }
  info.appendChild(title);
  info.appendChild(meta);
  row.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'btn ghost btn-xs';
  uploadBtn.textContent = 'Upload';
  uploadBtn.addEventListener('click', () => handleUploadDoc(phaseId, doc));
  actions.appendChild(uploadBtn);

  const approveBtn = document.createElement('button');
  approveBtn.type = 'button';
  approveBtn.className = 'btn ghost btn-xs';
  approveBtn.textContent = 'Approva';
  approveBtn.disabled = !uploaded;
  approveBtn.addEventListener('click', () => markDocStatus(doc, 'approved'));
  actions.appendChild(approveBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.type = 'button';
  rejectBtn.className = 'btn ghost btn-xs';
  rejectBtn.textContent = 'Rifiuta';
  rejectBtn.disabled = !uploaded;
  rejectBtn.addEventListener('click', () => markDocStatus(doc, 'rejected'));
  actions.appendChild(rejectBtn);

  row.appendChild(actions);
  return row;
}

function docKey(phase, code) {
  if (!code) return '';
  return `${phase || ''}:${code}`;
}

function registerUploadedDoc(entry, meta = {}) {
  if (!entry) return;
  if (!(state.uploadedDocs instanceof Map)) {
    state.uploadedDocs = new Map();
  }
  const payload = { ...entry };
  if (meta.code) payload.code = meta.code;
  if (meta.name && !payload.name) payload.name = meta.name;
  const phase = meta.phase || payload.phase || meta.phaseId || '';
  if (phase) payload.phase = phase;
  const keys = new Set();
  if (payload.code) {
    keys.add(payload.code);
    keys.add(docKey(phase, payload.code));
  }
  if (payload.doc_id) {
    keys.add(payload.doc_id);
  }
  if (!keys.size) {
    keys.add(docKey(phase, payload.doc_id || payload.filename || ''));
  }
  keys.forEach((key) => {
    if (key) {
      state.uploadedDocs.set(key, payload);
    }
  });
}

function getUploadedDoc(doc) {
  if (!doc) return null;
  const phase = doc.phase || '';
  const candidates = [
    docKey(phase, doc.code),
    doc.code,
    doc.doc_id,
    docKey(phase, doc.doc_id)
  ].filter(Boolean);
  for (const key of candidates) {
    if (state.uploadedDocs.has(key)) {
      return state.uploadedDocs.get(key);
    }
  }
  return null;
}

function handleUploadDoc(phaseId, doc) {
  if (!state.caseId) {
    notify('Salva la pratica prima di caricare documenti.');
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    const filename = file?.name || prompt('Nome file da allegare (mock upload)');
    if (!filename) return;
    try {
      const res = await safeGuardAction(() => fetch(`${API_BASE}/docs/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'ct3_case',
          entity_id: state.caseId,
          phase: phaseId,
          code: doc.code,
          name: doc.name,
          filename
        })
      }));
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Upload fallito');
      const uploaded = json.data;
      registerUploadedDoc(uploaded, { phase: phaseId, code: doc.code, name: doc.name });
      renderDocumentTimeline();
      notify('Documento caricato (mock).');
    } catch (err) {
      console.error(err);
      notify(err.message || 'Upload non riuscito.');
    }
  });
  input.click();
}

async function markDocStatus(doc, status) {
  const existing = getUploadedDoc(doc);
  if (!existing) {
    notify('Carica il documento prima di approvarlo.');
    return;
  }
  try {
    const res = await safeGuardAction(() => fetch(`${API_BASE}/docs/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: existing.doc_id, status })
    }));
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Aggiornamento stato fallito');
    registerUploadedDoc(json.data, { phase: doc.phase, code: doc.code, name: doc.name });
    renderDocumentTimeline();
    notify(`Documento ${status === 'approved' ? 'approvato' : 'rifiutato'}.`);
  } catch (err) {
    console.error(err);
    notify(err.message || 'Impossibile aggiornare lo stato del documento.');
  }
}

function updateExpandButton() {
  if (!elements.expandAllBtn) return;
  elements.expandAllBtn.textContent = state.expandAll ? 'Comprimi tutto' : 'Espandi tutto';
}

function toggleExpandAll() {
  state.expandAll = !state.expandAll;
  renderDocumentTimeline();
}

function computeIncentive(caseData = createCasePayload()) {
  const unit = getInterventionUnit(caseData.intervention?.type);
  const size = unit === 'm2' ? Number(caseData.intervention?.area_m2 || 0) : Number(caseData.intervention?.size_kw || 0);
  const capex = Number(caseData.intervention?.capex_eur || 0);
  const pct = Number(caseData.incentive_params?.pct || 0);
  const capPerUnit = Number(caseData.incentive_params?.cap_per_unit || 0);
  const capTotal = Number(caseData.incentive_params?.cap_total || 0);
  const years = Math.max(1, Number(caseData.incentive_params?.years || 1));
  const threshold = Number(caseData.incentive_params?.single_pay_threshold_eur || 0);
  const savings = Number(caseData.incentive_params?.expected_savings_eur || 0);
  const opex = Number(caseData.intervention?.opex_eur || 0);
  const singlePaymentAllowed = caseData.incentive_params?.single_payment_if_threshold === true;

  const baseIncentive = capex * pct;
  const capByUnit = capPerUnit * (size || 0) + capTotal;
  const gross = Math.min(baseIncentive || 0, capByUnit || baseIncentive || 0);
  const schedule = [];
  if (gross <= 0) {
    renderIncentiveTable([]);
    return;
  }
  if (singlePaymentAllowed && gross <= threshold) {
    const cf = gross + savings - opex;
    schedule.push({ year: 1, quota: gross, savings, opex, cf });
  } else {
    const quota = gross / years;
    for (let i = 1; i <= years; i += 1) {
      const cf = quota + savings - opex;
      schedule.push({ year: i, quota, savings, opex, cf });
    }
  }
  renderIncentiveTable(schedule);
}

function renderIncentiveTable(rows) {
  if (!elements.incentiveTable) return;
  const tbody = elements.incentiveTable.querySelector('tbody');
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'info-text';
    td.textContent = 'Inserisci i dati economici per generare la simulazione incentivo.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>Anno ${row.year}</td>
      <td>${formatEuro(row.quota)}</td>
      <td>${formatEuro(row.savings)}</td>
      <td>${formatEuro(row.opex)}</td>
      <td>${formatEuro(row.cf)}</td>
    `;
    tbody.appendChild(tr);
  });
  const totals = rows.reduce((acc, cur) => {
    acc.quota += cur.quota;
    acc.savings += cur.savings;
    acc.opex += cur.opex;
    acc.cf += cur.cf;
    return acc;
  }, { quota: 0, savings: 0, opex: 0, cf: 0 });
  const totalRow = document.createElement('tr');
  totalRow.innerHTML = `
    <td><strong>Totale</strong></td>
    <td><strong>${formatEuro(totals.quota)}</strong></td>
    <td><strong>${formatEuro(totals.savings)}</strong></td>
    <td><strong>${formatEuro(totals.opex)}</strong></td>
    <td><strong>${formatEuro(totals.cf)}</strong></td>
  `;
  tbody.appendChild(totalRow);
}

function exportChecklist() {
  if (!state.timelineDocs.length) {
    notify('Checklist vuota: esegui prima la verifica o seleziona un intervento.');
    return;
  }
  const rows = [['Fase', 'Codice', 'Documento', 'Obbligatorio', 'Stato', 'URL']];
  state.timelineDocs.forEach((doc) => {
    const uploaded = getUploadedDoc(doc);
    rows.push([
      doc.phase,
      doc.code,
      doc.name,
      doc.mandatory ? 'SI' : 'NO',
      uploaded?.status || 'pending',
      uploaded?.url || ''
    ]);
  });
  const csv = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ct3_checklist_${state.caseId || 'bozza'}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Checklist esportata in formato CSV.');
}

function sendToCronoprogramma() {
  if (!state.caseId) {
    notify('Salva la pratica prima di inviare il cronoprogramma.');
    return;
  }
  try {
    const payload = {
      case_id: state.caseId,
      status: state.currentCase.status,
      phase: state.currentCase.checklist_state?.phase,
      client_id: state.currentCase.client_id
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cronoprogramma:ct3-link', { detail: payload }));
    }
    queueCronoprogramma(payload);
    notify('Pratica inviata al Cronoprogramma impianto (mock).');
  } catch (err) {
    console.warn('Cronoprogramma non disponibile', err);
    notify('Cronoprogramma impianto non disponibile in questa build.');
  }
}

function queueCronoprogramma(payload) {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = 'ct3_cronoprogramma_queue';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ ...payload, ts: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (err) {
    console.warn('Impossibile memorizzare il cronoprogramma mock', err);
  }
}

function renderCaseMeta() {
  if (!elements.caseMeta) return;
  if (!state.caseId) {
    elements.caseMeta.textContent = 'Nessuna pratica selezionata. Le pratiche vengono salvate in locale tramite le API mock.';
    return;
  }
  const updated = state.currentCase.updated_at ? `Aggiornata il ${formatDate(state.currentCase.updated_at)}` : 'In bozza';
  elements.caseMeta.textContent = `Pratica ${state.caseId} — Stato: ${state.currentCase.status || 'draft'} — ${updated}`;
}

function renderCaseSelector() {
  if (!elements.caseSelector) return;
  const current = elements.caseSelector.value;
  elements.caseSelector.innerHTML = '<option value="">Nuova pratica</option>' + state.cases.map((item) => {
    const label = `${item.id || 'case'} — ${item.status || 'draft'}`;
    return `<option value="${item.id}">${label}</option>`;
  }).join('');
  elements.caseSelector.value = current || state.caseId || '';
}

function resetForm() {
  state.caseId = '';
  state.currentCase = createEmptyCase();
  state.requiredDocs = [];
  state.timelineDocs = [];
  state.uploadedDocs = new Map();
  state.selectedClient = null;
  elements.caseSelector.value = '';
  elements.subjectType.value = '';
  setSelectMultiple(elements.buildingTypes, []);
  elements.buildingZone.value = '';
  elements.buildingCity.value = '';
  elements.buildingYear.value = '';
  elements.buildingExisting.checked = false;
  elements.interventionType.value = '';
  handleInterventionChange(false);
  elements.interventionSubtype.value = '';
  elements.sizeKw.value = '';
  elements.areaM2.value = '';
  elements.capex.value = '';
  elements.opex.value = '';
  elements.lifeYears.value = '';
  elements.incentivePct.value = '';
  elements.incentiveCapUnit.value = '';
  elements.incentiveCapTotal.value = '';
  elements.incentiveYears.value = '1';
  elements.incentiveThreshold.value = '5000';
  elements.incentiveSavings.value = '';
  elements.singlePayment.checked = false;
  elements.statusSelect.value = 'draft';
  elements.phaseSelect.value = 'F0';
  elements.clientSearch.value = '';
  elements.clientSuggestions.classList.remove('show');
  renderCaseMeta();
  updateClientSummary();
  renderDocumentTimeline();
  renderIncentiveTable([]);
  updateActionStates();
}

function updateClientSummary() {
  if (!elements.clientSummary) return;
  const clientId = state.selectedClient?.id || state.currentCase.client_id;
  const client = state.clients.find((item) => item.id === clientId) || state.selectedClient || null;
  if (!client) {
    elements.clientSummary.hidden = true;
    elements.clientPods.innerHTML = '';
    elements.clientName.textContent = '';
    elements.clientType.textContent = '';
    return;
  }
  elements.clientSummary.hidden = false;
  elements.clientName.textContent = client.nome;
  elements.clientType.textContent = client.tipo || '—';
  elements.clientPods.innerHTML = '';
  (client.pods || []).forEach((pod) => {
    const span = document.createElement('span');
    span.className = 'badge';
    span.textContent = pod;
    elements.clientPods.appendChild(span);
  });
}

function handleClientSearch() {
  if (!elements.clientSearch || !elements.clientSuggestions) return;
  const term = elements.clientSearch.value.trim().toLowerCase();
  if (!term) {
    elements.clientSuggestions.classList.remove('show');
    elements.clientSuggestions.innerHTML = '';
    return;
  }
  const matches = state.clients
    .filter((client) => {
      const tokens = [client.nome, client.cf, client.pod, ...(client.pods || [])].filter(Boolean).map((value) => String(value).toLowerCase());
      return tokens.some((token) => token.includes(term));
    })
    .slice(0, 6);
  if (!matches.length) {
    elements.clientSuggestions.classList.remove('show');
    elements.clientSuggestions.innerHTML = '';
    return;
  }
  elements.clientSuggestions.innerHTML = matches
    .map((client) => `<button type="button" data-client-id="${client.id}"><strong>${client.nome}</strong><br/><small>${client.tipo || '—'} · ${client.pods?.[0] || client.pod || ''}</small></button>`)
    .join('');
  elements.clientSuggestions.classList.add('show');
}

function selectClient(client) {
  state.selectedClient = client;
  state.currentCase.client_id = client.id;
  elements.clientSearch.value = client.nome;
  elements.clientSuggestions.classList.remove('show');
  updateClientSummary();
  updateActionStates();
}

function findClientByInput(input) {
  const term = String(input || '').trim().toLowerCase();
  if (!term) return null;
  return state.clients.find((client) => {
    const tokens = [client.nome, client.cf, client.pod, ...(client.pods || [])]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return tokens.some((token) => token === term || token.includes(term));
  }) || null;
}

function getInterventionUnit(type) {
  const item = state.catalog.find((entry) => entry.type === type) || FALLBACK_CATALOG.find((entry) => entry.type === type);
  return item?.unit || 'kW';
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function optionalNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num;
}

function formatEuro(value) {
  const num = Number(value || 0);
  return num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT');
}

function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function phaseOrder(phase) {
  const phases = state.phases.length ? state.phases : getFallbackPhases();
  const index = phases.findIndex((item) => item.id === phase);
  return index === -1 ? 999 : index;
}

function notify(message) {
  if (!message || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cer:notify', { detail: message }));
}

