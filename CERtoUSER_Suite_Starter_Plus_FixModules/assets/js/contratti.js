import { allCustomers, allCER } from './storage.js';
import { safeGuardAction } from './safe.js';

const TEMPLATE_API = '/api/templates';
const DOCS_API = '/api/docs/upload';

let templates = [];
let customers = [];
let cers = [];

let templateSelect;
let customerSelect;
let cerSelect;
let generateBtn;
let printBtn;
let uploadBtn;
let fileInput;
let outputBox;
let feedbackBox;

let lastGeneratedHtml = '';

document.addEventListener('DOMContentLoaded', init);

function init() {
  templateSelect = document.getElementById('contract-template-select');
  customerSelect = document.getElementById('contract-customer-select');
  cerSelect = document.getElementById('contract-cer-select');
  generateBtn = document.getElementById('contract-generate');
  printBtn = document.getElementById('contract-print');
  uploadBtn = document.getElementById('contract-upload');
  fileInput = document.getElementById('contract-file');
  outputBox = document.getElementById('contract-output');
  feedbackBox = document.getElementById('contract-upload-feedback');

  customers = allCustomers();
  cers = allCER();

  populateCustomers();
  populateCers();
  fetchTemplates();

  generateBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    generateContract();
  });

  printBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    printContract();
  });

  uploadBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!templateSelect?.value) {
      toast('Seleziona prima un modello');
      return;
    }
    fileInput?.click();
  });

  fileInput?.addEventListener('change', handleUpload);
  window.addEventListener('storage', handleStorageChange);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchTemplates();
  });
}

async function fetchTemplates() {
  try {
    const res = await fetch(`${TEMPLATE_API}?module=contratti&status=active`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.error?.message || 'Impossibile caricare i modelli contratti');
    templates = payload.data || [];
    populateTemplateSelect();
  } catch (err) {
    console.error(err);
    templates = [];
    populateTemplateSelect();
    toast(err.message || 'Errore durante il caricamento dei modelli');
  }
}

function populateTemplateSelect() {
  if (!templateSelect) return;
  const current = templateSelect.value;
  templateSelect.innerHTML = '<option value="">Seleziona modello</option>';
  templates
    .filter((tpl) => tpl.status === 'active')
    .forEach((tpl) => {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = `${tpl.code} · v${tpl.version}`;
      if (current && current === tpl.id) opt.selected = true;
      templateSelect.appendChild(opt);
    });
}

function populateCustomers() {
  if (!customerSelect) return;
  const current = customerSelect.value;
  customerSelect.innerHTML = '<option value="">Seleziona cliente</option>';
  customers.forEach((cust) => {
    const opt = document.createElement('option');
    opt.value = cust.id;
    opt.textContent = `${cust.nome} — ${cust.pod}`;
    customerSelect.appendChild(opt);
  });
  if (current && customers.some((c) => c.id === current)) {
    customerSelect.value = current;
  }
}

function populateCers() {
  if (!cerSelect) return;
  const current = cerSelect.value;
  cerSelect.innerHTML = '<option value="">Seleziona CER</option>';
  cers.forEach((cer) => {
    const opt = document.createElement('option');
    opt.value = cer.id;
    const templateInfo = cer.template_code ? ` · ${cer.template_code}` : '';
    opt.textContent = `${cer.nome}${templateInfo}`;
    cerSelect.appendChild(opt);
  });
  if (current && cers.some((c) => c.id === current)) {
    cerSelect.value = current;
  }
}

function handleStorageChange(event) {
  if (event.key === 'customers') {
    customers = allCustomers();
    populateCustomers();
  }
  if (event.key === 'cers') {
    cers = allCER();
    populateCers();
  }
}

function generateContract() {
  if (!templateSelect?.value) {
    toast('Seleziona un modello per generare il contratto');
    return;
  }
  const template = templates.find((tpl) => tpl.id === templateSelect.value);
  if (!template) {
    toast('Modello non trovato');
    return;
  }

  const customer = customers.find((c) => c.id === customerSelect?.value);
  const cer = cers.find((c) => c.id === cerSelect?.value);
  const plant = cer?.impianti?.[0] || null;
  const now = new Date();
  const periodValue = document.getElementById('contract-period')?.value || '';
  const context = {
    cliente: {
      nome: customer?.nome || 'Cliente',
      piva: customer?.piva || customer?.cf || '',
      email: customer?.email || '',
      telefono: customer?.tel || '',
      indirizzo: customer?.comune ? `${customer.comune}${customer.indirizzo ? `, ${customer.indirizzo}` : ''}` : '',
    },
    pod: customer?.pod || cer?.membri?.find((m) => m.ruolo !== 'Produttore')?.pod || '',
    cabina: cer?.cabina || customer?.cabina || '',
    cer: {
      nome: cer?.nome || '',
      comune: cer?.comune || '',
      trader: cer?.trader || '',
      quota_condivisa: cer?.quota ? `${cer.quota}%` : '',
    },
    impianto: {
      nome: plant?.nome || 'Impianto',
      potenza_kw: plant?.potenza_kwp ? `${plant.potenza_kwp} kW` : '',
    },
    sistema: {
      data: formatDate(now),
      oggi: formatDate(now),
      anno: String(now.getFullYear()),
    },
  };
  if (periodValue) {
    context.sistema.periodo = formatPeriod(periodValue);
  }

  const content = template.content || buildFallbackTemplate(template);
  lastGeneratedHtml = compileTemplate(content, context);
  outputBox.innerHTML = lastGeneratedHtml;
  feedbackBox.textContent = '';
  toast('Contratto generato');
}

function compileTemplate(content, context) {
  return content.replace(/{{\s*([\w.]+)\s*}}/g, (match, token) => {
    const value = token.split('.').reduce((acc, key) => {
      if (acc && typeof acc === 'object' && key in acc) {
        return acc[key];
      }
      return '';
    }, context);
    return value ?? '';
  });
}

function buildFallbackTemplate(template) {
  return `
    <article class="contract-preview">
      <h2>${template.name || 'Contratto'} — ${template.code}</h2>
      <p>Tra <strong>{{cliente.nome}}</strong> (POD {{pod}}) e la CER <strong>{{cer.nome}}</strong> con quota condivisa {{cer.quota_condivisa}}.</p>
      <p>Data: {{oggi}} — Comune: {{cer.comune}} — Trader: {{cer.trader}}</p>
      <p>Impianto di riferimento: {{impianto.nome}} da {{impianto.potenza_kw}}.</p>
    </article>
  `;
}

function printContract() {
  if (!lastGeneratedHtml) {
    toast('Genera prima un contratto');
    return;
  }
  const popup = window.open('', '_blank');
  if (!popup) {
    toast('Impossibile aprire la finestra di stampa');
    return;
  }
  popup.document.write(`<!DOCTYPE html><html><head><title>Contratto</title><style>body{font-family:Inter,Arial,sans-serif;padding:32px;color:#111;background:#fff;}h1,h2{color:#0f172a;}p{line-height:1.6;}</style></head><body>${lastGeneratedHtml}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

async function handleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = {
      entity_type: 'contratti',
      entity_id: templateSelect?.value || 'generico',
      phase: 'firma',
      filename: file.name,
    };
    const res = await safeGuardAction(() => fetch(DOCS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error?.message || 'Upload mock fallito');
    feedbackBox.textContent = `Upload simulato: ${data.data.upload_url} (scade ${formatDateTime(data.data.expires_at)})`;
    toast('Caricamento simulato completato');
  } catch (err) {
    console.error(err);
    feedbackBox.textContent = err.message || 'Errore durante l\'upload';
    toast(err.message || 'Errore durante il caricamento');
  } finally {
    if (fileInput) fileInput.value = '';
  }
}

function formatDate(date) {
  return date.toLocaleDateString('it-IT');
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${formatDate(date)} ${date.toLocaleTimeString('it-IT')}`;
}

function formatPeriod(value) {
  if (!value || typeof value !== 'string') return value || '';
  const [year, month] = value.split('-');
  if (year && month) {
    return `${month}/${year}`;
  }
  return value;
}

function toast(message) {
  if (!message) return;
  try {
    const evt = new CustomEvent('cer:notify', { detail: message });
    window.dispatchEvent(evt);
  } catch (err) {
    console.info(message);
  }
}
