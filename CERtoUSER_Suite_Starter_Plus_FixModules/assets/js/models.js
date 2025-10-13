const API_BASE = '/api/templates';

let templates = [];
let filter = 'all';

let tableBody;
let filterButtons = [];
let uploadModal;
let uploadForm;
let openUploadBtn;
let submitUploadBtn;

document.addEventListener('DOMContentLoaded', init);

function init() {
  tableBody = document.querySelector('#templates-table tbody');
  filterButtons = Array.from(document.querySelectorAll('.tabs .tab-btn'));
  uploadModal = document.getElementById('upload-modal');
  uploadForm = document.getElementById('upload-form');
  openUploadBtn = document.getElementById('btn-open-upload');
  submitUploadBtn = document.getElementById('btn-submit-upload');

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
      filter = btn.dataset.filter || 'all';
      fetchTemplates();
    });
  });

  if (openUploadBtn) openUploadBtn.addEventListener('click', openModal);
  if (submitUploadBtn) submitUploadBtn.addEventListener('click', submitUpload);

  document.querySelectorAll('[data-dismiss="modal"]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  if (uploadModal) {
    uploadModal.addEventListener('click', (event) => {
      if (event.target === uploadModal) closeModal();
    });
  }

  fetchTemplates();
}

async function fetchTemplates() {
  const query = filter && filter !== 'all' ? `?module=${encodeURIComponent(filter)}` : '';
  try {
    const payload = await fetchJSON(`${API_BASE}${query}`);
    templates = payload.data || [];
  } catch (err) {
    console.error(err);
    templates = [];
    toast(err.message || 'Errore durante il caricamento dei modelli');
  }
  renderTable();
}

function renderTable() {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  const filtered = templates.filter((tpl) => filter === 'all' || tpl.module === filter);
  if (!filtered.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.innerHTML = '<p class="info-text">Nessun modello disponibile per il filtro selezionato.</p>';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  filtered.sort((a, b) => a.code.localeCompare(b.code) || b.version - a.version);
  filtered.forEach((tpl) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${tpl.name}</td>
      <td class="nowrap">${tpl.code}</td>
      <td class="nowrap text-upper">${tpl.module}</td>
      <td>v${tpl.version}</td>
      <td>${renderStatus(tpl)}</td>
      <td class="nowrap actions"></td>
    `;
    const actionsCell = row.querySelector('.actions');
    actionsCell.appendChild(actionButton('Attiva', () => activateTemplate(tpl), { disabled: tpl.status === 'active', tone: 'primary' }));
    actionsCell.appendChild(actionButton('Scarica', () => downloadTemplate(tpl)));
    actionsCell.appendChild(actionButton('Elimina', () => deleteTemplate(tpl), { tone: 'danger' }));
    tableBody.appendChild(row);
  });
}

function renderStatus(tpl) {
  const placeholders = tpl.placeholders?.length ? tpl.placeholders.join(', ') : '—';
  const badge = tpl.status === 'active' ? '<span class="badge accent">Attivo</span>' : '<span class="badge">Inattivo</span>';
  return `${badge}<br/><small>Segnaposto: ${placeholders}</small>`;
}

function actionButton(label, handler, options = {}) {
  const { disabled = false, tone = 'ghost' } = options;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  if (tone === 'danger') {
    btn.classList.add('danger');
  } else if (tone === 'primary') {
    btn.classList.add('btn-primary');
  } else {
    btn.classList.add('ghost');
  }
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener('click', handler);
  return btn;
}

function openModal() {
  if (!uploadModal) return;
  uploadModal.classList.add('open');
  uploadModal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  if (!uploadModal) return;
  uploadModal.classList.remove('open');
  uploadModal.setAttribute('aria-hidden', 'true');
  uploadForm?.reset();
}

async function submitUpload(event) {
  event?.preventDefault();
  if (!uploadForm) return;
  const fd = new FormData(uploadForm);
  const payload = {
    name: fd.get('name')?.toString().trim(),
    code: fd.get('code')?.toString().trim(),
    module: fd.get('module')?.toString().trim(),
    placeholders: parsePlaceholders(fd.get('placeholders')?.toString() || ''),
    content: fd.get('content')?.toString() || '',
    fileName: fd.get('file') instanceof File && fd.get('file').name ? fd.get('file').name : null,
  };

  if (!payload.name || !payload.code || !payload.module) {
    toast('Compila almeno nome, codice e modulo');
    return;
  }

  try {
    const data = await fetchJSON(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    templates = data.data || templates;
    closeModal();
    renderTable();
    toast('Nuova versione caricata');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Errore durante il caricamento');
  }
}

async function activateTemplate(tpl) {
  try {
    const data = await fetchJSON(`${API_BASE}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tpl.id }),
    });
    templates = data.data || templates;
    renderTable();
    toast(`Modello ${tpl.code} attivato`);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Errore in attivazione');
  }
}

function downloadTemplate(tpl) {
  if (!tpl.url) {
    toast('URL modello non disponibile');
    return;
  }
  window.open(tpl.url, '_blank');
}

async function deleteTemplate(tpl) {
  if (!confirm(`Eliminare la versione ${tpl.code} v${tpl.version}?`)) return;
  try {
    const data = await fetchJSON(`${API_BASE}/${encodeURIComponent(tpl.id)}`, {
      method: 'DELETE',
    });
    templates = data.data || templates.filter((t) => t.id !== tpl.id);
    renderTable();
    toast('Modello eliminato');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Errore durante eliminazione');
  }
}

function parsePlaceholders(raw) {
  return raw
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

async function fetchJSON(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    const networkError = new Error(err?.message || 'Richiesta di rete fallita');
    networkError.cause = err;
    throw networkError;
  }

  const contentType = response.headers.get('content-type') || '';
  let payload;
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    const error = new Error(`Risposta non JSON (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  if (!response.ok || payload.ok === false) {
    const apiError = payload?.error || {};
    const message = apiError.message || payload?.message || 'Errore API';
    const err = new Error(message);
    err.payload = payload;
    throw err;
  }

  return payload;
}

function toast(message) {
  if (!message) return;
  const evt = new CustomEvent('cer:notify', { detail: message });
  window.dispatchEvent(evt);
}
