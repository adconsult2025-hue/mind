import { allCustomers, allCER, saveCER, uid, progressCERs, saveProgressCERs, saveCustomers } from './storage.js';
import { saveDocFile, statutoTemplate, regolamentoTemplate, attoCostitutivoTemplate, adesioneTemplate, delegaGSETemplate, contrattoTraderTemplate, informativaGDPRTemplate, accordoProduttoreProsumerTemplate } from './docs.js';
import { STATE as CRONO_STATE, initCronoprogrammaUI, renderCronoprogramma } from './cronoprogramma.js?v=36';

const API_BASE = '/api';
const CER_TEMPLATE_MODULES = new Set(['cer', 'contratti']);
const CER_TEMPLATE_ACTIVE_STATUSES = new Set([
  'active',
  'enabled',
  'published',
  'attivo',
  'attiva',
  'abilitato',
  'abilitata',
  'pubblicato',
  'pubblicata',
]);
const CER_TEMPLATE_INACTIVE_STATUSES = new Set([
  'inactive',
  'disabled',
  'draft',
  'archived',
  'deleted',
  'archiviato',
  'archiviata',
  'bozza',
  'inattivo',
  'inattiva',
  'non attivo',
  'non attiva',
  'disattivo',
  'disattivato',
  'disattivata',
  'disabilitato',
  'disabilitata',
  'hidden',
]);
const TRUE_LIKE_VALUES = new Set([
  'true',
  '1',
  'yes',
  'y',
  'si',
  'sì',
  's',
  'on',
  'enabled',
  'attivo',
  'attiva',
  'abilitato',
  'abilitata',
]);
const FALSE_LIKE_VALUES = new Set([
  'false',
  '0',
  'no',
  'n',
  'off',
  'disabled',
  'inactive',
  'inattivo',
  'inattiva',
  'disattivo',
  'disattivato',
  'disattivata',
  'non attivo',
  'non attiva',
]);

function isProducerRole(role) {
  const value = String(role || '').toLowerCase();
  return value === 'prosumer' || value === 'produttore' || value === 'producer';
}

const MEMBER_CONTRACT_STATUSES = [
  { value: 'da-generare', label: 'Da generare' },
  { value: 'in-invio', label: 'In invio/firma' },
  { value: 'firmato', label: 'Firmato' },
  { value: 'annullato', label: 'Annullato' }
];

const DEFAULT_MEMBER_CONTRACT_STATUS = MEMBER_CONTRACT_STATUSES[0].value;

let form;
let membersBox;
let listEl;
let searchEl;
let templateSelect;
let plantFormList;
let plantEmptyState;
let addPlantBtn;
let validationAlert;
let formSubmitBtn;

let detailCard;
let detailTitle;
let detailMeta;
let detailMembersTable;
let detailMembersEmpty;
let detailPlantsTable;
let detailPlantsEmpty;
let detailAddMemberBtn;
let detailAddPlantBtn;
let detailEditBtn;
let detailCloseBtn;

let memberModal;
let memberModalList;
let memberModalFeedback;
let memberModalSaveBtn;

let plantModal;
let plantModalForm;
let plantModalName;
let plantModalOwner;
let plantModalKwp;
let plantModalFeedback;

let docsCerSelect;
let docsActions;
let docsProgress;
let customStatutoTemplateName = null;
let cerDocsTable;
let cerDocsEmpty;

let cronSelect;
let cronContainer;
let cronFeedback;
let cronExportBtn;
let cronPrintBtn;

let allocationsShortcutBtn;
let openPlantsShortcutBtn;

let tabButtons = [];
let tabPanels = [];

let customers = [];
let cers = [];
let cerTemplates = [];
const cerDocsStore = new Map();
const customTemplateNames = new Map();

const DOC_TEMPLATE_UPLOADS = [
  { key: 'statuto', label: 'Modello Statuto (HTML)', displayName: 'lo Statuto' },
  { key: 'regolamento', label: 'Modello Regolamento (HTML)', displayName: 'il Regolamento' },
  { key: 'atto_costitutivo', label: 'Modello Atto costitutivo (HTML)', displayName: "l'Atto costitutivo" },
  { key: 'adesione', label: 'Modello Adesione membro (HTML)', displayName: "l'Adesione membro", help: 'Il modello usa i segnaposto {{MEMBER_*}} per compilare automaticamente i dati del membro selezionato.' },
  { key: 'delega_gse', label: 'Modello Delega GSE (HTML)', displayName: 'la Delega GSE' },
  { key: 'contratto_trader', label: 'Modello Contratto Trader (HTML)', displayName: 'il Contratto Trader' },
  { key: 'informativa_gdpr', label: 'Modello Informativa GDPR (HTML)', displayName: "l'Informativa GDPR", help: 'Il modello può utilizzare i segnaposto {{SUBJECT_*}} per i dati del soggetto titolare.' },
  { key: 'accordo_produttore_prosumer', label: 'Modello Accordo Produttore/Prosumer (HTML)', displayName: "l'Accordo Produttore/Prosumer", help: 'Disponibile solo per membri con ruolo Produttore o Prosumer. Usa i segnaposto {{MEMBER_*}}.' },
];

function sanitizePod(value) {
  if (!value) return null;
  const cleaned = String(value).toUpperCase().replace(/\s+/g, '');
  if (!/^IT[A-Z0-9]{12,16}$/.test(cleaned)) return null;
  return cleaned;
}

function mergeCustomerData(base, update) {
  const result = { ...base };
  Object.entries(update || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (key === 'pod') {
      const sanitized = sanitizePod(value);
      if (sanitized) result.pod = sanitized;
      return;
    }
    result[key] = value;
  });
  return result;
}

function normalizeApiCustomer(data) {
  if (!data) return null;
  const id = String(data.id || data.client_id || '').trim();
  const podCandidates = [];
  if (Array.isArray(data.pods)) podCandidates.push(...data.pods);
  if (data.pod) podCandidates.unshift(data.pod);
  let pod = null;
  for (const candidate of podCandidates) {
    const sanitized = sanitizePod(candidate);
    if (sanitized) {
      pod = sanitized;
      break;
    }
  }
  if (!pod && !id) return null;
  return {
    id: id || pod || uid('cust'),
    nome: data.nome || data.name || 'Cliente',
    tipo: data.tipo || data.subject_type || 'Privato',
    pod,
    comune: data.comune || data.city || '',
    cabina: data.cabina || data.cabina_primaria || data.cp || '',
    email: data.email || data.mail || '',
    tel: data.tel || data.phone || data.telefono || '',
    ruolo: data.ruolo || data.role || 'Consumer'
  };
}

function mergeCustomerLists(existing, incoming) {
  if (!Array.isArray(incoming) || !incoming.length) return existing;
  const map = new Map();
  const podIndex = new Map();
  existing.forEach((customer) => {
    const id = String(customer.id || '');
    if (!id) return;
    const copy = { ...customer };
    map.set(id, copy);
    if (copy.pod) podIndex.set(copy.pod, id);
  });

  incoming.forEach((customer) => {
    const targetId = String(customer.id || '');
    if (targetId && map.has(targetId)) {
      const merged = mergeCustomerData(map.get(targetId), customer);
      map.set(targetId, merged);
      if (merged.pod) podIndex.set(merged.pod, targetId);
      return;
    }
    if (customer.pod && podIndex.has(customer.pod)) {
      const existingId = podIndex.get(customer.pod);
      const merged = mergeCustomerData(map.get(existingId), customer);
      map.set(existingId, merged);
      return;
    }
    const finalId = targetId || customer.pod || uid('cust');
    if (!map.has(finalId)) {
      const record = { ...customer, id: finalId };
      map.set(finalId, record);
      if (record.pod) podIndex.set(record.pod, finalId);
    }
  });

  const result = Array.from(map.values());
  incoming.forEach((customer) => {
    if (!customer.id && customer.pod && !podIndex.has(customer.pod)) {
      result.push({ ...customer, id: customer.pod });
    }
  });
  return result;
}

async function syncCustomersFromApi() {
  try {
    const res = await fetch(`${API_BASE}/clients`);
    if (!res.ok) return;
    const payload = await res.json();
    if (!payload?.ok || !Array.isArray(payload.data)) return;
    const normalized = payload.data.map(normalizeApiCustomer).filter(Boolean);
    if (!normalized.length) return;
    const merged = mergeCustomerLists(allCustomers(), normalized);
    customers = merged;
    saveCustomers(customers);
    renderMembersPicker();
    updatePlantOwnerOptions();
    updateCerValidationUI();
  } catch (err) {
    console.warn('Impossibile sincronizzare i clienti dal CRM remoto', err);
  }
}

const plantState = {
  period: currentPeriod(),
  plants: [],
  rawPlants: [],
  allocations: new Map(), // plantId -> Map(period -> allocation)
  selectedCerId: '',
  lastResults: null,
  modalPlantId: null,
  weightsView: 'consumers'
};

const modalEls = {
  root: null,
  tipologia: null,
  pctCer: null,
  pctContra: null,
  slider: null,
  error: null,
  preview: null,
  weights: null,
  weightsTabs: null,
  title: null,
  subtitle: null,
  energy: null,
  saveBtn: null,
  recalcBtn: null,
  closeBtns: []
};

document.addEventListener('DOMContentLoaded', init);

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-open-cer]');
  if (!btn) return;
  event.preventDefault();
  const id = btn.getAttribute('data-open-cer');
  if (!id) return;
  showCerCard(id, { scroll: true });
});

window.addEventListener('cronoprogramma:doc-added', (event) => {
  handleCerDocEvent(event.detail);
});

window.addEventListener('cronoprogramma:doc-updated', (event) => {
  handleCerDocEvent(event.detail);
});

window.addEventListener('storage', (event) => {
  if (event.key === 'customers') {
    customers = allCustomers();
    renderMembersPicker();
    updatePlantOwnerOptions();
    updateCerValidationUI();
  }
});

function init() {
  form = document.getElementById('form-cer');
  membersBox = document.getElementById('members-picker');
  listEl = document.getElementById('cer-list');
  searchEl = document.getElementById('search-cer');
  templateSelect = document.getElementById('cer-template-select');
  plantFormList = document.getElementById('cer-plants-list');
  plantEmptyState = document.getElementById('cer-plants-empty');
  addPlantBtn = document.getElementById('btn-add-cer-plant');
  validationAlert = document.getElementById('cer-validation-alert');
  detailCard = document.getElementById('cer-detail-card');
  detailTitle = document.getElementById('cer-detail-title');
  detailMeta = document.getElementById('cer-detail-meta');
  detailMembersTable = document.querySelector('#cer-detail-members tbody');
  detailMembersEmpty = document.getElementById('cer-detail-members-empty');
  detailPlantsTable = document.querySelector('#cer-detail-plants tbody');
  detailPlantsEmpty = document.getElementById('cer-detail-plants-empty');
  detailAddMemberBtn = document.getElementById('cer-detail-add-member');
  detailAddPlantBtn = document.getElementById('cer-detail-add-plant');
  detailEditBtn = document.getElementById('cer-detail-edit');
  detailCloseBtn = document.getElementById('cer-detail-close');
  memberModal = document.getElementById('cer-member-modal');
  memberModalList = document.getElementById('cer-member-modal-list');
  memberModalFeedback = document.getElementById('cer-member-modal-feedback');
  memberModalSaveBtn = document.getElementById('cer-member-modal-save');
  plantModal = document.getElementById('cer-plant-modal');
  plantModalForm = document.getElementById('cer-plant-modal-form');
  plantModalName = document.getElementById('cer-plant-modal-name');
  plantModalOwner = document.getElementById('cer-plant-modal-owner');
  plantModalKwp = document.getElementById('cer-plant-modal-kwp');
  plantModalFeedback = document.getElementById('cer-plant-modal-feedback');

  customers = allCustomers();
  cers = allCER();

  if (form) {
    formSubmitBtn = form.querySelector('button[type="submit"]');
    bindCerForm();
    setupPlantForm();
    renderMembersPicker();
    renderCERList();
    if (searchEl) searchEl.oninput = renderCERList;
  }

  detailAddMemberBtn?.addEventListener('click', () => openMemberModal(detailCard?.dataset.cerId || ''));
  detailAddPlantBtn?.addEventListener('click', () => openCerPlantModal(detailCard?.dataset.cerId || ''));
  detailEditBtn?.addEventListener('click', () => {
    if (!detailCard?.dataset.cerId) return;
    loadCerDetail(detailCard.dataset.cerId);
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  detailCloseBtn?.addEventListener('click', hideCerCard);
  detailMembersTable?.addEventListener('change', onDetailMembersChange);
  detailMembersTable?.addEventListener('click', onDetailMembersClick);
  detailPlantsTable?.addEventListener('click', onDetailPlantsClick);

  memberModal?.querySelectorAll('[data-close-modal]')?.forEach(btn => {
    btn.addEventListener('click', closeMemberModal);
  });
  memberModalSaveBtn?.addEventListener('click', submitMemberModal);

  plantModal?.querySelectorAll('[data-close-modal]')?.forEach(btn => {
    btn.addEventListener('click', closeCerPlantModal);
  });
  plantModalForm?.addEventListener('submit', submitCerPlantModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMemberModal();
      closeCerPlantModal();
    }
  });

  window.addEventListener('cer:notify', (event) => {
    const message = event?.detail;
    if (message) toast(message);
  });

  initTabs();
  initPlantsModule();
  initDocumentsModule();
  initCronoprogrammaModule();
  initAllocationsShortcuts();
  loadCerTemplates();
  syncCustomersFromApi();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadCerTemplates();
  });

  const params = new URLSearchParams(window.location.search);
  const cerId = params.get('cer_id');
  if (cerId) {
    loadCerDetail(cerId);
  }
}

async function loadCerTemplates() {
  if (!templateSelect) return;
  const endpoints = ['/api2/templates'];
  if (!endpoints.includes(`${API_BASE}/templates`)) {
    endpoints.push(`${API_BASE}/templates`);
  }

  let loaded = [];
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      loaded = await requestCerTemplates(endpoint);
      cerTemplates = loaded;
      if (loaded.length > 0 || endpoint === endpoints[endpoints.length - 1]) {
        break;
      }
    } catch (err) {
      errors.push({ endpoint, error: err });
      console.error('loadCerTemplates error', endpoint, err);
    }
  }

  if (!loaded.length && errors.length === endpoints.length) {
    cerTemplates = [];
  }
  populateCerTemplateSelect();
}

async function requestCerTemplates(endpoint) {
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  const rawText = await response.text();

  let payload = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (parseErr) {
      const error = new Error(`Risposta non valida dal server (${endpoint})`);
      error.cause = parseErr;
      error.endpoint = endpoint;
      error.rawBody = rawText;
      throw error;
    }
  }

  if (!response.ok || payload?.ok === false) {
    const message =
      payload?.error?.message
      || payload?.message
      || payload?.error
      || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.endpoint = endpoint;
    error.payload = payload;
    throw error;
  }

  return filterCerTemplates(extractTemplatesList(payload));
}

function populateCerTemplateSelect() {
  if (!templateSelect) return;
  const current = templateSelect.value;
  templateSelect.innerHTML = '<option value="">Nessun modello attivo</option>';
  cerTemplates.forEach((tpl) => {
    const opt = document.createElement('option');
    const optionValue = tpl.slug || tpl.code || tpl.id;
    opt.value = optionValue;
    const moduleLabel = tpl.module ? ` · ${String(tpl.module).toUpperCase()}` : '';
    const versionLabel = tpl.version != null ? ` · v${tpl.version}` : '';
    opt.textContent = `${tpl.code}${versionLabel}${moduleLabel}`;
    if (current && (current === optionValue || matchesTemplateValue(tpl, current))) opt.selected = true;
    templateSelect.appendChild(opt);
  });
}

// -----------------------------
// CER anagrafica
// -----------------------------
function bindCerForm() {
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const cer = Object.fromEntries(fd.entries());
    const editingId = form.dataset.editing || '';
    cer.id = editingId || uid('cer');

    if (cer.template_code) {
      const activeTemplate = cerTemplates.find((tpl) => matchesTemplateValue(tpl, cer.template_code));
      if (activeTemplate) {
        cer.template_slug = activeTemplate.slug || '';
        cer.template_code = activeTemplate.code;
        cer.template_version = activeTemplate.version;
        cer.template_url = activeTemplate.url;
        cer.template_id = activeTemplate.id;
      }
    }

    if (cer.riparto !== 'Personalizzato') {
      if (cer.riparto === 'Produttore85_CER15') {
        cer.rp_prod = 85; cer.rp_pros = 0; cer.rp_cer = 15;
      }
      if (cer.riparto === 'Produttore70_CER30') {
        cer.rp_prod = 70; cer.rp_pros = 0; cer.rp_cer = 30;
      }
    } else {
      cer.rp_prod = Number(cer.rp_prod || 0);
      cer.rp_pros = Number(cer.rp_pros || 0);
      cer.rp_cer = Number(cer.rp_cer || 0);
      const sum = cer.rp_prod + cer.rp_pros + cer.rp_cer;
      if (sum !== 100) {
        alert('La somma dei riparti personalizzati deve essere 100%.');
        return;
      }
    }

    const picks = [...membersBox.querySelectorAll('.member-pick')].map(el => {
      const cb = el.querySelector('input[type=checkbox]');
      const role = el.querySelector('.role').value;
      if (!cb?.checked) return null;
      const id = String(cb.dataset.id || '');
      if (!id) return null;
      const c = customers.find(x => String(x.id) === id);
      if (!c) return null;
      return { id: String(c.id), nome: c.nome, pod: c.pod, comune: c.comune, ruolo: role, cabina: c.cabina || '' };
    }).filter(Boolean);
    if (picks.length < 3) {
      toast('Per creare la CER servono almeno 3 clienti selezionati.');
      return;
    }
    const producers = picks.filter(m => ['prosumer', 'produttore', 'producer'].includes(String(m.ruolo || '').toLowerCase()));
    if (!producers.length) {
      toast('Aggiungi almeno un membro Prosumer o Produttore alla CER.');
      return;
    }
    const missingCabina = picks.filter(m => !String(m.cabina || '').trim()).map(m => m.nome).filter(Boolean);
    if (missingCabina.length) {
      toast('Tutti i membri selezionati devono avere una cabina primaria impostata nel CRM.');
      return;
    }
    const memberCabinas = Array.from(new Set(picks.map(m => String(m.cabina || '').trim())));
    if (memberCabinas.length > 1) {
      toast('I membri selezionati appartengono a cabine primarie diverse. Limita la selezione alla stessa cabina.');
      return;
    }
    const membersCabina = memberCabinas[0] || '';
    const cerCabina = String(cer.cabina || '').trim();
    if (cerCabina && membersCabina && cerCabina !== membersCabina) {
      toast(`La cabina primaria indicata per la CER (${cerCabina}) non coincide con quella dei membri (${membersCabina}).`);
      return;
    }
    if (!cerCabina && membersCabina) {
      cer.cabina = membersCabina;
      const cabinaInput = form.querySelector('input[name="cabina"]');
      if (cabinaInput && !cabinaInput.value) {
        cabinaInput.value = membersCabina;
      }
    }
    const plants = collectFormPlants({ validate: true });
    if (!plants) {
      return;
    }
    if (!plants.length) {
      toast('Configura almeno un impianto prima di salvare la CER.');
      return;
    }
    cer.membri = picks;
    cer.impianti = plants;

    const existing = editingId ? cers.find(item => item.id === editingId) : null;
    if (existing) {
      const existingMemberMap = new Map((existing.membri || []).map(member => [member.id, member]));
      cer.membri = cer.membri.map(member => {
        const previous = existingMemberMap.get(member.id);
        return {
          ...(previous || {}),
          ...member,
          contratto_stato: previous?.contratto_stato || member.contratto_stato || DEFAULT_MEMBER_CONTRACT_STATUS
        };
      });
    } else {
      cer.membri = cer.membri.map(member => ({
        ...member,
        contratto_stato: member.contratto_stato || DEFAULT_MEMBER_CONTRACT_STATUS
      }));
    }

    const merged = existing ? { ...existing, ...cer, id: cer.id } : cer;
    const normalizedCer = normalizeCerData({ ...merged });

    if (existing) {
      cers = cers.map(item => (item.id === normalizedCer.id ? normalizedCer : item));
    } else {
      cers.push(normalizedCer);
    }

    saveCER(cers);
    renderCERList();
    showCerCard(normalizedCer.id, { scroll: !editingId });
    refreshCerOptions();
    if (editingId) {
      populateCerForm(normalizedCer);
    } else {
      form.reset();
      updatePlantEmptyState();
      updateCerValidationUI();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };
}

function selectedMembers() {
  return [...membersBox.querySelectorAll('.member-pick')]
    .map(row => {
      const cb = row.querySelector('input[type=checkbox]');
      if (!cb?.checked) return null;
      const id = String(cb.dataset.id || '');
      if (!id) return null;
      const role = row.querySelector('.role')?.value || 'Consumer';
      const customer = customers.find(x => String(x.id) === id) || {};
      return {
        id,
        nome: customer.nome || 'Membro',
        pod: customer.pod || '',
        comune: customer.comune || '',
        ruolo: role,
        cabina: customer.cabina || ''
      };
    })
    .filter(Boolean);
}

function eligibleOwners() {
  return selectedMembers().filter(m => ['prosumer', 'produttore', 'producer'].includes(String(m.ruolo || '').toLowerCase()));
}

function setupPlantForm() {
  if (!plantFormList) return;
  addPlantBtn?.addEventListener('click', () => {
    addPlantRow();
    updateCerValidationUI();
  });
  form?.addEventListener('reset', () => {
    window.setTimeout(() => {
      plantFormList.innerHTML = '';
      updatePlantEmptyState();
      updateCerValidationUI();
      delete form.dataset.editing;
      CRONO_STATE.currentCerId = '';
    }, 0);
  });
  updatePlantEmptyState();
  updatePlantOwnerOptions();
  updateCerValidationUI();
}

function getPlantRows() {
  if (!plantFormList) return [];
  return [...plantFormList.querySelectorAll('.cer-plant-row')];
}

function addPlantRow(data = {}) {
  if (!plantFormList) return null;
  const row = document.createElement('div');
  row.className = 'card soft cer-plant-row';
  row.dataset.id = data.id || uid('plant');
  row.innerHTML = `
    <div class="grid-2">
      <label>Nome impianto
        <input type="text" class="plant-name" value="${data.nome || ''}" required />
      </label>
      <label>Titolare (Prosumer/Produttore)
        <select class="plant-owner">
          <option value="">Seleziona titolare</option>
        </select>
      </label>
    </div>
    <div class="grid-2">
      <label>Potenza (kWp)
        <input type="number" class="plant-kwp" min="0" step="0.1" value="${data.potenza_kwp || ''}" />
      </label>
      <div class="actions" style="align-items:flex-end;">
        <button type="button" class="btn danger" data-remove-plant>Rimuovi</button>
      </div>
    </div>
  `;
  const ownerSelect = row.querySelector('.plant-owner');
  ownerSelect.value = data.titolareId || '';
  ownerSelect.addEventListener('change', updateCerValidationUI);
  row.querySelector('.plant-name')?.addEventListener('input', updateCerValidationUI);
  row.querySelector('.plant-kwp')?.addEventListener('input', () => {});
  row.querySelector('[data-remove-plant]')?.addEventListener('click', () => {
    row.remove();
    updatePlantEmptyState();
    updatePlantOwnerOptions();
    updateCerValidationUI();
  });
  plantFormList.appendChild(row);
  updatePlantOwnerOptions();
  updatePlantEmptyState();
  return row;
}

function updatePlantOwnerOptions() {
  const owners = eligibleOwners();
  getPlantRows().forEach(row => {
    const select = row.querySelector('.plant-owner');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Seleziona titolare</option>';
    owners.forEach(owner => {
      const opt = document.createElement('option');
      opt.value = owner.id;
      opt.textContent = `${owner.nome} — ${owner.ruolo}`;
      select.appendChild(opt);
    });
    if (current && owners.some(o => o.id === current)) {
      select.value = current;
    } else if (!select.value && owners.length === 1) {
      select.value = owners[0].id;
    }
  });
}

function updatePlantEmptyState() {
  if (!plantEmptyState) return;
  const hasPlants = getPlantRows().length > 0;
  plantEmptyState.style.display = hasPlants ? 'none' : '';
}

function collectFormPlants({ validate = false } = {}) {
  const rows = getPlantRows();
  const members = selectedMembers();
  const owners = eligibleOwners();
  const plants = [];
  for (const row of rows) {
    const nameInput = row.querySelector('.plant-name');
    const ownerSelect = row.querySelector('.plant-owner');
    const kwpInput = row.querySelector('.plant-kwp');
    const name = (nameInput?.value || '').trim();
    const ownerId = ownerSelect?.value || '';
    if (validate) {
      if (!name) {
        nameInput?.focus();
        toast('Inserisci un nome per ogni impianto.');
        return null;
      }
      if (!ownerId || !owners.some(o => o.id === ownerId)) {
        ownerSelect?.focus();
        toast('Ogni impianto deve avere un Prosumer/Produttore assegnato.');
        return null;
      }
    }
    if (!name && !ownerId) continue;
    const ownerMember = members.find(m => m.id === ownerId) || owners.find(o => o.id === ownerId) || null;
    const kwpValue = kwpInput?.value ? Number(kwpInput.value) : null;
    plants.push({
      id: row.dataset.id || uid('plant'),
      nome: name,
      titolareId: ownerId || null,
      titolareNome: ownerMember?.nome || '',
      titolareRuolo: ownerMember?.ruolo || '',
      potenza_kwp: Number.isFinite(kwpValue) ? kwpValue : null
    });
  }
  return plants;
}

function evaluateCerValidation() {
  const members = selectedMembers();
  const producers = members.filter(m => ['prosumer', 'produttore', 'producer'].includes(String(m.ruolo || '').toLowerCase()));
  const plantCount = getPlantRows().length;
  const issues = [];
  if (members.length < 3) issues.push('Seleziona almeno 3 clienti dal CRM.');
  if (producers.length < 1) issues.push('Assegna almeno un Prosumer o Produttore.');
  if (plantCount < 1) issues.push('Aggiungi almeno un impianto alla CER.');
  return {
    valid: issues.length === 0,
    issues,
    counts: { members: members.length, producers: producers.length, plants: plantCount }
  };
}

function updateCerValidationUI() {
  const { valid, issues } = evaluateCerValidation();
  if (validationAlert) {
    if (valid) {
      validationAlert.hidden = true;
      validationAlert.textContent = '';
    } else {
      validationAlert.hidden = false;
      validationAlert.textContent = issues.join(' ');
    }
  }
  if (formSubmitBtn) formSubmitBtn.disabled = !valid;
}

function handleMemberChange() {
  updatePlantOwnerOptions();
  updateCerValidationUI();
}

function renderMembersPicker() {
  if (!membersBox) return;

  const persisted = new Map();
  membersBox.querySelectorAll('.member-pick').forEach(row => {
    const cb = row.querySelector('input[type=checkbox]');
    const roleSel = row.querySelector('.role');
    if (!cb) return;
    const id = String(cb.dataset.id || '');
    if (!id) return;
    persisted.set(id, {
      checked: cb.checked,
      role: roleSel?.value || ''
    });
  });

  membersBox.innerHTML = '';
  if (!customers.length) {
    membersBox.innerHTML = '<p class="note">Non ci sono clienti. Vai al CRM per crearli.</p>';
    handleMemberChange();
    return;
  }

  customers.forEach(c => {
    const customerId = String(c.id ?? '');
    const htmlId = `cb_${customerId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const previous = persisted.get(customerId);
    const defaultRole = previous?.role || c.ruolo || 'Consumer';
    const row = document.createElement('div');
    row.className = 'member-pick';
    row.innerHTML = `
      <input type="checkbox" id="${htmlId}" data-id="${customerId}" />
      <label for="${htmlId}">${escapeHtml(c.nome || 'Cliente')} <small class="badge blue">${escapeHtml(c.pod || '')}</small></label>
      <select class="role">
        <option value="Consumer" ${defaultRole === 'Consumer' ? 'selected' : ''}>Consumer</option>
        <option value="Prosumer" ${defaultRole === 'Prosumer' ? 'selected' : ''}>Prosumer</option>
        <option value="Produttore" ${defaultRole === 'Produttore' ? 'selected' : ''}>Produttore</option>
      </select>
      <span class="badge">${escapeHtml(c.comune || '')} · ${escapeHtml(c.cabina || '')}</span>
    `;
    membersBox.appendChild(row);
    const cb = row.querySelector('input[type=checkbox]');
    const roleSel = row.querySelector('.role');
    if (cb && previous?.checked) {
      cb.checked = true;
    }
    if (roleSel) {
      roleSel.value = defaultRole;
    }
    cb?.addEventListener('change', handleMemberChange);
    roleSel?.addEventListener('change', () => {
      c.ruolo = roleSel.value;
      handleMemberChange();
    });
  });
  handleMemberChange();
}

function renderCERList() {
  if (!listEl) return;
  const q = (searchEl?.value || '').toLowerCase().trim();
  listEl.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'row header';
  header.innerHTML = '<div>Denominazione</div><div>Cabina</div><div>Comune</div><div>Riparto</div><div>Quota</div><div>Azioni</div>';
  listEl.appendChild(header);

  cers
    .filter(c => !q || [c.nome, c.cabina, c.comune].some(x => (x || '').toLowerCase().includes(q)))
    .forEach(cer => {
      const r = document.createElement('div');
      r.className = 'row';
      const rip = cer.riparto === 'Personalizzato'
        ? `P${cer.rp_prod}/S${cer.rp_pros}/CER${cer.rp_cer}`
        : cer.riparto;
      const impCount = cer.impianti ? cer.impianti.length : 0;
      const impBadge = `<span class="badge ${impCount ? 'green' : ''}">${impCount} impianto${impCount === 1 ? '' : 'i'}</span>`;
      const templateBadge = cer.template_code
        ? `<span class="badge badge-accent">Modello ${cer.template_code}${cer.template_version ? ` · v${cer.template_version}` : ''}</span>`
        : '<span class="badge muted">Modello non assegnato</span>';
      r.innerHTML = `
        <div><strong>${cer.nome}</strong><br/><small>${cer.cf || ''}</small><br/>${templateBadge}</div>
        <div>${cer.cabina}</div>
        <div>${cer.comune}</div>
        <div>${rip}<br/>${impBadge}</div>
        <div>${cer.quota}%</div>
        <div class="actions">
          <button class="btn ghost" data-open-cer="${cer.id}">Scheda</button>
          <button class="btn ghost" data-docs="${cer.id}">Documenti</button>
          <button class="btn danger" data-del="${cer.id}">Elimina</button>
        </div>
      `;
      r.querySelector('[data-del]').onclick = () => {
        if (!confirm('Eliminare la CER?')) return;
        cers = cers.filter(x => x.id !== cer.id);
        saveCER(cers);
        renderCERList();
        refreshCerOptions();
      };
      r.querySelector('[data-docs]').onclick = () => focusDocumentsTab(cer.id);
      listEl.appendChild(r);
    });
}

function showCerCard(cerId, { scroll = false, skipHistory = false } = {}) {
  if (!cerId || !detailCard) return null;
  const cer = cers.find(item => item.id === cerId);
  if (!cer) {
    toast('CER non trovata nella memoria locale.');
    return null;
  }
  renderCerDetailCard(cer, { scroll, skipHistory });
  return cer;
}

function hideCerCard() {
  if (!detailCard) return;
  detailCard.setAttribute('hidden', 'hidden');
  delete detailCard.dataset.cerId;
  updateCerUrlParam();
}

function renderCerDetailCard(cer, { scroll = false, skipHistory = false } = {}) {
  if (!detailCard || !cer) return;
  const normalized = normalizeCerData({ ...cer });
  detailCard.dataset.cerId = normalized.id;
  if (detailTitle) detailTitle.textContent = normalized.nome || 'CER';
  if (detailMeta) {
    const parts = [];
    if (normalized.cabina) parts.push(`Cabina ${normalized.cabina}`);
    if (normalized.comune) parts.push(`Comune ${normalized.comune}`);
    if (normalized.quota != null) parts.push(`Quota condivisa ${normalized.quota}%`);
    if (normalized.template_code) {
      const tpl = normalized.template_version ? `${normalized.template_code} · v${normalized.template_version}` : normalized.template_code;
      parts.push(`Modello ${tpl}`);
    }
    detailMeta.textContent = parts.length ? parts.join(' · ') : 'Configura la CER per abilitare le funzioni avanzate.';
  }
  renderCerMembersDetail(normalized);
  renderCerPlantsDetail(normalized);
  detailCard.removeAttribute('hidden');
  if (!skipHistory) updateCerUrlParam(normalized.id);
  if (scroll) {
    detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateCerUrlParam(cerId = '') {
  try {
    const url = new URL(window.location.href);
    if (cerId) {
      url.searchParams.set('cer_id', cerId);
    } else {
      url.searchParams.delete('cer_id');
    }
    history.replaceState(null, '', url);
  } catch (err) {
    console.warn('Impossibile aggiornare la URL della scheda CER', err);
  }
}

function renderCerMembersDetail(cer) {
  if (!detailMembersTable) return;
  const members = Array.isArray(cer.membri) ? cer.membri : [];
  detailMembersTable.innerHTML = '';
  if (detailMembersEmpty) detailMembersEmpty.hidden = members.length > 0;
  if (!members.length) return;
  members.forEach(member => {
    const contractOptions = MEMBER_CONTRACT_STATUSES.map(opt => `
      <option value="${opt.value}" ${opt.value === (member.contratto_stato || DEFAULT_MEMBER_CONTRACT_STATUS) ? 'selected' : ''}>${opt.label}</option>
    `).join('');
    const roleOptions = ['Consumer', 'Prosumer', 'Produttore'].map(role => `
      <option value="${role}" ${role === (member.ruolo || 'Consumer') ? 'selected' : ''}>${role}</option>
    `).join('');
    const tr = document.createElement('tr');
    tr.dataset.memberId = member.id;
    tr.innerHTML = `
      <td><strong>${escapeHtml(member.nome || 'Membro')}</strong><br/><small>${escapeHtml(member.pod || '')}</small></td>
      <td><select class="input" data-member-role="${escapeHtml(member.id)}">${roleOptions}</select></td>
      <td><select class="input" data-member-contract="${escapeHtml(member.id)}">${contractOptions}</select></td>
      <td class="actions">
        <button class="btn ghost" type="button" data-remove-member="${escapeHtml(member.id)}">Rimuovi</button>
      </td>
    `;
    detailMembersTable.appendChild(tr);
  });
}

function renderCerPlantsDetail(cer) {
  if (!detailPlantsTable) return;
  const plants = Array.isArray(cer.impianti) ? cer.impianti : [];
  detailPlantsTable.innerHTML = '';
  if (detailPlantsEmpty) detailPlantsEmpty.hidden = plants.length > 0;
  if (!plants.length) return;
  const cerId = cer.id;
  plants.forEach(plant => {
    const ownerName = plant.titolareNome || (cer.membri || []).find(m => m.id === plant.titolareId)?.nome || '';
    const ownerRole = plant.titolareRuolo || (cer.membri || []).find(m => m.id === plant.titolareId)?.ruolo || '';
    const ownerLabel = ownerName ? `${ownerName}${ownerRole ? ` · ${ownerRole}` : ''}` : '-';
    const kwp = plant.potenza_kwp != null ? `${Number(plant.potenza_kwp).toFixed(2)} kWp` : '-';
    const link = `/modules/impianti/index.html?plant_id=${encodeURIComponent(plant.id)}&cer_id=${encodeURIComponent(cerId)}&tab=cronoprogramma`;
    const tr = document.createElement('tr');
    tr.dataset.plantId = plant.id;
    tr.innerHTML = `
      <td><strong>${escapeHtml(plant.nome || 'Impianto')}</strong></td>
      <td>${escapeHtml(ownerLabel)}</td>
      <td>${escapeHtml(kwp)}</td>
      <td class="actions">
        <a class="btn ghost" href="${link}" target="_blank" rel="noopener">Apri scheda impianto</a>
        <button class="btn ghost" type="button" data-remove-plant="${escapeHtml(plant.id)}">Rimuovi</button>
      </td>
    `;
    detailPlantsTable.appendChild(tr);
  });
}

function onDetailMembersChange(event) {
  const target = event.target;
  if (!detailCard?.dataset.cerId) return;
  const cerId = detailCard.dataset.cerId;
  if (target.matches('select[data-member-role]')) {
    const memberId = target.getAttribute('data-member-role');
    const newRole = target.value;
    handleMemberRoleChange(cerId, memberId, newRole, target);
  }
  if (target.matches('select[data-member-contract]')) {
    const memberId = target.getAttribute('data-member-contract');
    const newStatus = target.value;
    handleMemberContractChange(cerId, memberId, newStatus, target);
  }
}

function onDetailMembersClick(event) {
  const btn = event.target.closest('[data-remove-member]');
  if (!btn || !detailCard?.dataset.cerId) return;
  event.preventDefault();
  const memberId = btn.getAttribute('data-remove-member');
  if (!memberId) return;
  handleRemoveMember(detailCard.dataset.cerId, memberId);
}

function onDetailPlantsClick(event) {
  const btn = event.target.closest('[data-remove-plant]');
  if (!btn || !detailCard?.dataset.cerId) return;
  event.preventDefault();
  const plantId = btn.getAttribute('data-remove-plant');
  if (!plantId) return;
  if (!confirm('Rimuovere l\'impianto dalla CER?')) return;
  updateCerRecord(detailCard.dataset.cerId, (draft) => {
    const remaining = (draft.impianti || []).filter(p => p.id !== plantId);
    if (!remaining.length) {
      toast('Una CER deve avere almeno un impianto associato.');
      return false;
    }
    draft.impianti = remaining;
    return true;
  });
}

function handleMemberRoleChange(cerId, memberId, newRole, selectEl) {
  if (!cerId || !memberId) return;
  const updated = updateCerRecord(cerId, (draft) => {
    const member = draft.membri.find(m => m.id === memberId);
    if (!member) return false;
    const previousRole = member.ruolo;
    if (previousRole === newRole) return false;
    if (!isProducerRole(newRole)) {
      const ownsPlant = (draft.impianti || []).some(p => p.titolareId === memberId);
      if (ownsPlant) {
        toast('Impossibile impostare Consumer: il membro è titolare di un impianto.');
        return false;
      }
    }
    member.ruolo = newRole;
    if (!draft.membri.some(m => isProducerRole(m.ruolo))) {
      member.ruolo = previousRole;
      toast('La CER deve avere almeno un Prosumer o Produttore.');
      return false;
    }
    (draft.impianti || []).forEach(plant => {
      if (plant.titolareId === memberId) {
        plant.titolareRuolo = newRole;
      }
    });
    return true;
  });
  if (!updated && selectEl) {
    // ripristina il valore precedente
    const cer = cers.find(c => c.id === cerId);
    const member = cer?.membri?.find(m => m.id === memberId);
    if (member) selectEl.value = member.ruolo || 'Consumer';
  }
}

function handleMemberContractChange(cerId, memberId, newStatus, selectEl) {
  if (!cerId || !memberId) return;
  const updated = updateCerRecord(cerId, (draft) => {
    const member = draft.membri.find(m => m.id === memberId);
    if (!member) return false;
    member.contratto_stato = newStatus || DEFAULT_MEMBER_CONTRACT_STATUS;
    return true;
  });
  if (!updated && selectEl) {
    const cer = cers.find(c => c.id === cerId);
    const member = cer?.membri?.find(m => m.id === memberId);
    if (member) selectEl.value = member.contratto_stato || DEFAULT_MEMBER_CONTRACT_STATUS;
  }
}

function handleRemoveMember(cerId, memberId) {
  updateCerRecord(cerId, (draft) => {
    const members = Array.isArray(draft.membri) ? draft.membri : [];
    if (members.length <= 3) {
      toast('La CER deve mantenere almeno 3 partecipanti.');
      return false;
    }
    const member = members.find(m => m.id === memberId);
    if (!member) return false;
    if ((draft.impianti || []).some(p => p.titolareId === memberId)) {
      toast('Riassegna gli impianti prima di rimuovere il partecipante.');
      return false;
    }
    const remaining = members.filter(m => m.id !== memberId);
    if (!remaining.some(m => isProducerRole(m.ruolo))) {
      toast('La CER deve avere almeno un Prosumer o Produttore.');
      return false;
    }
    draft.membri = remaining;
    return true;
  });
}

function openMemberModal(cerId) {
  if (!memberModal || !memberModalList || !memberModalFeedback) return;
  const cer = cers.find(c => c.id === cerId);
  if (!cer) {
    toast('Seleziona prima una CER.');
    return;
  }
  memberModal.dataset.cerId = cerId;
  const existingIds = new Set((cer.membri || []).map(m => m.id));
  const available = customers.filter(c => !existingIds.has(c.id));
  memberModalList.innerHTML = '';
  memberModalFeedback.textContent = '';
  if (!available.length) {
    memberModalFeedback.textContent = 'Tutti i clienti del CRM sono già membri di questa CER.';
  } else {
    available.forEach(customer => {
      const row = document.createElement('div');
      row.className = 'member-pick';
      row.innerHTML = `
        <input type="checkbox" id="modal_member_${customer.id}" data-modal-member="${customer.id}" />
        <label for="modal_member_${customer.id}">${escapeHtml(customer.nome)} <small class="badge blue">${escapeHtml(customer.pod || '')}</small></label>
        <select class="role" data-modal-role="${customer.id}">
          <option value="Consumer" ${customer.ruolo === 'Consumer' ? 'selected' : ''}>Consumer</option>
          <option value="Prosumer" ${customer.ruolo === 'Prosumer' ? 'selected' : ''}>Prosumer</option>
          <option value="Produttore" ${customer.ruolo === 'Produttore' ? 'selected' : ''}>Produttore</option>
        </select>
        <span class="badge">${escapeHtml(customer.comune || '')} · ${escapeHtml(customer.cabina || '')}</span>
      `;
      memberModalList.appendChild(row);
    });
  }
  memberModal.classList.add('open');
  memberModal.setAttribute('aria-hidden', 'false');
}

function closeMemberModal() {
  if (!memberModal) return;
  memberModal.classList.remove('open');
  memberModal.setAttribute('aria-hidden', 'true');
  delete memberModal.dataset.cerId;
}

function submitMemberModal() {
  if (!memberModal || !memberModalList || !memberModalFeedback) return;
  const cerId = memberModal.dataset.cerId;
  if (!cerId) {
    closeMemberModal();
    return;
  }
  const picks = [...memberModalList.querySelectorAll('[data-modal-member]')]
    .filter(input => input.checked)
    .map(input => {
      const id = input.getAttribute('data-modal-member');
      const roleSelect = memberModalList.querySelector(`[data-modal-role="${CSS.escape(id)}"]`);
      return { id, ruolo: roleSelect?.value || 'Consumer' };
    });
  if (!picks.length) {
    memberModalFeedback.textContent = 'Seleziona almeno un partecipante da aggiungere.';
    return;
  }
  const result = updateCerRecord(cerId, (draft) => {
    const members = Array.isArray(draft.membri) ? draft.membri : [];
    const map = new Map(members.map(m => [m.id, m]));
    picks.forEach(pick => {
      if (!map.has(pick.id)) {
        const source = customers.find(c => String(c.id) === String(pick.id)) || {};
        map.set(pick.id, {
          id: pick.id,
          nome: source.nome || 'Cliente',
          pod: source.pod || '',
          comune: source.comune || '',
          ruolo: pick.ruolo,
          cabina: source.cabina || '',
          contratto_stato: DEFAULT_MEMBER_CONTRACT_STATUS
        });
      }
    });
    draft.membri = Array.from(map.values());
    if (!draft.membri.some(m => isProducerRole(m.ruolo))) {
      memberModalFeedback.textContent = 'Aggiungi almeno un Prosumer o Produttore tra i selezionati.';
      return false;
    }
    return true;
  });
  if (result) {
    toast('Partecipanti aggiunti alla CER.');
    closeMemberModal();
  }
}

function openCerPlantModal(cerId) {
  if (!plantModal || !plantModalName || !plantModalOwner || !plantModalFeedback) return;
  const cer = cers.find(c => c.id === cerId);
  if (!cer) {
    toast('Seleziona prima una CER.');
    return;
  }
  const owners = (cer.membri || []).filter(m => isProducerRole(m.ruolo));
  plantModal.dataset.cerId = cerId;
  plantModalName.value = '';
  plantModalKwp.value = '';
  plantModalOwner.innerHTML = '<option value="">Seleziona titolare</option>';
  owners.forEach(owner => {
    const opt = document.createElement('option');
    opt.value = owner.id;
    opt.textContent = `${owner.nome} · ${owner.ruolo}`;
    plantModalOwner.appendChild(opt);
  });
  if (!owners.length) {
    plantModalFeedback.textContent = 'Aggiungi prima un Prosumer o Produttore per associare un impianto.';
  } else {
    plantModalFeedback.textContent = '';
  }
  plantModal.classList.add('open');
  plantModal.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => plantModalName?.focus(), 0);
}

function closeCerPlantModal() {
  if (!plantModal) return;
  plantModal.classList.remove('open');
  plantModal.setAttribute('aria-hidden', 'true');
  delete plantModal.dataset.cerId;
}

function submitCerPlantModal(event) {
  event.preventDefault();
  if (!plantModal || !plantModalName || !plantModalOwner || !plantModalFeedback) return;
  const cerId = plantModal.dataset.cerId;
  if (!cerId) {
    closeCerPlantModal();
    return;
  }
  const name = plantModalName?.value?.trim() || '';
  const ownerId = plantModalOwner?.value || '';
  const kwpRaw = plantModalKwp?.value || '';
  const kwpValue = kwpRaw ? Number(kwpRaw) : null;
  if (!name) {
    plantModalFeedback.textContent = 'Inserisci il nome dell\'impianto.';
    plantModalName?.focus();
    return;
  }
  if (!ownerId) {
    plantModalFeedback.textContent = 'Seleziona un titolare Prosumer/Produttore.';
    plantModalOwner?.focus();
    return;
  }
  const updated = updateCerRecord(cerId, (draft) => {
    const owner = (draft.membri || []).find(m => m.id === ownerId);
    if (!owner || !isProducerRole(owner.ruolo)) {
      plantModalFeedback.textContent = 'Il titolare selezionato non è abilitato come Prosumer/Produttore.';
      return false;
    }
    const plant = {
      id: uid('plant'),
      nome: name,
      titolareId: owner.id,
      titolareNome: owner.nome,
      titolareRuolo: owner.ruolo,
      potenza_kwp: Number.isFinite(kwpValue) ? kwpValue : null
    };
    draft.impianti = [...(draft.impianti || []), plant];
    return true;
  });
  if (updated) {
    toast('Impianto aggiunto alla CER.');
    closeCerPlantModal();
  }
}

function updateCerRecord(cerId, updater) {
  if (!cerId || typeof updater !== 'function') return null;
  const index = cers.findIndex(c => c.id === cerId);
  if (index === -1) {
    toast('CER non trovata.');
    return null;
  }
  const current = cers[index];
  const draft = {
    ...current,
    membri: (current.membri || []).map(member => ({ ...member })),
    impianti: (current.impianti || []).map(plant => ({ ...plant }))
  };
  const proceed = updater(draft);
  if (proceed === false) {
    return null;
  }
  const normalized = normalizeCerData(draft);
  cers[index] = normalized;
  saveCER(cers);
  renderCERList();
  renderCerDetailCard(normalized, { skipHistory: true });
  if (form?.dataset.editing === normalized.id) {
    populateCerForm(normalized);
  }
  refreshCerOptions();
  return normalized;
}

function normalizeCerData(cer) {
  if (!cer) return cer;
  const members = Array.isArray(cer.membri)
    ? cer.membri.map(member => ({
      ...member,
      contratto_stato: member.contratto_stato || DEFAULT_MEMBER_CONTRACT_STATUS
    }))
    : [];
  const memberMap = new Map(members.map(m => [m.id, m]));
  const plants = Array.isArray(cer.impianti)
    ? cer.impianti.map(plant => {
      const owner = plant.titolareId ? memberMap.get(plant.titolareId) : null;
      const kwp = plant.potenza_kwp != null && Number.isFinite(Number(plant.potenza_kwp))
        ? Number(plant.potenza_kwp)
        : null;
      return {
        id: plant.id || uid('plant'),
        nome: plant.nome || 'Impianto',
        titolareId: owner?.id || plant.titolareId || '',
        titolareNome: owner?.nome || plant.titolareNome || '',
        titolareRuolo: owner?.ruolo || plant.titolareRuolo || '',
        potenza_kwp: kwp
      };
    })
    : [];
  cer.membri = members;
  cer.impianti = plants;
  return cer;
}

function populateCerForm(target) {
  if (!form || !target) return;
  const normalized = normalizeCerData({ ...target });
  form.dataset.editing = normalized.id;
  const fields = ['nome', 'cabina', 'comune', 'cf', 'quota', 'riparto', 'trader', 'note', 'template_code', 'rp_prod', 'rp_pros', 'rp_cer'];
  fields.forEach((name) => {
    const el = form.elements.namedItem(name);
    if (!el) return;
    if (name === 'template_code') {
      const templateValue = normalized.template_slug || normalized.template_code || '';
      el.value = templateValue;
      return;
    }
    const value = normalized[name] ?? '';
    if (name === 'quota' && !value) {
      el.value = 60;
      return;
    }
    if (name.startsWith('rp_') && normalized.riparto !== 'Personalizzato') {
      el.value = el.defaultValue || '';
      return;
    }
    el.value = value;
  });
  const ripartoSelect = form.elements.namedItem('riparto');
  if (ripartoSelect) {
    ripartoSelect.value = normalized.riparto || ripartoSelect.value;
  }
  if (normalized.riparto === 'Personalizzato') {
    const rpProd = form.elements.namedItem('rp_prod');
    const rpPros = form.elements.namedItem('rp_pros');
    const rpCer = form.elements.namedItem('rp_cer');
    if (rpProd) rpProd.value = normalized.rp_prod ?? rpProd.value;
    if (rpPros) rpPros.value = normalized.rp_pros ?? rpPros.value;
    if (rpCer) rpCer.value = normalized.rp_cer ?? rpCer.value;
  }
  const memberMap = new Map((normalized.membri || []).map((m) => [m.id, m]));
  membersBox?.querySelectorAll('.member-pick').forEach((row) => {
    const cb = row.querySelector('input[type=checkbox]');
    const roleSel = row.querySelector('.role');
    if (!cb) return;
    const id = cb.dataset.id;
    const member = memberMap.get(id);
    cb.checked = Boolean(member);
    if (member && roleSel) {
      roleSel.value = member.ruolo || roleSel.value;
    }
  });
  handleMemberChange();
  if (plantFormList) {
    plantFormList.innerHTML = '';
    (normalized.impianti || []).forEach((plant) => {
      addPlantRow({
        id: plant.id,
        nome: plant.nome,
        titolareId: plant.titolareId || plant.titolare || plant.titolareID || '',
        potenza_kwp: plant.potenza_kwp
      });
    });
  }
  updatePlantOwnerOptions();
  updateCerValidationUI();
  CRONO_STATE.currentCerId = normalized.id;
  if (docsCerSelect) {
    docsCerSelect.value = normalized.id;
    renderDocumentsForCer(normalized.id);
  }
  if (cerDocsTable) {
    cerDocsTable.dataset.entityId = normalized.id;
  }
  if (cronSelect) {
    cronSelect.value = normalized.id;
    renderCronoprogramma(normalized.id);
  }
  if (plantsCerSelect) {
    plantsCerSelect.value = normalized.id;
    plantState.selectedCerId = normalized.id;
    if (typeof loadPlantsForCer === 'function') {
      loadPlantsForCer(normalized.id);
    }
  }
}

function loadCerDetail(cerId) {
  if (!form) return null;
  const target = cers.find(cer => cer.id === cerId);
  if (!target) {
    toast('CER non trovata nella memoria locale.');
    return null;
  }
  populateCerForm(target);
  showCerCard(target.id, { scroll: false });
  return target;
}

function initDocumentsModule() {
  docsCerSelect = document.getElementById('docs-cer-select');
  docsActions = document.getElementById('docs-actions');
  docsProgress = document.getElementById('docs-progress');
  cerDocsTable = document.getElementById('cer-docs-table');
  cerDocsEmpty = document.getElementById('cer-docs-empty');
  if (!docsCerSelect) return;
  docsCerSelect.addEventListener('change', () => {
    renderDocumentsForCer(docsCerSelect.value);
  });
  updateDocumentsSelect();
}

function updateDocumentsSelect() {
  if (!docsCerSelect) return;
  const previous = docsCerSelect.value;
  docsCerSelect.innerHTML = '';
  if (!cers.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nessuna CER disponibile';
    docsCerSelect.appendChild(opt);
    docsActions.innerHTML = '<p class="info-text">Crea una CER per abilitare la generazione documentale.</p>';
    docsProgress.innerHTML = '';
    return;
  }
  cers.forEach(cer => {
    const opt = document.createElement('option');
    opt.value = cer.id;
    opt.textContent = cer.nome;
    docsCerSelect.appendChild(opt);
  });
  const target = previous && cers.some(c => c.id === previous) ? previous : cers[0].id;
  docsCerSelect.value = target;
  renderDocumentsForCer(target);
}

function renderDocumentsForCer(cerId) {
  if (!docsActions || !docsProgress) return;
  const cer = cers.find(c => c.id === cerId);
  docsActions.innerHTML = '';
  docsProgress.innerHTML = '';
  if (cerDocsTable) {
    cerDocsTable.dataset.entityId = cerId || '';
  }
  if (!cer) {
    docsActions.innerHTML = '<p class="info-text">Seleziona una CER per generare documenti.</p>';
    if (cerDocsTable) cerDocsTable.innerHTML = '';
    if (cerDocsEmpty) cerDocsEmpty.hidden = false;
    return;
  }
  CRONO_STATE.currentCerId = cer.id;
  window.currentCERId = cer.id;
  const membri = cer.membri || [];
  docsActions.innerHTML = `
    <button class="btn" data-doc="statuto">Statuto (.doc)</button>
    <button class="btn" data-doc="regolamento">Regolamento (.doc)</button>
    <button class="btn" data-doc="atto">Atto costitutivo (.doc)</button>
    <select class="slim" id="docs-member-select"></select>
    <button class="btn" data-doc="adesione">Adesione membro (.doc)</button>
    <button class="btn" data-doc="accordo">Accordo Produttore/Prosumer (.doc)</button>
    <button class="btn" data-doc="delega">Delega GSE (.doc)</button>
    <button class="btn" data-doc="trader">Contratto Trader (.doc)</button>
    <button class="btn ghost" data-doc="privacy">Informativa GDPR (.doc)</button>
  `;

  const templatesHost = document.createElement('div');
  templatesHost.id = 'cer-docs-actions';
  templatesHost.dataset.cerId = cer.id;
  templatesHost.className = 'docgen-remote';
  templatesHost.innerHTML = '<p class="info-text">Caricamento modelli…</p>';
  docsActions.prepend(templatesHost);

  fetchCerTemplates().then((templates) => {
    renderCerTemplatesDropdown(templates, templatesHost);
  });
  const memberSelect = docsActions.querySelector('#docs-member-select');
  if (memberSelect) {
    membri.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.nome;
      memberSelect.appendChild(opt);
    });
    if (!membri.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nessun membro';
      memberSelect.appendChild(opt);
      memberSelect.disabled = true;
    }
  }

  const eligibleMembers = membri.filter(isProsumerOrProducer);
  if (memberSelect && eligibleMembers.length) {
    memberSelect.value = eligibleMembers[0].id;
  }

  docsActions.querySelector('[data-doc="statuto"]').onclick = async () => {
    const doc = await statutoTemplate(cer, membri);
    saveDocFile(`Statuto_${cer.nome}.doc`, doc);
  };
  docsActions.querySelector('[data-doc="regolamento"]').onclick = async () => {
    const doc = await regolamentoTemplate(cer, membri);
    saveDocFile(`Regolamento_${cer.nome}.doc`, doc);
  };
  docsActions.querySelector('[data-doc="atto"]').onclick = async () => {
    const doc = await attoCostitutivoTemplate(cer, membri);
    saveDocFile(`AttoCostitutivo_${cer.nome}.doc`, doc);
  };
  docsActions.querySelector('[data-doc="adesione"]').onclick = async () => {
    const id = memberSelect?.value;
    const membro = membri.find(m => m.id === id);
    const doc = await adesioneTemplate(cer, membro);
    saveDocFile(`Adesione_${membro?.nome || 'Membro'}.doc`, doc);
  };
  docsActions.querySelector('[data-doc="delega"]').onclick = () => {
    const doc = delegaGSETemplate(cer, membri);
    saveDocFile(`Delega_GSE_${cer.nome}.doc`, doc);
  };
  const accordoBtn = docsActions.querySelector('[data-doc="accordo"]');
  if (accordoBtn) {
    if (!eligibleMembers.length) {
      accordoBtn.disabled = true;
      accordoBtn.title = 'Disponibile solo quando esiste un membro Prosumer o Produttore.';
    } else {
      accordoBtn.removeAttribute('title');
    }
    accordoBtn.onclick = () => {
      if (!memberSelect || !memberSelect.value) {
        alert('Seleziona un membro Prosumer o Produttore per generare questo accordo.');
        return;
      }
      const membro = membri.find(m => m.id === memberSelect.value);
      if (!isProsumerOrProducer(membro)) {
        alert('Seleziona un membro con ruolo Produttore o Prosumer per generare questo accordo.');
        return;
      }
      const doc = accordoProduttoreProsumerTemplate(cer, membro);
      saveDocFile(`Accordo_${membro?.nome || 'Membro'}.doc`, doc);
    };
  }
  docsActions.querySelector('[data-doc="trader"]').onclick = async () => {
    const doc = await contrattoTraderTemplate(cer, membri);
    saveDocFile(`ContrattoTrader_${cer.nome}.doc`, doc);
  };
  docsActions.querySelector('[data-doc="privacy"]').onclick = async () => {
    const doc = await informativaGDPRTemplate(cer, membri);
    saveDocFile(`Privacy_${cer.nome}.doc`, doc);
  };

  const templateUploaders = buildTemplateUploaders();
  if (templateUploaders) {
    docsActions.appendChild(templateUploaders);
  }

  renderCerProgress(docsProgress, cer);
  renderCerDocs(cer.id);
  loadCerDocs(cer.id);
}

function isProsumerOrProducer(member) {
  if (!member) return false;
  const role = String(member.ruolo || '').toLowerCase();
  return role === 'prosumer' || role === 'produttore' || role === 'producer';
}

function updateTemplateUploadStatus(templateKey, statusEl) {
  if (!statusEl) return;
  const name = customTemplateNames.get(templateKey);
  statusEl.textContent = name ? `Modello personalizzato attivo: ${name}` : 'Modello standard in uso.';
}

function buildTemplateUploader(config, withDivider = true) {
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.FileReader === 'undefined') return null;

  const baseHelp = `Carica un file HTML personalizzato per ${config.displayName}. Verrà usato finché non ricarichi la pagina.`;
  const helpText = config.help ? `${baseHelp} ${config.help}` : baseHelp;

  const wrapper = document.createElement('div');
  wrapper.className = 'doc-template-upload';
  wrapper.innerHTML = `
    ${withDivider ? '<hr class="doc-template-upload__divider"/>' : ''}
    <div class="doc-template-upload__inner">
      <p class="info-text small">${helpText}</p>
      <label class="doc-template-upload__file">
        <span>${config.label}</span>
        <input type="file" accept=".html,.htm,.txt" data-template-upload="${config.key}" />
      </label>
      <div class="doc-template-upload__actions">
        <button type="button" class="btn ghost" data-template-reset="${config.key}">Usa modello standard</button>
      </div>
      <p class="info-text small" data-template-status="${config.key}"></p>
    </div>
  `;

  const input = wrapper.querySelector(`[data-template-upload="${config.key}"]`);
  const resetBtn = wrapper.querySelector(`[data-template-reset="${config.key}"]`);
  const status = wrapper.querySelector(`[data-template-status="${config.key}"]`);
  updateTemplateUploadStatus(config.key, status);

  if (input) {
    input.addEventListener('change', (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        if (!text.trim()) {
          alert('Il file selezionato è vuoto o non contiene testo.');
          return;
        }
        setRuntimeTemplate(config.key, text);
        customTemplateNames.set(config.key, file.name || `${config.key}.html`);
        updateTemplateUploadStatus(config.key, status);
        if (input) input.value = '';
      };
      reader.onerror = () => {
        console.error(`Errore lettura file personalizzato per ${config.displayName}:`, reader.error);
        alert('Impossibile leggere il file selezionato.');
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      setRuntimeTemplate(config.key);
      customTemplateNames.delete(config.key);
      updateTemplateUploadStatus(config.key, status);
      if (input) input.value = '';
    });
  }

  return wrapper;
}

function buildTemplateUploaders() {
  if (!DOC_TEMPLATE_UPLOADS.length) return null;
  const fragment = document.createDocumentFragment();
  DOC_TEMPLATE_UPLOADS.forEach((config, idx) => {
    const uploader = buildTemplateUploader(config, idx === 0);
    if (uploader) fragment.appendChild(uploader);
  });
  return fragment;
}

function cerDocStatusBadge(status = 'uploaded') {
  const normalized = String(status || 'uploaded');
  if (normalized === 'approved') return '<span class="badge green">Approvato</span>';
  if (normalized === 'rejected') return '<span class="badge danger">Respinto</span>';
  return '<span class="badge blue">Caricato</span>';
}

function renderCerDocs(cerId) {
  if (!cerDocsTable) return;
  const cid = String(cerId || '');
  const docs = cerDocsStore.get(cid) || [];
  cerDocsTable.innerHTML = '';
  if (!docs.length) {
    if (cerDocsEmpty) cerDocsEmpty.hidden = false;
    return;
  }
  if (cerDocsEmpty) cerDocsEmpty.hidden = true;
  docs.slice().sort((a, b) => {
    const aPhase = a.phase ?? '';
    const bPhase = b.phase ?? '';
    return String(aPhase).localeCompare(String(bPhase));
  }).forEach((doc) => {
    const phase = doc.phase ?? '-';
    const name = escapeHtml(doc.filename || doc.name || 'Documento');
    const url = doc.url || '#';
    const tr = document.createElement('tr');
    tr.dataset.docId = doc.doc_id;
    tr.innerHTML = `
      <td>${escapeHtml(String(phase))}</td>
      <td>${name}</td>
      <td>${cerDocStatusBadge(doc.status)}</td>
      <td class="nowrap actions">
        <a class="btn ghost" href="${url}" target="_blank" rel="noopener">Apri</a>
        <button class="btn ghost" type="button" data-doc-mark="${doc.doc_id}" data-status="approved" data-entity="cer" data-entity-id="${cid}" data-phase="${escapeHtml(String(phase))}">Approva</button>
        <button class="btn ghost" type="button" data-doc-mark="${doc.doc_id}" data-status="rejected" data-entity="cer" data-entity-id="${cid}" data-phase="${escapeHtml(String(phase))}">Rifiuta</button>
      </td>
    `;
    cerDocsTable.appendChild(tr);
  });
}

async function loadCerDocs(cerId) {
  if (!cerId || !cerDocsTable) return;
  const cid = String(cerId);
  cerDocsTable.innerHTML = '<tr><td colspan="4">Caricamento documenti…</td></tr>';
  try {
    const res = await fetch(`${API_BASE}/docs?entity_type=cer&entity_id=${encodeURIComponent(cid)}`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error?.message || 'Errore caricamento documenti CER');
    }
    const list = Array.isArray(payload.data) ? payload.data.map(doc => ({ ...doc, entity_type: 'cer', entity_id: cid })) : [];
    cerDocsStore.set(cid, list);
    renderCerDocs(cid);
  } catch (err) {
    cerDocsTable.innerHTML = `<tr><td colspan="4" class="error-text">${escapeHtml(err.message || 'Errore caricamento documenti')}</td></tr>`;
  }
}

function upsertCerDoc(doc) {
  if (!doc || String(doc.entity_type || '') !== 'cer') return;
  const cid = String(doc.entity_id || '');
  if (!cid) return;
  const list = cerDocsStore.get(cid) || [];
  const index = list.findIndex(item => item.doc_id === doc.doc_id);
  if (index >= 0) {
    list[index] = { ...list[index], ...doc };
  } else {
    list.push(doc);
  }
  cerDocsStore.set(cid, list);
  if (docsCerSelect && docsCerSelect.value === cid) {
    renderCerDocs(cid);
  }
}

function handleCerDocEvent(detail) {
  if (!detail || String(detail.entity_type || '') !== 'cer') return;
  const normalized = {
    ...detail,
    entity_type: 'cer',
    entity_id: String(detail.entity_id || '')
  };
  upsertCerDoc(normalized);
}

// ===== Templates CER: fetch & render =====
async function fetchCerTemplates() {
  try {
    const r = await fetch('/api2/templates', { headers: { Accept: 'application/json' } });
    const list = await r.json();
    return filterCerTemplates(extractTemplatesList(list));
  } catch (e) {
    console.error('fetchCerTemplates:', e);
    return [];
  }
}

function renderCerTemplatesDropdown(templates, hostEl) {
  const host = hostEl || document.querySelector('#cer-docs-actions');
  if (!host) return;

  const safeTemplates = Array.isArray(templates) ? templates : [];
  if (!safeTemplates.length) {
    host.innerHTML = '<p class="info-text">Nessun modello CER o Contratti disponibile.</p>';
    return;
  }

  host.innerHTML = `
    <div class="docgen">
      <label>Genera documento</label>
      <select id="cer-tpl-select">
        <option value="">— scegli un modello —</option>
        ${safeTemplates.map((t) => `
          <option value="${t.slug || t.code || t.id}">
            ${formatTemplateDisplayName(t)}
          </option>`).join('')}
      </select>
      <button id="cer-tpl-generate">Genera</button>
    </div>
  `;

  const select = host.querySelector('#cer-tpl-select');
  const button = host.querySelector('#cer-tpl-generate');
  if (!select || !button) return;

  button.addEventListener('click', async () => {
    const sel = select.value;
    if (!sel) {
      alert('Seleziona un modello');
      return;
    }

    const tpl = safeTemplates.find((t) => matchesTemplateValue(t, sel));
    const templateSlug = tpl?.slug || tpl?.code || sel;

    const cerId = host.getAttribute('data-cer-id')
      || document.querySelector('[data-cer-id]')?.getAttribute('data-cer-id')
      || window.currentCERId
      || 'cer_test';

    const body = {
      templateSlug,
      refType: 'CER',
      refId: cerId,
      output: (/(accordo|prod|pros)/i.test(templateSlug) ? 'html' : 'docx')
    };

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Generazione…';

    try {
      const res = await fetch('/api2/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      let payload = {};
      try {
        payload = await res.json();
      } catch (parseErr) {
        console.error('generate parse error', parseErr);
      }

      if (!res.ok || payload.ok === false) {
        const message = payload?.error?.message || payload?.message || 'Errore nella generazione del documento';
        console.error('generate error', payload);
        alert(message);
        return;
      }

      const downloadUrl =
        payload?.public_url
        || payload?.url
        || payload?.download_url
        || payload?.downloadUrl
        || payload?.data?.public_url
        || payload?.data?.url;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank', 'noopener');
        return;
      }

      const fileInfo = payload.file || payload.data?.file;
      if (fileInfo?.content) {
        const mime = fileInfo.mime || fileInfo.type || 'application/octet-stream';
        const name = fileInfo.name || `${templateSlug}.${body.output === 'html' ? 'html' : 'docx'}`;
        const link = document.createElement('a');
        link.href = `data:${mime};base64,${fileInfo.content}`;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      if (typeof payload.html === 'string') {
        const popup = window.open('', '_blank');
        if (popup) {
          popup.document.write(payload.html);
          popup.document.close();
        }
        return;
      }

      console.warn('generate: risposta inattesa', payload);
      alert('Documento generato, ma non è stato possibile ottenere il file.');
    } catch (err) {
      console.error('generate exception', err);
      alert(err?.message || 'Errore imprevisto durante la generazione');
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

function extractTemplatesList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.templates)) return payload.templates;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.list)) return payload.list;
  if (payload?.data && Array.isArray(payload.data.templates)) return payload.data.templates;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function filterCerTemplates(templates) {
  return (Array.isArray(templates) ? templates : [])
    .map((tpl) => normalizeCerTemplate(tpl))
    .filter(Boolean);
}

function normalizeCerTemplate(tpl) {
  if (!tpl || typeof tpl !== 'object') return null;

  const moduleValue = tpl.module ? String(tpl.module).trim().toLowerCase() : '';
  const normalizedModule = moduleValue || 'cer';
  if (!isCerTemplateModule(normalizedModule)) {
    return null;
  }

  if (!isTemplateActive(tpl)) {
    return null;
  }

  const normalizedCode = pickFirstNonEmpty([
    tpl.code,
    tpl.slug,
    tpl.id,
    tpl.codice,
    tpl.name,
  ]);

  if (!normalizedCode) {
    return null;
  }

  const normalizedSlug = pickFirstNonEmpty([
    tpl.slug,
    tpl.code,
    tpl.id,
    tpl.codice,
    tpl.name,
  ]);

  return {
    ...tpl,
    code: normalizedCode,
    slug: normalizedSlug,
    module: normalizedModule,
    version: tpl.version ?? tpl.latest_version ?? tpl.latestVersion ?? null,
  };
}

function matchesTemplateValue(template, value) {
  if (!template || value == null) return false;
  const target = String(value).trim();
  if (!target) return false;
  const candidates = [
    template.slug,
    template.code,
    template.id,
    template.codice,
  ];
  return candidates
    .filter((candidate) => candidate != null)
    .map((candidate) => String(candidate).trim())
    .some((candidate) => candidate === target);
}

function pickFirstNonEmpty(candidates) {
  return candidates
    .map((value) => (typeof value === 'string' ? value : (value != null ? String(value) : '')))
    .map((value) => value.trim())
    .find((value) => value.length > 0) || '';
}

function isCerTemplateModule(moduleValue) {
  if (!moduleValue) return true;
  const normalized = String(moduleValue).trim().toLowerCase();
  return CER_TEMPLATE_MODULES.has(normalized);
}

function isTemplateActive(tpl) {
  if (!tpl) return false;
  const activeFlag = normalizeTemplateFlag(tpl.active);
  if (activeFlag === false) return false;

  const enabledFlag = normalizeTemplateFlag(tpl.enabled);
  if (enabledFlag === false) return false;

  const status = normalizeTemplateStatus(tpl.status ?? tpl.stato);
  if (!status) return activeFlag !== false && enabledFlag !== false;

  if (CER_TEMPLATE_INACTIVE_STATUSES.has(status)) {
    return false;
  }

  if (CER_TEMPLATE_ACTIVE_STATUSES.has(status)) {
    return true;
  }

  return activeFlag !== false && enabledFlag !== false;
}

function normalizeTemplateFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null;
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (TRUE_LIKE_VALUES.has(normalized)) return true;
    if (FALSE_LIKE_VALUES.has(normalized)) return false;
  }
  return null;
}

function normalizeTemplateStatus(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value ?? '').trim().toLowerCase();
}

function formatTemplateDisplayName(template) {
  if (!template) return 'Template';
  const name = pickFirstNonEmpty([
    template.name,
    template.codice,
    template.code,
    template.slug,
    template.id,
  ]) || 'Template';
  const version = template.latest_version ?? template.version;
  const moduleLabel = template.module ? String(template.module).toUpperCase() : '';
  const parts = [name];
  if (version != null) parts.push(`v${version}`);
  if (moduleLabel) parts.push(moduleLabel);
  return parts.join(' · ');
}

function focusDocumentsTab(cerId) {
  activateTab('documents');
  if (docsCerSelect) {
    docsCerSelect.value = cerId;
    renderDocumentsForCer(cerId);
  }
}

function initCronoprogrammaModule() {
  cronSelect = document.getElementById('cronoprogramma-cer-select');
  cronContainer = document.getElementById('cronoprogramma-phases');
  cronFeedback = document.getElementById('cronoprogramma-feedback');
  cronExportBtn = document.getElementById('cronoprogramma-export');
  cronPrintBtn = document.getElementById('cronoprogramma-print');

  if (!cronContainer || !cronSelect) return;

  initCronoprogrammaUI({
    container: cronContainer,
    feedback: cronFeedback,
    select: cronSelect,
    exportBtn: cronExportBtn,
    printBtn: cronPrintBtn,
    onNavigateToPlants: () => {
      activateTab('plants');
      document.getElementById('plants-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    onTriggerRecalc: () => {
      activateTab('plants');
      btnRecalcPreview?.click();
    }
  });

  updateCronoprogrammaSelect();
}

function updateCronoprogrammaSelect() {
  if (!cronSelect) return;
  const previous = cronSelect.value;
  cronSelect.innerHTML = '';
  if (!cers.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nessuna CER disponibile';
    cronSelect.appendChild(opt);
    if (cronFeedback) cronFeedback.textContent = 'Crea una CER per iniziare a pianificare il cronoprogramma.';
    if (cronContainer) cronContainer.innerHTML = '';
    return;
  }
  cers.forEach(cer => {
    const opt = document.createElement('option');
    opt.value = cer.id;
    opt.textContent = cer.nome;
    cronSelect.appendChild(opt);
  });
  const target = previous && cers.some(c => c.id === previous) ? previous : cers[0].id;
  cronSelect.value = target;
  renderCronoprogramma(target);
}

function initAllocationsShortcuts() {
  allocationsShortcutBtn = document.getElementById('btn-riparti-recalc');
  openPlantsShortcutBtn = document.getElementById('btn-open-plants');
  openPlantsShortcutBtn?.addEventListener('click', () => {
    activateTab('plants');
    document.getElementById('plants-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  allocationsShortcutBtn?.addEventListener('click', () => {
    activateTab('plants');
    btnRecalcPreview?.click();
  });
}

function focusCronoprogrammaTab(cerId) {
  activateTab('cronoprogramma');
  if (cronSelect) {
    cronSelect.value = cerId;
    renderCronoprogramma(cerId);
  }
}

function renderCerProgress(container, cer) {
  const store = progressCERs();
  const st = store[cer.id] || { p1: { statuto: false, regolamento: false, atto: false }, p2: { adesioni: false, delega: false, trader: false }, p3: { rendicontazione: false, aggiornamenti: false, privacy: false } };
  const wrap = document.createElement('div');
  wrap.className = 'progress';
  wrap.innerHTML = `
    <div class="phase"><h4>Fase 1 — Costituzione</h4>
      <label class="chk"><input type="checkbox" data-k="p1.statuto" ${st.p1.statuto ? 'checked' : ''}/> Statuto approvato</label>
      <label class="chk"><input type="checkbox" data-k="p1.regolamento" ${st.p1.regolamento ? 'checked' : ''}/> Regolamento approvato</label>
      <label class="chk"><input type="checkbox" data-k="p1.atto" ${st.p1.atto ? 'checked' : ''}/> Atto costitutivo firmato</label>
    </div>
    <div class="phase"><h4>Fase 2 — Attivazione</h4>
      <label class="chk"><input type="checkbox" data-k="p2.adesioni" ${st.p2.adesioni ? 'checked' : ''}/> Adesioni membri caricate</label>
      <label class="chk"><input type="checkbox" data-k="p2.delega" ${st.p2.delega ? 'checked' : ''}/> Delega GSE caricata</label>
      <label class="chk"><input type="checkbox" data-k="p2.trader" ${st.p2.trader ? 'checked' : ''}/> Contratto Trader firmato</label>
    </div>
    <div class="phase"><h4>Fase 3 — Operatività</h4>
      <label class="chk"><input type="checkbox" data-k="p3.rendicontazione" ${st.p3.rendicontazione ? 'checked' : ''}/> Rendicontazione attiva</label>
      <label class="chk"><input type="checkbox" data-k="p3.aggiornamenti" ${st.p3.aggiornamenti ? 'checked' : ''}/> Aggiornamenti membri</label>
      <label class="chk"><input type="checkbox" data-k="p3.privacy" ${st.p3.privacy ? 'checked' : ''}/> Privacy & registri</label>
    </div>
  `;
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      const k = cb.dataset.k.split('.');
      const cur = progressCERs();
      const obj = cur[cer.id] || { p1: { statuto: false, regolamento: false, atto: false }, p2: { adesioni: false, delega: false, trader: false }, p3: { rendicontazione: false, aggiornamenti: false, privacy: false } };
      obj[k[0]][k[1]] = cb.checked;
      cur[cer.id] = obj;
      saveProgressCERs(cur);
    };
  });
  container.innerHTML = '';
  container.appendChild(wrap);
}

// -----------------------------
// Tabs
// -----------------------------
function initTabs() {
  tabButtons = [...document.querySelectorAll('.tab-btn')];
  tabPanels = [...document.querySelectorAll('.tab-panel')];
  if (!tabButtons.length || !tabPanels.length) return;
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
    });
  });
  const active = tabButtons.find(btn => btn.classList.contains('active'))?.dataset.tab || tabButtons[0]?.dataset.tab;
  if (active) activateTab(active);
}

function activateTab(tab) {
  if (!tabButtons.length || !tabPanels.length) return;
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
}

// -----------------------------
// Plants & allocations
// -----------------------------
let plantsCerSelect;
let plantsPeriodInput;
let plantsTableBody;
let plantsFeedback;
let btnRecalcPreview;
let btnRecalcConfirm;
let btnExportCsv;
let allocationsPreview;
let allocationsPreviewContent;
let allocationsPreviewMembers;
let allocationsEmptyMessage;

function initPlantsModule() {
  plantsCerSelect = document.getElementById('plants-cer-select');
  plantsPeriodInput = document.getElementById('plants-period');
  plantsTableBody = document.querySelector('#plants-table tbody');
  plantsFeedback = document.getElementById('plants-feedback');
  btnRecalcPreview = document.getElementById('btn-recalc-preview');
  btnRecalcConfirm = document.getElementById('btn-recalc-confirm');
  btnExportCsv = document.getElementById('btn-export-csv');
  allocationsPreview = document.getElementById('allocations-preview');
  allocationsPreviewContent = document.getElementById('allocations-preview-content');
  allocationsPreviewMembers = document.getElementById('allocations-preview-members');
  allocationsEmptyMessage = document.getElementById('allocations-empty');
  if (allocationsEmptyMessage) {
    allocationsEmptyMessage.textContent = 'Esegui un ricalcolo per generare l’anteprima dei riparti.';
  }

  modalEls.root = document.getElementById('plant-config-modal');
  modalEls.tipologia = document.getElementById('plant-modal-tipologia');
  modalEls.pctCer = document.getElementById('plant-modal-pct-cer');
  modalEls.pctContra = document.getElementById('plant-modal-pct-contra');
  modalEls.slider = document.getElementById('plant-modal-slider');
  modalEls.error = document.getElementById('plant-modal-error');
  modalEls.preview = document.getElementById('plant-modal-preview');
  modalEls.weights = document.getElementById('plant-modal-weights');
  modalEls.weightsTabs = document.querySelectorAll('#plant-config-modal .weights-tabs button');
  modalEls.title = document.getElementById('plant-modal-title');
  modalEls.subtitle = document.getElementById('plant-modal-subtitle');
  modalEls.energy = document.getElementById('plant-modal-energy');
  modalEls.saveBtn = document.getElementById('plant-modal-save');
  modalEls.recalcBtn = document.getElementById('plant-modal-recalc');
  modalEls.closeBtns = document.querySelectorAll('[data-close-modal]');

  if (!plantsCerSelect || !plantsPeriodInput || !plantsTableBody) return;

  plantsPeriodInput.value = plantState.period;
  plantsPeriodInput.addEventListener('change', () => {
    plantState.period = plantsPeriodInput.value || currentPeriod();
    plantState.allocations.clear();
    plantState.lastResults = null;
    hideAllocationsPreview();
    if (plantState.selectedCerId) {
      loadPlantsForCer(plantState.selectedCerId);
    }
  });

  btnRecalcPreview?.addEventListener('click', () => postRecalc(false));
  btnRecalcConfirm?.addEventListener('click', () => postRecalc(true));
  btnExportCsv?.addEventListener('click', exportAllocationsCsv);
  btnExportCsv.disabled = true;

  modalEls.tipologia?.addEventListener('change', () => {
    updateWeightsTabLabel();
    updateModalPreview();
  });
  modalEls.pctCer?.addEventListener('input', () => syncPercentages('cer'));
  modalEls.pctContra?.addEventListener('input', () => syncPercentages('contra'));
  modalEls.slider?.addEventListener('input', () => syncPercentages('slider'));
  modalEls.weightsTabs?.forEach(btn => {
    btn.addEventListener('click', () => {
      modalEls.weightsTabs.forEach(b => b.classList.toggle('active', b === btn));
      plantState.weightsView = btn.dataset.weightTab;
      renderModalWeights();
    });
  });
  modalEls.saveBtn?.addEventListener('click', savePlantConfiguration);
  modalEls.recalcBtn?.addEventListener('click', () => {
    const res = updateModalPreview();
    if (res) {
      toast(`Anteprima aggiornata: ${formatKwh(res.totals.E)} kWh condivisi`);
    }
  });
  modalEls.closeBtns?.forEach(btn => btn.addEventListener('click', closePlantConfigModal));
  modalEls.root?.addEventListener('click', (e) => {
    if (e.target === modalEls.root) closePlantConfigModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlantConfigModal();
  });

  refreshCerOptions();
}

function currentPeriod() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${m}`;
}

async function refreshCerOptions() {
  if (!plantsCerSelect) {
    updateDocumentsSelect();
    updateCronoprogrammaSelect();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/plants`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Errore caricamento impianti');
    plantState.rawPlants = payload.data || [];
  } catch (err) {
    setPlantsFeedback(err.message || 'Errore durante il caricamento degli impianti', true);
  }

  const options = new Map();
  cers.forEach(cer => options.set(cer.id, cer.nome));
  plantState.rawPlants.forEach(p => {
    if (!options.has(p.cer_id)) options.set(p.cer_id, `CER ${p.cer_id}`);
  });

  const prev = plantState.selectedCerId;
  plantsCerSelect.innerHTML = '';
  if (!options.size) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nessuna CER disponibile';
    plantsCerSelect.appendChild(opt);
    plantsCerSelect.disabled = true;
    setPlantsFeedback('Crea una CER o configura impianti per iniziare.');
    renderPlantsTable();
    updateDocumentsSelect();
    updateCronoprogrammaSelect();
    return;
  }

  plantsCerSelect.disabled = false;
  options.forEach((label, id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    plantsCerSelect.appendChild(opt);
  });

  const next = prev && options.has(prev) ? prev : options.keys().next().value;
  plantState.selectedCerId = next;
  plantsCerSelect.value = next;
  plantsCerSelect.onchange = () => {
    plantState.selectedCerId = plantsCerSelect.value;
    plantState.lastResults = null;
    hideAllocationsPreview();
    loadPlantsForCer(plantState.selectedCerId);
  };
  loadPlantsForCer(plantState.selectedCerId);
  updateDocumentsSelect();
  updateCronoprogrammaSelect();
}

async function loadPlantsForCer(cerId) {
  if (!cerId) {
    plantState.plants = [];
    renderPlantsTable();
    return;
  }
  setPlantsFeedback('Caricamento impianti in corso…');
  try {
    const res = await fetch(`${API_BASE}/plants?cer_id=${encodeURIComponent(cerId)}`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Errore caricamento impianti');
    plantState.plants = payload.data || [];
    plantState.allocations.clear();
    await Promise.all(plantState.plants.map(p => ensureAllocationData(p.id, plantState.period)));
    renderPlantsTable();
    setPlantsFeedback(plantState.plants.length ? `${plantState.plants.length} impianti caricati` : 'Nessun impianto configurato per questa CER.');
  } catch (err) {
    plantState.plants = [];
    renderPlantsTable();
    setPlantsFeedback(err.message || 'Errore durante il caricamento degli impianti', true);
  }
}

async function ensureAllocationData(plantId, period) {
  const cached = plantState.allocations.get(plantId)?.get(period);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/allocations?plant_id=${encodeURIComponent(plantId)}&period=${encodeURIComponent(period)}`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Errore caricamento allocazioni');
    let map = plantState.allocations.get(plantId);
    if (!map) {
      map = new Map();
      plantState.allocations.set(plantId, map);
    }
    map.set(period, payload.data);
    return payload.data;
  } catch (err) {
    throw err;
  }
}

function getAllocation(plantId, period) {
  return plantState.allocations.get(plantId)?.get(period);
}

function renderPlantsTable() {
  if (!plantsTableBody) return;
  plantsTableBody.innerHTML = '';
  if (!plantState.plants.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7">Nessun impianto disponibile.</td>';
    plantsTableBody.appendChild(tr);
    return;
  }
  plantState.plants.forEach(plant => {
    const allocation = getAllocation(plant.id, plantState.period) || { energy_shared_kwh: 0, weights: { consumers: [], producers: [], prosumers: [] } };
    const validation = validatePlantConfig(plant, allocation);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${plant.name}</strong><br/><small>${plant.pod_id_produttore || ''}</small></td>
      <td>${plant.tipologia}</td>
      <td>${formatPercentage(plant.pct_cer)}</td>
      <td>${formatPercentage(plant.pct_contra)}</td>
      <td>${formatKwh(allocation.energy_shared_kwh)} kWh</td>
      <td>${renderValidationBadge(validation)}</td>
      <td><button class="btn ghost" data-plant="${plant.id}">Configura</button></td>
    `;
    tr.querySelector('[data-plant]').addEventListener('click', () => openPlantConfigModal(plant));
    plantsTableBody.appendChild(tr);
  });
}

function validatePlantConfig(plant, allocation) {
  const pctCer = Number(plant.pct_cer || 0);
  const pctContra = Number(plant.pct_contra || 0);
  if (pctCer + pctContra !== 100) return { status: 'error', message: 'Somma percentuali ≠ 100' };
  const weights = allocation?.weights || {};
  const sumConsumers = (weights.consumers || []).reduce((s, x) => s + Number(x.kwh_basis || 0), 0);
  if (pctCer > 0 && sumConsumers <= 0) return { status: 'error', message: 'Base consumer nulla' };
  if (!['A', 'B'].includes(plant.tipologia)) return { status: 'error', message: 'Tipologia non valida' };
  if (plant.tipologia === 'A') {
    const sumProd = (weights.producers || []).reduce((s, x) => s + Number(x.kwh_basis || 0), 0);
    if (pctContra > 0 && sumProd <= 0) return { status: 'error', message: 'Base produttori nulla' };
  }
  if (plant.tipologia === 'B') {
    const sumPros = (weights.prosumers || []).reduce((s, x) => s + Number(x.kwh_basis || 0), 0);
    if (pctContra > 0 && sumPros <= 0) return { status: 'error', message: 'Base prosumer nulla' };
  }
  if (!allocation?.energy_shared_kwh) {
    return { status: 'warn', message: 'Energia condivisa 0 kWh' };
  }
  return { status: 'ok', message: 'Configurazione valida' };
}

function renderValidationBadge(validation) {
  const icons = {
    ok: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.6 10.6 3.7 7.7l1.1-1.1 1.8 1.8 4.6-4.6 1.1 1.1-5.7 5.7z"/></svg>',
    warn: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1 1 15h14L8 1zm0 4.5 2.5 5h-5L8 5.5zM7 12h2v2H7z"/></svg>',
    error: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 0 .001 14.001A7 7 0 0 0 8 1zm2.47 9.53-.94.94L8 9.94l-1.53 1.53-.94-.94L7.06 9 5.53 7.47l.94-.94L8 8.06l1.53-1.53.94.94L8.94 9l1.53 1.53z"/></svg>'
  };
  const cls = validation.status === 'error' ? 'status-badge error' : validation.status === 'warn' ? 'status-badge warn' : 'status-badge';
  return `<span class="${cls}" title="${validation.message}">${icons[validation.status] || ''}<span>${validation.message}</span></span>`;
}

async function openPlantConfigModal(plant) {
  try {
    const allocation = await ensureAllocationData(plant.id, plantState.period);
    plantState.modalPlantId = plant.id;
    plantState.weightsView = 'consumers';
    modalEls.error?.classList.add('hidden');
    modalEls.weightsTabs?.forEach(btn => btn.classList.toggle('active', btn.dataset.weightTab === 'consumers'));
    if (modalEls.title) modalEls.title.textContent = `Configura ${plant.name}`;
    if (modalEls.subtitle) modalEls.subtitle.textContent = `CER ${plant.cer_id} · POD ${plant.pod_id_produttore || 'n/d'}`;
    if (modalEls.energy) modalEls.energy.textContent = `Energia condivisa periodo: ${formatKwh(allocation.energy_shared_kwh)} kWh`;
    modalEls.tipologia.value = plant.tipologia;
    modalEls.pctCer.value = plant.pct_cer;
    modalEls.pctContra.value = plant.pct_contra;
    modalEls.slider.value = plant.pct_cer;
    updateWeightsTabLabel();
    renderModalWeights();
    updateModalPreview();
    modalEls.root?.classList.add('open');
    modalEls.root?.setAttribute('aria-hidden', 'false');
  } catch (err) {
    alert(err.message || 'Impossibile aprire il modal di configurazione');
  }
}

function closePlantConfigModal() {
  modalEls.root?.classList.remove('open');
  modalEls.root?.setAttribute('aria-hidden', 'true');
  modalEls.error?.classList.add('hidden');
  plantState.modalPlantId = null;
}

function syncPercentages(source) {
  let cer = Number(modalEls.pctCer?.value || 0);
  let contra = Number(modalEls.pctContra?.value || 0);
  if (source === 'slider') {
    cer = Number(modalEls.slider.value || 0);
    contra = 100 - cer;
  } else if (source === 'cer') {
    cer = clamp(cer, 0, 100);
    contra = 100 - cer;
  } else if (source === 'contra') {
    contra = clamp(contra, 0, 100);
    cer = 100 - contra;
  }
  modalEls.pctCer.value = cer;
  modalEls.pctContra.value = contra;
  modalEls.slider.value = cer;
  updateModalPreview();
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function updateWeightsTabLabel() {
  const tip = modalEls.tipologia?.value;
  modalEls.weightsTabs?.forEach(btn => {
    if (btn.dataset.weightTab === 'counter') {
      btn.textContent = tip === 'A' ? 'Produttori' : 'Prosumer';
    }
  });
}

function renderModalWeights() {
  if (!modalEls.weights || !plantState.modalPlantId) return;
  const allocation = getAllocation(plantState.modalPlantId, plantState.period);
  const tip = modalEls.tipologia.value;
  const view = plantState.weightsView;
  let list = [];
  let label = '';
  if (view === 'consumers') {
    list = allocation?.weights?.consumers || [];
    label = 'Consumer';
  } else if (tip === 'A') {
    list = allocation?.weights?.producers || [];
    label = 'Produttori';
  } else {
    list = allocation?.weights?.prosumers || [];
    label = 'Prosumer';
  }
  const total = list.reduce((s, x) => s + Number(x.kwh_basis || 0), 0);
  if (!list.length) {
    modalEls.weights.innerHTML = `<p class="note">Nessun ${label.toLowerCase()} associato all'impianto.</p>`;
    return;
  }
  modalEls.weights.innerHTML = list.map(item => `
    <div class="weights-item"><span>${item.member_id}</span><span>${formatKwh(item.kwh_basis)} kWh</span></div>
  `).join('');
  modalEls.weights.insertAdjacentHTML('beforeend', `<p class="info-text">Totale base ${label.toLowerCase()}: ${formatKwh(total)} kWh</p>`);
}

function updateModalPreview() {
  if (!plantState.modalPlantId) return null;
  const allocation = getAllocation(plantState.modalPlantId, plantState.period);
  const tipologia = modalEls.tipologia.value;
  const pctCer = Number(modalEls.pctCer.value || 0);
  const pctContra = Number(modalEls.pctContra.value || 0);
  try {
    const plant = { tipologia, pct_cer: pctCer, pct_contra: pctContra };
    const split = splitPlant(plant, allocation || { energy_shared_kwh: 0 }, allocation?.weights || {});
    modalEls.error?.classList.add('hidden');
    renderModalWeights();
    renderModalPreview(split, tipologia);
    return split;
  } catch (err) {
    if (modalEls.error) {
      modalEls.error.textContent = err.message;
      modalEls.error.classList.remove('hidden');
    }
    if (modalEls.preview) modalEls.preview.innerHTML = '';
    return null;
  }
}

function renderModalPreview(split, tipologia) {
  if (!modalEls.preview) return;
  const counterLabel = tipologia === 'A' ? 'Produttori' : 'Prosumer';
  modalEls.preview.innerHTML = `
    <div class="preview-row"><span>Energia condivisa</span><strong>${formatKwh(split.totals.E)} kWh</strong></div>
    <div class="preview-row"><span>Quota CER (Consumer)</span><strong>${formatKwh(split.totals.cer)} kWh</strong></div>
    <div class="preview-row"><span>Quota ${counterLabel}</span><strong>${formatKwh(split.totals.contra)} kWh</strong></div>
  `;
  const consumers = createPreviewList('Consumer', split.consumers);
  if (consumers) modalEls.preview.appendChild(consumers);
  const counterpart = createPreviewList(counterLabel, tipologia === 'A' ? split.producers : split.prosumers);
  if (counterpart) modalEls.preview.appendChild(counterpart);
}

function createPreviewList(label, list) {
  if (!list?.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'preview-block';
  wrap.innerHTML = `<div class="preview-row"><span>${label}</span><span>Membri: ${list.length}</span></div>`;
  list.forEach(item => {
    wrap.innerHTML += `<div class="weights-item"><span>${item.member_id}</span><span>${formatKwh(item.kwh)} kWh</span></div>`;
  });
  return wrap;
}

async function savePlantConfiguration() {
  if (!plantState.modalPlantId) return;
  const tipologia = modalEls.tipologia.value;
  const pctCer = Number(modalEls.pctCer.value || 0);
  const pctContra = Number(modalEls.pctContra.value || 0);
  if (!['A', 'B'].includes(tipologia)) {
    if (modalEls.error) {
      modalEls.error.textContent = 'Tipologia non valida';
      modalEls.error.classList.remove('hidden');
    }
    return;
  }
  if (pctCer + pctContra !== 100) {
    if (modalEls.error) {
      modalEls.error.textContent = 'Le percentuali devono sommare 100';
      modalEls.error.classList.remove('hidden');
    }
    return;
  }
  try {
    const res = await safeGuardAction(() => fetch(`${API_BASE}/plants/${encodeURIComponent(plantState.modalPlantId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipologia, pct_cer: pctCer, pct_contra: pctContra })
    }));
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Errore salvataggio impianto');
    if (isDryRunResult(res, payload)) {
      plantState.lastResults = null;
      hideAllocationsPreview();
      toast('SAFE MODE attivo: configurazione impianto non persistita (dry-run).');
      closePlantConfigModal();
      return;
    }
    const idx = plantState.plants.findIndex(p => p.id === plantState.modalPlantId);
    if (idx !== -1) {
      plantState.plants[idx] = payload.data;
    }
    renderPlantsTable();
    plantState.lastResults = null;
    hideAllocationsPreview();
    toast('Configurazione impianto salvata');
    closePlantConfigModal();
  } catch (err) {
    if (modalEls.error) {
      modalEls.error.textContent = err.message || 'Errore durante il salvataggio';
      modalEls.error.classList.remove('hidden');
    }
  }
}

async function postRecalc(confirm) {
  if (!plantState.selectedCerId) {
    setPlantsFeedback('Seleziona una CER per ricalcolare', true);
    return;
  }
  try {
    const res = await safeGuardAction(() => fetch(`${API_BASE}/allocations/recalc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cer_id: plantState.selectedCerId, period: plantState.period, confirm })
    }));
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      if (payload?.details?.length) {
        const msg = payload.details.map(d => `${d.plant_id}: ${d.error}`).join('\n');
        throw new Error(`${payload.error}\n${msg}`);
      }
      throw new Error(payload.error || 'Errore calcolo riparti');
    }
    if (isDryRunResult(res, payload)) {
      setPlantsFeedback('SAFE MODE attivo: ricalcolo simulato, nessuna anteprima disponibile in dry-run.', true);
      return;
    }
    plantState.lastResults = payload.data;
    renderAllocationsPreview(payload.data, confirm);
    setPlantsFeedback(confirm ? 'Riparti confermati e salvati' : 'Anteprima riparti aggiornata');
  } catch (err) {
    setPlantsFeedback(err.message || 'Errore durante il ricalcolo', true);
  }
}

function renderAllocationsPreview(data, confirmed = false) {
  if (!allocationsPreview || !allocationsPreviewContent || !allocationsPreviewMembers) return;
  if (!data) {
    hideAllocationsPreview();
    return;
  }
  const hasResults = Array.isArray(data.results) && data.results.length > 0;
  if (!hasResults) {
    hideAllocationsPreview();
    if (allocationsEmptyMessage) allocationsEmptyMessage.textContent = 'Nessun dato disponibile per il periodo selezionato.';
    return;
  }
  if (allocationsEmptyMessage) allocationsEmptyMessage.textContent = '';
  allocationsPreviewContent.innerHTML = '';
  data.results.forEach(result => {
    const block = document.createElement('div');
    block.className = 'preview-block';
    const counterLabel = result.tipologia === 'A' ? 'Produttori' : 'Prosumer';
    block.innerHTML = `
      <div class="preview-row"><strong>${result.name}</strong><span>${formatKwh(result.allocations.totals.E)} kWh</span></div>
      <div class="weights-item"><span>Quota CER</span><span>${formatKwh(result.allocations.totals.cer)} kWh</span></div>
      <div class="weights-item"><span>Quota ${counterLabel}</span><span>${formatKwh(result.allocations.totals.contra)} kWh</span></div>
    `;
    allocationsPreviewContent.appendChild(block);
  });

  allocationsPreviewMembers.innerHTML = '';
  data.totals.per_member.forEach(item => {
    const row = document.createElement('div');
    row.className = 'weights-item';
    row.innerHTML = `<span>${item.member_id}</span><span>${formatKwh(item.kwh)} kWh</span>`;
    allocationsPreviewMembers.appendChild(row);
  });

  allocationsPreview.classList.remove('hidden');
  btnExportCsv.disabled = !data.results.length;
  if (confirmed) {
    toast('Riparti confermati e disponibili per l’esportazione');
  }
}

function hideAllocationsPreview() {
  if (allocationsPreview) allocationsPreview.classList.add('hidden');
  if (allocationsPreviewContent) allocationsPreviewContent.innerHTML = '';
  if (allocationsPreviewMembers) allocationsPreviewMembers.innerHTML = '';
  if (btnExportCsv) btnExportCsv.disabled = true;
  if (allocationsEmptyMessage) allocationsEmptyMessage.textContent = 'Esegui un ricalcolo per generare l’anteprima dei riparti.';
}

function exportAllocationsCsv() {
  if (!plantState.lastResults) {
    setPlantsFeedback('Esegui prima un ricalcolo per generare i dati CSV.', true);
    return;
  }
  const rows = [];
  plantState.lastResults.results.forEach(result => {
    const base = {
      plant_id: result.plant_id,
      tipologia: result.tipologia,
      pct_cer: result.pct_cer,
      pct_contra: result.pct_contra,
      energy_shared_kwh: result.energy_shared_kwh
    };
    result.allocations.consumers.forEach(item => {
      rows.push({ ...base, member_id: item.member_id, role: 'consumer', kwh_allocati: item.kwh });
    });
    result.allocations.producers.forEach(item => {
      rows.push({ ...base, member_id: item.member_id, role: 'producer', kwh_allocati: item.kwh });
    });
    result.allocations.prosumers.forEach(item => {
      rows.push({ ...base, member_id: item.member_id, role: 'prosumer', kwh_allocati: item.kwh });
    });
  });
  if (!rows.length) {
    setPlantsFeedback('Nessun dato da esportare per il periodo selezionato.', true);
    return;
  }
  const headers = ['plant_id', 'member_id', 'role', 'kwh_allocati', 'tipologia', 'pct_cer', 'pct_contra', 'energy_shared_kwh'];
  const lines = [headers.join(';')];
  rows.forEach(row => {
    lines.push(headers.map(h => formatCsvValue(row[h])).join(';'));
  });
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filePeriod = plantState.period.replace(/\//g, '-');
  a.href = url;
  a.download = `riparti_${plantState.selectedCerId}_${filePeriod}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Esportazione CSV completata');
}

function formatCsvValue(value) {
  if (value == null) return '';
  if (typeof value === 'number') {
    return value.toString().replace('.', ',');
  }
  const str = String(value);
  return str.includes(';') ? `"${str.replace(/"/g, '""')}"` : str;
}

function setPlantsFeedback(message, isError = false) {
  if (!plantsFeedback) return;
  plantsFeedback.textContent = message || '';
  plantsFeedback.classList.toggle('error-text', Boolean(isError));
}

function toast(message) {
  if (!message) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(message);
  } else {
    console.log(message);
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

function formatKwh(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(num);
}

function formatPercentage(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

// -----------------------------
// Algoritmi di calcolo
// -----------------------------
export function splitPlant(plant, alloc, weights) {
  const E = Number(alloc.energy_shared_kwh || 0);
  const pctCER = Number(plant.pct_cer || 0);
  const pctX = Number(plant.pct_contra || 0);
  if (pctCER + pctX !== 100) throw new Error('Percentuali impianto non sommano 100');

  const Qcer = E * pctCER / 100;
  const res = {
    consumers: [],
    producers: [],
    prosumers: [],
    totals: { E, cer: Qcer, contra: E * pctX / 100 }
  };

  const Wc = (weights.consumers || []).reduce((s, x) => s + Number(x.kwh_basis || 0), 0);
  if (Qcer > 0 && Wc <= 0) throw new Error('Base consumer nulla con pctCER>0');
  (weights.consumers || []).forEach(x => {
    const w = Number(x.kwh_basis || 0);
    const share = Wc > 0 ? Qcer * (w / Wc) : 0;
    res.consumers.push({ member_id: x.member_id, kwh: share });
  });

  const Qx = res.totals.contra;
  if (plant.tipologia === 'A') {
    const Wp = (weights.producers || []).reduce((s, x) => s + Number(x.kwh_basis || 0), 0);
    if (Qx > 0 && Wp <= 0) throw new Error('Base produttori nulla con pctContra>0 (Tipologia A)');
    (weights.producers || []).forEach(x => {
      const w = Number(x.kwh_basis || 0);
      const share = Wp > 0 ? Qx * (w / Wp) : 0;
      res.producers.push({ member_id: x.member_id, kwh: share });
    });
  } else if (plant.tipologia === 'B') {
    const Wr = (weights.prosumers || []).reduce((s, x) => s + Number(x.kwh_basis || 0), 0);
    if (Qx > 0 && Wr <= 0) throw new Error('Base prosumer nulla con pctContra>0 (Tipologia B)');
    (weights.prosumers || []).forEach(x => {
      const w = Number(x.kwh_basis || 0);
      const share = Wr > 0 ? Qx * (w / Wr) : 0;
      res.prosumers.push({ member_id: x.member_id, kwh: share });
    });
  } else {
    throw new Error('Tipologia impianto non valida');
  }

  return res;
}

export function aggregateCER(plantsResults) {
  const map = new Map();
  for (const r of plantsResults) {
    for (const x of (r.consumers || [])) map.set(x.member_id, (map.get(x.member_id) || 0) + x.kwh);
    for (const x of (r.producers || [])) map.set(x.member_id, (map.get(x.member_id) || 0) + x.kwh);
    for (const x of (r.prosumers || [])) map.set(x.member_id, (map.get(x.member_id) || 0) + x.kwh);
  }
  return Array.from(map, ([member_id, kwh]) => ({ member_id, kwh }));
}
