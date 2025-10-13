import { allCustomers, allCER, saveCER, uid, progressCERs, saveProgressCERs } from './storage.js';
import { saveDocFile, statutoTemplate, regolamentoTemplate, attoCostitutivoTemplate, adesioneTemplate, delegaGSETemplate, contrattoTraderTemplate, informativaGDPRTemplate } from './docs.js';

const API_BASE = '/api';

let form;
let membersBox;
let listEl;
let searchEl;

let customers = [];
let cers = [];

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

function init() {
  form = document.getElementById('form-cer');
  membersBox = document.getElementById('members-picker');
  listEl = document.getElementById('cer-list');
  searchEl = document.getElementById('search-cer');

  customers = allCustomers();
  cers = allCER();

  if (form) {
    bindCerForm();
    renderMembersPicker();
    renderCERList();
    if (searchEl) searchEl.oninput = renderCERList;
  }

  initTabs();
  initPlantsModule();
}

// -----------------------------
// CER anagrafica
// -----------------------------
function bindCerForm() {
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const cer = Object.fromEntries(fd.entries());
    cer.id = uid('cer');

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
      if (!cb.checked) return null;
      const id = cb.dataset.id;
      const c = customers.find(x => x.id === id);
      return { id: c.id, nome: c.nome, pod: c.pod, comune: c.comune, ruolo: role };
    }).filter(Boolean);
    if (!picks.length) {
      alert('Seleziona almeno un membro dalla lista.');
      return;
    }
    cer.membri = picks;

    cers.push(cer);
    saveCER(cers);
    form.reset();
    renderCERList();
    refreshCerOptions();
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };
}

function renderMembersPicker() {
  if (!membersBox) return;
  membersBox.innerHTML = '';
  if (!customers.length) {
    membersBox.innerHTML = '<p class="note">Non ci sono clienti. Vai al CRM per crearli.</p>';
    return;
  }
  customers.forEach(c => {
    const row = document.createElement('div');
    row.className = 'member-pick';
    row.innerHTML = `
      <input type="checkbox" id="cb_${c.id}" data-id="${c.id}"/>
      <label for="cb_${c.id}">${c.nome} <small class="badge blue">${c.pod}</small></label>
      <select class="role">
        <option value="Consumer" ${c.ruolo === 'Consumer' ? 'selected' : ''}>Consumer</option>
        <option value="Prosumer" ${c.ruolo === 'Prosumer' ? 'selected' : ''}>Prosumer</option>
        <option value="Produttore" ${c.ruolo === 'Produttore' ? 'selected' : ''}>Produttore</option>
      </select>
      <span class="badge">${c.comune || ''} · ${c.cabina || ''}</span>
    `;
    membersBox.appendChild(row);
  });
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
      r.innerHTML = `
        <div><strong>${cer.nome}</strong><br/><small>${cer.cf || ''}</small></div>
        <div>${cer.cabina}</div>
        <div>${cer.comune}</div>
        <div>${rip}</div>
        <div>${cer.quota}%</div>
        <div class="actions">
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
      r.querySelector('[data-docs]').onclick = () => openDocs(cer);
      listEl.appendChild(r);
    });
}

function openDocs(cer) {
  if (!listEl) return;
  const membri = cer.membri || [];
  const html = `
    <div class="card soft">
      <h3>Genera documenti — ${cer.nome}</h3>
      <div class="actions">
        <button class="btn" id="btnStatuto">Statuto (.doc)</button>
        <button class="btn" id="btnRegolamento">Regolamento (.doc)</button>
        <button class="btn" id="btnAtto">Atto costitutivo (.doc)</button>
        <select class="slim" id="membroPick"></select>
        <button class="btn" id="btnAdesione">Adesione membro (.doc)</button>
        <button class="btn" id="btnDelega">Delega GSE (.doc)</button>
        <button class="btn" id="btnTrader">Contratto Trader (.doc)</button>
        <button class="btn ghost" id="btnPrivacy">Informativa GDPR (.doc)</button>
      </div>
      <p class="note">Le bozze sono basate sui dati attuali della CER e dei membri.</p>
    </div>
    <div class="card soft">
      <h3>Cronoprogramma CER</h3>
      <div id="cerProgress"></div>
    </div>
  `;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const row = document.createElement('div');
  row.className = 'row';
  row.style.gridTemplateColumns = '1fr';
  row.appendChild(wrap);
  listEl.prepend(row);

  wrap.querySelector('#btnStatuto').onclick = () => {
    const doc = statutoTemplate(cer, membri);
    saveDocFile(`Statuto_${cer.nome}.doc`, doc);
  };
  wrap.querySelector('#btnRegolamento').onclick = () => {
    const doc = regolamentoTemplate(cer, membri);
    saveDocFile(`Regolamento_${cer.nome}.doc`, doc);
  };
  wrap.querySelector('#btnAtto').onclick = () => {
    const doc = attoCostitutivoTemplate(cer, membri);
    saveDocFile(`AttoCostitutivo_${cer.nome}.doc`, doc);
  };
  const pick = wrap.querySelector('#membroPick');
  membri.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.nome;
    pick.appendChild(opt);
  });
  wrap.querySelector('#btnAdesione').onclick = () => {
    const id = pick.value;
    const membro = membri.find(m => m.id === id);
    const doc = adesioneTemplate(cer, membro);
    saveDocFile(`Adesione_${membro?.nome || 'Membro'}.doc`, doc);
  };
  wrap.querySelector('#btnDelega').onclick = () => {
    const doc = delegaGSETemplate(cer, membri);
    saveDocFile(`Delega_GSE_${cer.nome}.doc`, doc);
  };
  wrap.querySelector('#btnTrader').onclick = () => {
    const doc = contrattoTraderTemplate(cer, membri);
    saveDocFile(`ContrattoTrader_${cer.nome}.doc`, doc);
  };
  wrap.querySelector('#btnPrivacy').onclick = () => {
    const doc = informativaGDPRTemplate(cer, membri);
    saveDocFile(`Privacy_${cer.nome}.doc`, doc);
  };
  renderCerProgress(wrap.querySelector('#cerProgress'), cer);
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
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  if (!buttons.length || !panels.length) return;
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tab);
      });
    });
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
  modalEls.closeBtns?.forEach(btn => btn.addEventListener('click', closePlantModal));
  modalEls.root?.addEventListener('click', (e) => {
    if (e.target === modalEls.root) closePlantModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlantModal();
  });

  refreshCerOptions();
}

function currentPeriod() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${m}`;
}

async function refreshCerOptions() {
  if (!plantsCerSelect) return;
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
    tr.querySelector('[data-plant]').addEventListener('click', () => openPlantModal(plant));
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

async function openPlantModal(plant) {
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

function closePlantModal() {
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
    const res = await fetch(`${API_BASE}/plants/${encodeURIComponent(plantState.modalPlantId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipologia, pct_cer: pctCer, pct_contra: pctContra })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Errore salvataggio impianto');
    const idx = plantState.plants.findIndex(p => p.id === plantState.modalPlantId);
    if (idx !== -1) {
      plantState.plants[idx] = payload.data;
    }
    renderPlantsTable();
    plantState.lastResults = null;
    hideAllocationsPreview();
    toast('Configurazione impianto salvata');
    closePlantModal();
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
    const res = await fetch(`${API_BASE}/allocations/recalc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cer_id: plantState.selectedCerId, period: plantState.period, confirm })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      if (payload?.details?.length) {
        const msg = payload.details.map(d => `${d.plant_id}: ${d.error}`).join('\n');
        throw new Error(`${payload.error}\n${msg}`);
      }
      throw new Error(payload.error || 'Errore calcolo riparti');
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
