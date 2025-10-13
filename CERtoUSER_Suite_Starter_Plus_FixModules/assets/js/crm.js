import { allCustomers, saveCustomers, uid, progressCustomers, saveProgressCustomers } from './storage.js';

const API_BASE = '/api';

const form = document.getElementById('form-customer');
const listEl = document.getElementById('customers-list');
const searchEl = document.getElementById('search');
const detailCard = document.getElementById('customer-detail');
const detailName = document.getElementById('detail-name');
const detailInfo = document.getElementById('detail-info');
const detailCloseBtn = document.getElementById('detail-close');
const consumiForm = document.getElementById('consumi-form');
const consumiYear = document.getElementById('consumi-year');
const consumiF1 = document.getElementById('consumi-f1');
const consumiF2 = document.getElementById('consumi-f2');
const consumiF3 = document.getElementById('consumi-f3');
const consumiFeedback = document.getElementById('consumi-feedback');
const consumiHistory = document.getElementById('consumi-history');
const importBillBtn = document.getElementById('btn-import-bill');
const billModal = document.getElementById('modal-bill-import');
const billFileInput = document.getElementById('bill-file');
const billFeedback = document.getElementById('bill-import-feedback');
const billUploadBtn = document.getElementById('btn-bill-upload');
const billParseBtn = document.getElementById('btn-bill-parse');
const billSaveBtn = document.getElementById('btn-bill-save');

const state = {
  modal: document.getElementById('modal-consumi'),
  modalTitle: document.querySelector('[data-modal-title]'),
  modalSubtitle: document.querySelector('[data-modal-subtitle]'),
  table: document.getElementById('consumi-table'),
  btnRefresh: document.getElementById('btn-refresh-consumi'),
  billFileInput: document.getElementById('bill-file'),
  uploadInfo: document.getElementById('bill-upload-info'),
  parseButton: document.getElementById('btn-parse-bill'),
  uploadButton: document.getElementById('btn-upload-bill'),
  review: document.getElementById('bill-review'),
  checklist: document.getElementById('bill-checklist'),
  duplicate: document.getElementById('bill-duplicate'),
  saveButton: document.getElementById('btn-save-consumi'),
  blocked: document.getElementById('bill-blocked'),
  currentCustomer: null,
  consumi: [],
  billId: null,
  billData: null,
  averageConfidence: 1,
  duplicateEntry: null,
  blockReasons: [],
  periodInvalid: false
};

let customers = allCustomers();
let selectedCustomer = null;
let pendingBill = null;

function notify(message) {
  if (!message) return;
  window.dispatchEvent(new CustomEvent('cer:notify', { detail: message }));
}

export function sanitizePOD(value) {
  if (!value) return null;
  const cleaned = String(value).toUpperCase().replace(/\s+/g, '');
  if (!/^IT[A-Z0-9]{12,16}$/.test(cleaned)) return null;
  return cleaned;
}

export function validPeriod(value) {
  if (!value) return false;
  const match = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(String(value));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

export function confirmChecklist(requireOverwrite = false) {
  const checkGse = document.getElementById('check-gse');
  const checkData = document.getElementById('check-data');
  if (!checkGse || !checkData) return false;
  if (!checkGse.checked || !checkData.checked) return false;
  if (requireOverwrite) {
    const checkOverwrite = document.getElementById('check-overwrite');
    if (!checkOverwrite || !checkOverwrite.checked) return false;
  }
  return true;
}

function toNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Number(num.toFixed(digits));
}

function formatKwh(value) {
  const num = Number(value || 0);
  return `${num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;
}

function formatEuro(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT');
}

function computeAverageConfidence(confidence = {}) {
  const values = Object.values(confidence)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return 1;
  const total = values.reduce((acc, cur) => acc + cur, 0);
  return total / values.length;
}

function rowHeader() {
  const r = document.createElement('div');
  r.className = 'row header';
  r.innerHTML = `
    <div>Cliente</div>
    <div>POD</div>
    <div>Comune</div>
    <div>Cabina</div>
    <div>Ruolo</div>
    <div>Azioni</div>
  `;
  return r;
}

function renderCustProgress(c) {
  const store = progressCustomers();
  const st = store[c.id] || { p1: { a: false, b: false, c: false }, p2: { a: false, b: false, c: false }, p3: { a: false, b: false, c: false } };

  const wrap = document.createElement('div');
  wrap.className = 'progress';
  wrap.innerHTML = `
    <div class="phase"><h4>Fase 1 — Costituzione</h4>
      <label class="chk"><input type="checkbox" data-k="p1.a" ${st.p1.a ? 'checked' : ''}/> Documento identità & CF</label>
      <label class="chk"><input type="checkbox" data-k="p1.b" ${st.p1.b ? 'checked' : ''}/> Consenso privacy</label>
      <label class="chk"><input type="checkbox" data-k="p1.c" ${st.p1.c ? 'checked' : ''}/> Bolletta recente</label>
    </div>
    <div class="phase"><h4>Fase 2 — Attivazione</h4>
      <label class="chk"><input type="checkbox" data-k="p2.a" ${st.p2.a ? 'checked' : ''}/> Adesione alla CER</label>
      <label class="chk"><input type="checkbox" data-k="p2.b" ${st.p2.b ? 'checked' : ''}/> POD verificato in cabina</label>
      <label class="chk"><input type="checkbox" data-k="p2.c" ${st.p2.c ? 'checked' : ''}/> Delega GSE</label>
    </div>
    <div class="phase"><h4>Fase 3 — Operatività</h4>
      <label class="chk"><input type="checkbox" data-k="p3.a" ${st.p3.a ? 'checked' : ''}/> Riparti impostati</label>
      <label class="chk"><input type="checkbox" data-k="p3.b" ${st.p3.b ? 'checked' : ''}/> Rendicontazione avviata</label>
      <label class="chk"><input type="checkbox" data-k="p3.c" ${st.p3.c ? 'checked' : ''}/> Contratto eccedenze</label>
    </div>
  `;
  wrap.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.onchange = () => {
      const [p, k] = cb.dataset.k.split('.');
      const cur = progressCustomers();
      const obj = cur[c.id] || { p1: { a: false, b: false, c: false }, p2: { a: false, b: false, c: false }, p3: { a: false, b: false, c: false } };
      obj[p][k] = cb.checked;
      cur[c.id] = obj;
      saveProgressCustomers(cur);
    };
  });
  return wrap;
}

function rowItem(c) {
  const r = document.createElement('div');
  r.className = 'row';
  r.innerHTML = `
    <div><strong>${c.nome}</strong><br/><small>${c.tipo} — ${c.email || ''} ${c.tel ? `· ${c.tel}` : ''}</small></div>
    <div><span class="badge blue">${c.pod}</span></div>
    <div>${c.comune || ''}</div>
    <div>${c.cabina || ''}</div>
    <div><span class="badge green">${c.ruolo || 'Consumer'}</span></div>
    <div class="actions">
      <button class="btn ghost" data-detail="${c.id}">Scheda</button>
      <button class="btn ghost" data-edit="${c.id}">Modifica</button>
      <button class="btn ghost" data-consumi="${c.id}">Consumi</button>
      <button class="btn ghost" data-prog="${c.id}">Cronoprogramma</button>
      <button class="btn danger" data-del="${c.id}">Elimina</button>
    </div>
  `;

  r.querySelector('[data-del]').onclick = () => {
    if (!confirm('Eliminare il cliente?')) return;
    customers = customers.filter((x) => x.id !== c.id);
    saveCustomers(customers);
    render();
  };
  r.querySelector('[data-edit]').onclick = () => editCustomer(c);
  r.querySelector('[data-consumi]').onclick = () => openConsumiModal(c);

  r.querySelector('[data-prog]').onclick = () => {
    const next = r.nextElementSibling;
    if (next && next.classList.contains('row-prog')) {
      next.remove();
      return;
    }
    const holder = document.createElement('div');
    holder.className = 'row-prog';
    holder.style.gridColumn = '1 / -1';
    const card = document.createElement('div');
    card.className = 'card soft';
    card.appendChild(renderCustProgress(c));
    holder.appendChild(card);
    listEl.insertBefore(holder, r.nextSibling);
  };

  return r;
}

function render() {
  const q = (searchEl?.value || '').toLowerCase().trim();
  if (!listEl) return;
  listEl.innerHTML = '';
  listEl.appendChild(rowHeader());
  customers
    .filter((c) => !q || [c.nome, c.pod, c.comune, c.cabina, c.tipo].some((x) => (x || '').toLowerCase().includes(q)))
    .forEach((c) => listEl.appendChild(rowItem(c)));
}

function openCustomerDetail(c) {
  selectedCustomer = c;
  if (!detailCard) return;
  detailCard.hidden = false;
  detailName.textContent = c.nome;
  const metaParts = [];
  if (c.tipo) metaParts.push(c.tipo);
  if (c.pod) metaParts.push(`POD ${c.pod}`);
  if (c.comune) metaParts.push(c.comune);
  detailInfo.textContent = metaParts.join(' · ');
  if (consumiForm) {
    const now = new Date();
    consumiYear.value = now.getFullYear();
    consumiF1.value = '';
    consumiF2.value = '';
    consumiF3.value = '';
    if (consumiFeedback) {
      consumiFeedback.textContent = '';
      consumiFeedback.classList.remove('error-text');
    }
  }
  loadConsumi(c.id);
}

function closeCustomerDetail() {
  selectedCustomer = null;
  if (detailCard) detailCard.hidden = true;
  if (consumiHistory) consumiHistory.innerHTML = '';
}

async function loadConsumi(clientId) {
  if (!consumiHistory) return;
  consumiHistory.innerHTML = '<tr><td colspan="5">Caricamento…</td></tr>';
  try {
    const res = await fetch(`${API_BASE}/consumi?client_id=${encodeURIComponent(clientId)}`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore caricamento consumi');
    renderConsumiHistory(Array.isArray(payload.data) ? payload.data : []);
  } catch (err) {
    consumiHistory.innerHTML = `<tr><td colspan="5" class="error-text">${err.message || 'Errore caricamento consumi'}</td></tr>`;
  }
}

function renderConsumiHistory(rows) {
  if (!consumiHistory) return;
  const sorted = [...rows].sort((a, b) => Number(b.year || b.anno || 0) - Number(a.year || a.anno || 0));
  if (!sorted.length) {
    consumiHistory.innerHTML = '<tr><td colspan="5">Nessun dato disponibile.</td></tr>';
    return;
  }
  consumiHistory.innerHTML = '';
  sorted.forEach(item => {
    const tr = document.createElement('tr');
    const year = item.year || item.anno;
    tr.innerHTML = `
      <td>${year}</td>
      <td>${formatKwh(item.f1_kwh)} kWh</td>
      <td>${formatKwh(item.f2_kwh)} kWh</td>
      <td>${formatKwh(item.f3_kwh)} kWh</td>
      <td>${formatKwh(item.total)} kWh</td>
    `;
    consumiHistory.appendChild(tr);
  });
}

async function submitConsumiForm(event) {
  event.preventDefault();
  if (!selectedCustomer) {
    toast('Seleziona un cliente per salvare i consumi');
    return;
  }
  const year = String(consumiYear.value || '').trim();
  const f1 = Number(consumiF1.value || 0);
  const f2 = Number(consumiF2.value || 0);
  const f3 = Number(consumiF3.value || 0);
  if (!/^\d{4}$/.test(year)) {
    consumiFeedback.textContent = 'Anno non valido (4 cifre).';
    consumiFeedback.classList.add('error-text');
    return;
  }
  if (f1 < 0 || f2 < 0 || f3 < 0) {
    consumiFeedback.textContent = 'I valori kWh devono essere >= 0.';
    consumiFeedback.classList.add('error-text');
    return;
  }
  try {
    consumiFeedback.textContent = 'Salvataggio in corso…';
    consumiFeedback.classList.remove('error-text');
    const res = await fetch(`${API_BASE}/consumi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: selectedCustomer.id,
        year,
        f1_kwh: f1,
        f2_kwh: f2,
        f3_kwh: f3
      })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore salvataggio consumi');
    consumiFeedback.textContent = 'Consumi salvati correttamente';
    toast('Consumi aggiornati');
    loadConsumi(selectedCustomer.id);
  } catch (err) {
    consumiFeedback.textContent = err.message || 'Errore durante il salvataggio';
    consumiFeedback.classList.add('error-text');
  }
}

function openBillModal() {
  if (!selectedCustomer) {
    toast('Apri la scheda cliente prima di importare una bolletta');
    return;
  }
  pendingBill = { client_id: selectedCustomer.id, bill_id: null, parsed: null };
  if (billFileInput) billFileInput.value = '';
  billFeedback.textContent = 'Seleziona un file PDF/JPG/PNG (mock).';
  billFeedback.classList.remove('error-text');
  billParseBtn.disabled = true;
  billSaveBtn.disabled = true;
  toggleModal(billModal, true);
}

function closeBillModal() {
  toggleModal(billModal, false);
  pendingBill = null;
  billParseBtn.disabled = true;
  billSaveBtn.disabled = true;
  billFeedback.textContent = '';
}

async function uploadBillMeta() {
  if (!pendingBill || !selectedCustomer) {
    toast('Seleziona un cliente.');
    return;
  }
  const fileName = billFileInput?.files?.[0]?.name || (billFileInput?.value || '').split('\\').pop();
  if (!fileName) {
    billFeedback.textContent = 'Seleziona un file da caricare.';
    billFeedback.classList.add('error-text');
    return;
  }
  try {
    billFeedback.textContent = 'Caricamento metadati…';
    billFeedback.classList.remove('error-text');
    const res = await fetch(`${API_BASE}/bills/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: selectedCustomer.id, filename: fileName })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore caricamento bolletta');
    pendingBill.bill_id = payload.data.bill_id;
    billFeedback.textContent = 'File caricato (mock). Ora estrai i dati.';
    billParseBtn.disabled = false;
  } catch (err) {
    billFeedback.textContent = err.message || 'Errore caricamento bolletta';
    billFeedback.classList.add('error-text');
  }
}

async function parseBillData() {
  if (!pendingBill?.bill_id) {
    billFeedback.textContent = 'Carica prima la bolletta.';
    billFeedback.classList.add('error-text');
    return;
  }
  try {
    billFeedback.textContent = 'Estrazione dati (stub)…';
    billFeedback.classList.remove('error-text');
    const res = await fetch(`${API_BASE}/bills/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill_id: pendingBill.bill_id })
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore parsing bolletta');
    pendingBill.parsed = payload.data;
    consumiYear.value = payload.data.anno;
    consumiF1.value = payload.data.f1_kwh;
    consumiF2.value = payload.data.f2_kwh;
    consumiF3.value = payload.data.f3_kwh;
    billFeedback.textContent = 'Dati estratti. Puoi salvarli come consumi.';
    billSaveBtn.disabled = false;
    toast('Dati bolletta importati nella scheda consumi');
  } catch (err) {
    billFeedback.textContent = err.message || 'Errore durante il parsing';
    billFeedback.classList.add('error-text');
  }
}

async function saveBillConsumi() {
  if (!pendingBill?.parsed || !selectedCustomer) {
    billFeedback.textContent = 'Estrai prima i dati dalla bolletta.';
    billFeedback.classList.add('error-text');
    return;
  }
  try {
    billFeedback.textContent = 'Salvataggio consumi…';
    billFeedback.classList.remove('error-text');
    const payloadData = {
      client_id: selectedCustomer.id,
      year: pendingBill.parsed.anno,
      f1_kwh: pendingBill.parsed.f1_kwh,
      f2_kwh: pendingBill.parsed.f2_kwh,
      f3_kwh: pendingBill.parsed.f3_kwh
    };
    const res = await fetch(`${API_BASE}/consumi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadData)
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Errore salvataggio consumi');
    billFeedback.textContent = 'Consumi salvati dalla bolletta.';
    toast('Consumi da bolletta registrati');
    closeBillModal();
    loadConsumi(selectedCustomer.id);
  } catch (err) {
    billFeedback.textContent = err.message || 'Errore durante il salvataggio';
    billFeedback.classList.add('error-text');
  }
}

function toggleModal(modal, show) {
  if (!modal) return;
  if (show) {
    modal.style.display = 'flex';
    modal.removeAttribute('aria-hidden');
  } else {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

function formatKwh(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(2);
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

function editCustomer(c) {
  if (!form) return;
  for (const [k, v] of Object.entries(c)) {
    const el = form.elements.namedItem(k);
    if (el) el.value = v;
  }
  form.dataset.editing = c.id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeConsumiModal() {
  if (!state.modal) return;
  state.modal.classList.remove('open');
  state.modal.setAttribute('aria-hidden', 'true');
  state.currentCustomer = null;
}

function openConsumiModal(customer) {
  if (!state.modal) return;
  state.currentCustomer = customer;
  const subtitleParts = [
    customer.pod ? `POD cliente: ${customer.pod}` : null,
    customer.cabina ? `Cabina: ${customer.cabina}` : null
  ].filter(Boolean);
  if (state.modalTitle) state.modalTitle.textContent = `Consumi — ${customer.nome || customer.ragione || customer.id}`;
  if (state.modalSubtitle) state.modalSubtitle.textContent = subtitleParts.join(' · ');
  state.modal.classList.add('open');
  state.modal.setAttribute('aria-hidden', 'false');
  resetWizard();
  renderConsumiTable();
  loadConsumi();
  notify('Verifica CP: apri la mappa GSE col pulsante CP e confronta POD/Cabina.');
}

function resetWizard() {
  state.billId = null;
  state.billData = null;
  state.averageConfidence = 1;
  state.duplicateEntry = null;
  state.blockReasons = [];
  state.periodInvalid = false;
  if (state.billFileInput) state.billFileInput.value = '';
  if (state.uploadInfo) state.uploadInfo.innerHTML = '<p class="info-text">Nessun file caricato.</p>';
  if (state.review) {
    state.review.classList.add('hidden');
    state.review.innerHTML = '';
  }
  if (state.checklist) state.checklist.innerHTML = '<p class="info-text">Completa gli step precedenti per abilitare il salvataggio.</p>';
  if (state.duplicate) {
    state.duplicate.classList.add('hidden');
    state.duplicate.innerHTML = '';
  }
  if (state.parseButton) state.parseButton.disabled = true;
  if (state.saveButton) state.saveButton.disabled = true;
  if (state.blocked) {
    state.blocked.classList.add('hidden');
    state.blocked.textContent = '';
  }
}

async function loadConsumi(showToast = false) {
  if (!state.currentCustomer || !state.table) return;
  state.table.innerHTML = '<p class="info-text">Caricamento storico consumi...</p>';
  try {
    const res = await fetch(`/api/consumi?client_id=${encodeURIComponent(state.currentCustomer.id)}`);
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Errore nel recupero dei consumi');
    }
    state.consumi = Array.isArray(json.data) ? json.data : [];
    renderConsumiTable();
    if (showToast) notify('Storico consumi aggiornato.');
  } catch (err) {
    state.table.innerHTML = `<p class="error-text">${err.message || 'Errore nel recupero dei consumi'}</p>`;
  }
}

function renderConsumiTable() {
  if (!state.table) return;
  if (!state.consumi.length) {
    state.table.innerHTML = '<p class="info-text">Nessun consumo registrato per questo cliente.</p>';
    return;
  }
  state.table.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'mini-row header';
  header.innerHTML = '<div>Periodo</div><div>kWh totali</div><div>Fonte</div><div>Aggiornato</div>';
  state.table.appendChild(header);
  state.consumi
    .sort((a, b) => (a.period > b.period ? -1 : 1))
    .forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'mini-row';
      const sourceClass = entry.source === 'bill' ? 'badge blue' : 'badge muted';
      row.innerHTML = `
        <div>${entry.period || '—'}</div>
        <div>${formatKwh(entry.kwh_total)}</div>
        <div><span class="${sourceClass}">${entry.source || 'manuale'}</span></div>
        <div>${formatDate(entry.updated_at)}</div>
      `;
      state.table.appendChild(row);
    });
}

function detectDuplicate(period, pod) {
  if (!period || !pod || !Array.isArray(state.consumi)) return null;
  return state.consumi.find((entry) => entry.period === period && entry.pod_id === pod);
}

function renderDuplicateWarning(entry) {
  if (!state.duplicate) return;
  if (!entry) {
    state.duplicate.classList.add('hidden');
    state.duplicate.innerHTML = '';
    return;
  }
  state.duplicate.classList.remove('hidden');
  state.duplicate.innerHTML = `
    <div>
      <strong>Esiste già un consumo registrato per ${entry.period}.</strong>
      <p>Per sostituirlo, spunta la casella di sovrascrittura.</p>
    </div>
    <div class="duplicate-row">
      <div><strong>POD</strong><br>${entry.pod_id}</div>
      <div><strong>kWh totali</strong><br>${formatKwh(entry.kwh_total)}</div>
      <div><strong>Fonte</strong><br>${entry.source || '—'}</div>
      <div><strong>Aggiornato</strong><br>${formatDate(entry.updated_at)}</div>
    </div>
  `;
}

function confidenceBadge(key) {
  const confidence = state.billData?.confidence || {};
  if (!key) {
    return '<span class="badge muted">Fonte: Calcolo UI</span>';
  }
  const value = Number(confidence[key]);
  if (!Number.isFinite(value)) {
    return '<span class="badge muted">Fonte: Parser bolletta</span>';
  }
  const percent = Math.round(value * 100);
  let cls = 'confidence-badge';
  if (value < 0.8) cls += ' warn';
  if (value < 0.6) cls += ' error';
  return `<span class="${cls}">Conf. ${percent}% · Parser bolletta</span>`;
}

function renderBillReview() {
  if (!state.review || !state.billData) return;
  const data = state.billData;
  const customerPod = sanitizePOD(state.currentCustomer?.pod || '');
  const mismatch = customerPod && data.pod && customerPod !== data.pod;
  const totalDiff = Math.abs((data.kwh_total || 0) - (data.kwh_total_calculated || 0)) > 0.01;
  const rows = [
    { label: 'Cliente', value: data.customer_name || '—' },
    { label: 'Codice fiscale', value: data.tax_code || '—' },
    { label: 'P.IVA', value: data.vat || '—' },
    { label: 'POD estratto', value: data.pod || '—', conf: 'pod', highlight: mismatch, notes: mismatch ? ['<span class="error-text">POD bolletta ≠ POD cliente</span>'] : [] },
    { label: 'Indirizzo fornitura', value: data.supply_address || '—' },
    { label: 'Fornitore', value: data.supplier || '—' },
    { label: 'Numero bolletta', value: data.bill_number || '—' },
    { label: 'Periodo', value: `${data.period_start || '—'} → ${data.period_end || '—'}`, conf: 'period', highlight: state.periodInvalid },
    { label: 'Anno riferimento', value: data.year || '—' },
    { label: 'Data emissione', value: data.issue_date || '—' },
    { label: 'Scadenza pagamento', value: data.due_date || '—' },
    { label: 'Potenza impegnata (kW)', value: data.contracted_power_kw !== undefined && data.contracted_power_kw !== null ? Number(data.contracted_power_kw).toFixed(2) : '—' },
    { label: 'Tariffa', value: data.tariff_code || '—' },
    { label: 'F1 (kWh)', value: formatKwh(data.kwh_f1), conf: 'f1' },
    { label: 'F2 (kWh)', value: formatKwh(data.kwh_f2), conf: 'f2' },
    { label: 'F3 (kWh)', value: formatKwh(data.kwh_f3), conf: 'f3' },
    { label: 'Totale kWh', value: formatKwh(data.kwh_total), notes: [`Somma F1+F2+F3: ${formatKwh(data.kwh_total_calculated)}`].concat(totalDiff ? ['<span class="warning-text">Valore normalizzato dalla somma delle fasce.</span>'] : []) },
    { label: 'Importo totale', value: formatEuro(data.total_amount_eur) },
    { label: 'IVA', value: data.iva_rate !== undefined && data.iva_rate !== null ? `${Number(data.iva_rate).toFixed(2)}%` : '—' }
  ];

  const avgPercent = Math.round(state.averageConfidence * 100);
  state.review.classList.remove('hidden');
  state.review.innerHTML = `
    <div class="review-grid">
      ${rows
        .map((row) => {
          const notes = Array.isArray(row.notes) ? row.notes.filter(Boolean).join('<br/>') : '';
          return `
            <div class="field-row${row.highlight ? ' highlight' : ''}">
              <div><strong>${row.label}</strong></div>
              <div>${row.value}${notes ? `<div class="info-text">${notes}</div>` : ''}</div>
              <div>${confidenceBadge(row.conf)}</div>
            </div>
          `;
        })
        .join('')}
    </div>
    <p class="info-text">Confidenza media parser: ${avgPercent}%</p>
  `;
  if (state.periodInvalid) {
    state.review.innerHTML += '<p class="error-text">Intervallo periodo non valido. Revisione manuale obbligatoria.</p>';
  }
}

function prepareChecklist() {
  if (!state.checklist) return;
  if (!state.billData) {
    state.checklist.innerHTML = '<p class="info-text">Esegui il parsing per attivare le conferme.</p>';
    return;
  }
  const requireOverwrite = Boolean(state.duplicateEntry);
  state.checklist.innerHTML = `
    <label><input type="checkbox" id="check-gse"/> Ho verificato il POD su mappa GSE (puoi aprire la mappa col pulsante CP)</label>
    <label><input type="checkbox" id="check-data"/> I dati F1/F2/F3 e periodo sono corretti</label>
    ${requireOverwrite ? '<label><input type="checkbox" id="check-overwrite"/> Accetto di sovrascrivere l’eventuale riga già presente per lo stesso periodo</label>' : ''}
  `;
  ['check-gse', 'check-data', 'check-overwrite'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateSaveState);
  });
  updateSaveState();
}

function updateBlockedMessage() {
  if (!state.blocked) return;
  if (!state.blockReasons.length) {
    state.blocked.classList.add('hidden');
    state.blocked.textContent = '';
    return;
  }
  state.blocked.classList.remove('hidden');
  state.blocked.textContent = state.blockReasons.join(' ');
}

function updateSaveState() {
  if (!state.saveButton) return;
  const requireOverwrite = Boolean(state.duplicateEntry);
  const checklistOk = confirmChecklist(requireOverwrite);
  const hasData = Boolean(state.billData && state.billData.pod && state.billData.period && validPeriod(state.billData.period));
  const blocked = state.blockReasons.length > 0;
  state.saveButton.disabled = !(hasData && checklistOk) || blocked;
}

async function uploadBill() {
  if (!state.currentCustomer || !state.billFileInput || !state.uploadInfo || !state.parseButton) return;
  const file = state.billFileInput.files?.[0];
  if (!file) {
    state.uploadInfo.innerHTML = '<p class="error-text">Seleziona un file bolletta (PDF/JPG/PNG).</p>';
    return;
  }
  state.uploadInfo.innerHTML = '<p class="info-text">Caricamento in corso...</p>';
  state.parseButton.disabled = true;
  try {
    const res = await fetch('/api/bills/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: state.currentCustomer.id, filename: file.name })
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Caricamento bolletta fallito');
    }
    state.billId = json.data?.bill_id || null;
    state.uploadInfo.innerHTML = `
      <p><strong>File:</strong> ${file.name}</p>
      <p class="info-text">ID bolletta: ${state.billId || '—'}</p>
    `;
    state.parseButton.disabled = !state.billId;
  } catch (err) {
    state.uploadInfo.innerHTML = `<p class="error-text">${err.message || 'Caricamento bolletta fallito'}</p>`;
    state.billId = null;
  }
}

function normalizeParsedBill(data = {}) {
  const podSanitized = sanitizePOD(data.pod) || (data.pod ? String(data.pod).toUpperCase().replace(/\s+/g, '') : '');
  const kwhF1 = toNumber(data.kwh_f1);
  const kwhF2 = toNumber(data.kwh_f2);
  const kwhF3 = toNumber(data.kwh_f3);
  const calculatedTotal = toNumber(kwhF1 + kwhF2 + kwhF3);
  let kwhTotal = data.kwh_total !== undefined && data.kwh_total !== null ? toNumber(data.kwh_total) : calculatedTotal;
  if (!Number.isFinite(kwhTotal)) kwhTotal = calculatedTotal;
  const periodStart = data.period_start ? String(data.period_start).slice(0, 10) : '';
  const periodEnd = data.period_end ? String(data.period_end).slice(0, 10) : '';
  let period = data.period || '';
  if (!period && periodStart && /^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    period = periodStart.slice(0, 7);
  }
  const yearFromPeriod = period ? Number(period.split('-')[0]) : null;
  const normalized = {
    ...data,
    pod: podSanitized,
    raw_pod: data.pod,
    confidence: data.confidence || {},
    kwh_f1: kwhF1,
    kwh_f2: kwhF2,
    kwh_f3: kwhF3,
    kwh_total: kwhTotal,
    kwh_total_calculated: calculatedTotal,
    period_start: periodStart,
    period_end: periodEnd,
    period,
    issue_date: data.issue_date ? String(data.issue_date).slice(0, 10) : '',
    due_date: data.due_date ? String(data.due_date).slice(0, 10) : '',
    year: data.year || yearFromPeriod || null
  };
  return normalized;
}

async function parseBill() {
  if (!state.billId || !state.parseButton || !state.review) return;
  state.parseButton.disabled = true;
  state.review.classList.remove('hidden');
  state.review.innerHTML = '<p class="info-text">Estrazione in corso...</p>';
  try {
    const res = await fetch('/api/bills/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill_id: state.billId })
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Parsing bolletta fallito');
    }
    state.billData = normalizeParsedBill(json.data || {});
    state.blockReasons = [];
    state.periodInvalid = false;
    if (!state.billData.pod) {
      state.blockReasons.push('POD estratto non valido.');
    }
    if (!state.billData.period || !validPeriod(state.billData.period)) {
      state.blockReasons.push('Periodo non valido: formato atteso YYYY-MM.');
      state.periodInvalid = true;
    }
    if (state.billData.period_start && state.billData.period_end) {
      const start = new Date(state.billData.period_start);
      const end = new Date(state.billData.period_end);
      if (start > end) {
        state.blockReasons.push('Intervallo periodo non valido (inizio successivo alla fine).');
        state.periodInvalid = true;
      }
    }
    state.averageConfidence = computeAverageConfidence(state.billData.confidence);
    if (state.averageConfidence < 0.8) {
      state.blockReasons.push('Confidenza media < 0.80: revisione manuale obbligatoria.');
      notify('Dati estratti con confidenza bassa: revisione manuale obbligatoria.');
    }
    state.duplicateEntry = detectDuplicate(state.billData.period, state.billData.pod);
    renderBillReview();
    renderDuplicateWarning(state.duplicateEntry);
    prepareChecklist();
    updateBlockedMessage();
    updateSaveState();
  } catch (err) {
    state.review.innerHTML = `<p class="error-text">${err.message || 'Parsing bolletta fallito'}</p>`;
    state.blockReasons = [];
    state.periodInvalid = false;
    state.billData = null;
    renderDuplicateWarning(null);
    prepareChecklist();
    updateBlockedMessage();
    updateSaveState();
  } finally {
    state.parseButton.disabled = false;
  }
}

async function saveConsumi() {
  if (!state.saveButton || !state.billData || !state.currentCustomer) return;
  const requireOverwrite = Boolean(state.duplicateEntry);
  if (state.blockReasons.length) {
    updateBlockedMessage();
    return;
  }
  if (!confirmChecklist(requireOverwrite)) {
    notify('Completa tutte le conferme richieste prima di salvare.');
    updateSaveState();
    return;
  }
  const period = state.billData.period;
  const pod = state.billData.pod;
  if (!pod || !period || !validPeriod(period)) {
    state.blockReasons = ['Impossibile salvare: dati POD o periodo non validi.'];
    updateBlockedMessage();
    updateSaveState();
    return;
  }
  const payload = {
    client_id: state.currentCustomer.id,
    pod_id: pod,
    period,
    year: Number(state.billData.year || period.split('-')[0]),
    kwh_f1: state.billData.kwh_f1,
    kwh_f2: state.billData.kwh_f2,
    kwh_f3: state.billData.kwh_f3,
    kwh_total: state.billData.kwh_total,
    overwrite: requireOverwrite || undefined,
    source: 'bill',
    bill_pod: pod,
    bill_period: period,
    bill_id: state.billId
  };
  state.saveButton.disabled = true;
  try {
    const res = await fetch('/api/consumi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      if (json.code === 'DUPLICATE_PERIOD' && json.existing) {
        state.duplicateEntry = json.existing;
        renderDuplicateWarning(state.duplicateEntry);
        prepareChecklist();
        updateSaveState();
        notify('Periodo già presente: conferma sovrascrittura per procedere.');
        return;
      }
      if (json.code === 'POD_CLIENT_MISMATCH') {
        state.blockReasons = ['Il POD indicato non appartiene al cliente selezionato.'];
        updateBlockedMessage();
        updateSaveState();
        return;
      }
      if (json.code === 'BILL_VALIDATION_FAILED') {
        state.blockReasons = ['Validazione bolletta fallita: controlla POD e periodo.'];
        updateBlockedMessage();
        updateSaveState();
        return;
      }
      throw new Error(json.error || 'Salvataggio consumi fallito');
    }
    notify('Consumi salvati con successo.');
    await loadConsumi(true);
    resetWizard();
  } catch (err) {
    notify(err.message || 'Salvataggio consumi fallito');
  } finally {
    updateBlockedMessage();
    updateSaveState();
  }
}

if (state.modal) {
  state.modal.querySelectorAll('[data-close-consumi]').forEach((el) => {
    el.addEventListener('click', closeConsumiModal);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.modal.classList.contains('open')) {
      closeConsumiModal();
    }
  });
}

if (state.btnRefresh) {
  state.btnRefresh.addEventListener('click', () => loadConsumi(true));
}
if (state.uploadButton) {
  state.uploadButton.addEventListener('click', uploadBill);
}
if (state.parseButton) {
  state.parseButton.addEventListener('click', parseBill);
}
if (state.saveButton) {
  state.saveButton.addEventListener('click', saveConsumi);
}

if (form) {
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data.id = form.dataset.editing || uid('cust');
    const sanitized = sanitizePOD(data.pod);
    if (!sanitized) {
      alert('POD non valido. Formato atteso ITXXXXXXXXXXXX.');
      return;
    }
    const dup = customers.find((x) => x.pod.trim().toUpperCase() === sanitized && x.id !== data.id);
    if (dup) {
      alert(`POD già presente per il cliente: ${dup.nome}`);
      return;
    }
    data.pod = sanitized;
    if (form.dataset.editing) {
      customers = customers.map((x) => (x.id === data.id ? { ...x, ...data } : x));
    } else {
      customers.push(data);
    }
    saveCustomers(customers);
    form.reset();
    delete form.dataset.editing;
    render();
  };
  const podInput = form.elements.namedItem('pod');
  if (podInput) {
    podInput.addEventListener('blur', () => {
      const sanitized = sanitizePOD(podInput.value);
      if (sanitized) {
        podInput.value = sanitized;
      } else {
        podInput.value = String(podInput.value || '').toUpperCase().replace(/\s+/g, '');
      }
    });
  }
}

if (searchEl) {
  searchEl.oninput = render;
}

render();
