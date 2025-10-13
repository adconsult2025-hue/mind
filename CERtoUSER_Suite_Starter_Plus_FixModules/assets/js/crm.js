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

let customers = allCustomers();
let selectedCustomer = null;
let pendingBill = null;

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

function renderCustProgress(c){
  const store = progressCustomers();
  const st = store[c.id] || { p1:{a:false,b:false,c:false}, p2:{a:false,b:false,c:false}, p3:{a:false,b:false,c:false} };

  const wrap = document.createElement('div');
  wrap.className = 'progress';
  wrap.innerHTML = `
    <div class="phase"><h4>Fase 1 — Costituzione</h4>
      <label class="chk"><input type="checkbox" data-k="p1.a" ${st.p1.a?'checked':''}/> Documento identità & CF</label>
      <label class="chk"><input type="checkbox" data-k="p1.b" ${st.p1.b?'checked':''}/> Consenso privacy</label>
      <label class="chk"><input type="checkbox" data-k="p1.c" ${st.p1.c?'checked':''}/> Bolletta recente</label>
    </div>
    <div class="phase"><h4>Fase 2 — Attivazione</h4>
      <label class="chk"><input type="checkbox" data-k="p2.a" ${st.p2.a?'checked':''}/> Adesione alla CER</label>
      <label class="chk"><input type="checkbox" data-k="p2.b" ${st.p2.b?'checked':''}/> POD verificato in cabina</label>
      <label class="chk"><input type="checkbox" data-k="p2.c" ${st.p2.c?'checked':''}/> Delega GSE</label>
    </div>
    <div class="phase"><h4>Fase 3 — Operatività</h4>
      <label class="chk"><input type="checkbox" data-k="p3.a" ${st.p3.a?'checked':''}/> Riparti impostati</label>
      <label class="chk"><input type="checkbox" data-k="p3.b" ${st.p3.b?'checked':''}/> Rendicontazione avviata</label>
      <label class="chk"><input type="checkbox" data-k="p3.c" ${st.p3.c?'checked':''}/> Contratto eccedenze</label>
    </div>
  `;
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.onchange = () => {
      const [p,k] = cb.dataset.k.split('.');
      const cur = progressCustomers();
      const obj = cur[c.id] || { p1:{a:false,b:false,c:false}, p2:{a:false,b:false,c:false}, p3:{a:false,b:false,c:false} };
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
    <div><strong>${c.nome}</strong><br/><small>${c.tipo} — ${c.email||''} ${c.tel?('· '+c.tel):''}</small></div>
    <div><span class="badge blue">${c.pod}</span></div>
    <div>${c.comune||''}</div>
    <div>${c.cabina||''}</div>
    <div><span class="badge green">${c.ruolo||'Consumer'}</span></div>
    <div class="actions">
      <button class="btn ghost" data-detail="${c.id}">Scheda</button>
      <button class="btn ghost" data-edit="${c.id}">Modifica</button>
      <button class="btn ghost" data-prog="${c.id}">Cronoprogramma</button>
      <button class="btn danger" data-del="${c.id}">Elimina</button>
    </div>
  `;

  r.querySelector('[data-del]').onclick = () => {
    if (!confirm('Eliminare il cliente?')) return;
    if (selectedCustomer && selectedCustomer.id === c.id) closeCustomerDetail();
    customers = customers.filter(x => x.id !== c.id);
    saveCustomers(customers); render();
  };
  r.querySelector('[data-edit]').onclick = () => editCustomer(c);
  r.querySelector('[data-detail]').onclick = () => openCustomerDetail(c);

  // Toggle cronoprogramma sotto la riga
  r.querySelector('[data-prog]').onclick = () => {
    const next = r.nextElementSibling;
    if (next && next.classList.contains('row-prog')) { next.remove(); return; }
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
  const q = (searchEl.value||'').toLowerCase().trim();
  listEl.innerHTML = '';
  listEl.appendChild(rowHeader());
  customers
    .filter(c => !q || [c.nome, c.pod, c.comune, c.cabina, c.tipo].some(x => (x||'').toLowerCase().includes(q)))
    .forEach(c => listEl.appendChild(rowItem(c)));
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
  for (const [k,v] of Object.entries(c)) {
    const el = form.elements.namedItem(k);
    if (el) el.value = v;
  }
  form.dataset.editing = c.id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

form.onsubmit = (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  data.id = form.dataset.editing || uid('cust');
  // POD univoco
  const dup = customers.find(x => x.pod.trim().toUpperCase() === data.pod.trim().toUpperCase() && x.id !== data.id);
  if (dup) { alert('POD già presente per il cliente: ' + dup.nome); return; }
  data.pod = data.pod.trim().toUpperCase();

  if (form.dataset.editing) {
    customers = customers.map(x => x.id === data.id ? {...x, ...data} : x);
  } else {
    customers.push(data);
  }
  saveCustomers(customers);
  form.reset();
  delete form.dataset.editing;
  render();
};

consumiForm?.addEventListener('submit', submitConsumiForm);
detailCloseBtn?.addEventListener('click', closeCustomerDetail);
importBillBtn?.addEventListener('click', openBillModal);
billUploadBtn?.addEventListener('click', uploadBillMeta);
billParseBtn?.addEventListener('click', parseBillData);
billSaveBtn?.addEventListener('click', saveBillConsumi);
billFileInput?.addEventListener('change', () => {
  if (pendingBill) {
    pendingBill.bill_id = null;
    pendingBill.parsed = null;
  }
  billParseBtn.disabled = true;
  billSaveBtn.disabled = true;
  billFeedback.textContent = '';
  billFeedback.classList.remove('error-text');
});
document.querySelectorAll('[data-close-modal="bill"]').forEach(btn => btn.addEventListener('click', closeBillModal));
billModal?.addEventListener('click', (event) => {
  if (event.target === billModal) closeBillModal();
});
toggleModal(billModal, false);

searchEl.oninput = render;
render();
