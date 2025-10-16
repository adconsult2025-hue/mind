import { allCustomers, allCER } from './storage.js';
import { safeGuardAction, isDryRunResult } from './safe.js';

const TEMPLATE_API = '/api/templates';
const DOCS_API = '/api/docs/upload';

let templates = [];
let customers = [];
let cers = [];

let templateSelect;
let customerSelect;
let cerSelect;
let generateBtn;
let preventivoBtn;
let printBtn;
let uploadBtn;
let fileInput;
let outputBox;
let feedbackBox;

let lastGeneratedHtml = '';

const HTML_ESCAPE_TABLE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  templateSelect = document.getElementById('contract-template-select');
  customerSelect = document.getElementById('contract-customer-select');
  cerSelect = document.getElementById('contract-cer-select');
  generateBtn = document.getElementById('contract-generate');
  preventivoBtn = document.getElementById('btn-genera-preventivo');
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

  preventivoBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    generatePreventivo();
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
    templates = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
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

function generatePreventivo() {
  const customer = customers.find((c) => c.id === customerSelect?.value);
  const cer = cers.find((c) => c.id === cerSelect?.value);
  if (!customer) {
    toast('Seleziona un cliente per generare il preventivo');
    return;
  }

  const plants = Array.isArray(cer?.impianti) ? cer.impianti : [];
  const mainPlant = plants[0] || null;
  const productionKwh = estimateAnnualProduction(plants);
  const fallbackProduction = productionKwh > 0 ? productionKwh : 4200;
  const shareQuota = resolveShareQuota(cer);
  const sharedKwh = fallbackProduction * shareQuota;
  const consumptionKwh = resolveConsumption(customer, cer, fallbackProduction);
  const energySelfConsumed = Math.min(sharedKwh, consumptionKwh);
  const energyRemunerated = Math.max(sharedKwh - energySelfConsumed, 0);
  const autoconsumoRate = consumptionKwh > 0 ? energySelfConsumed / consumptionKwh : 0;
  const now = new Date();
  const periodValue = document.getElementById('contract-period')?.value || '';
  const periodLabel = periodValue ? formatPeriod(periodValue) : formatDate(now);

  const baseTariff = 0.28; // €/kWh ipotizzato per il cliente
  const gseTariff = 0.11; // €/kWh incentivo GSE stimato
  const risparmioEnergia = energySelfConsumed * baseTariff;
  const incentivoGse = sharedKwh * gseTariff;
  const valoreAnnuo = risparmioEnergia + incentivoGse;
  const valoreMensile = valoreAnnuo / 12;
  const co2SavedTons = (sharedKwh * 0.35) / 1000;

  const preventivoHtml = `
    <article class="contract-preview preventivo-preview">
      <header class="preventivo-header">
        <h2>Preventivo economico condiviso</h2>
        <p>Generato per <strong>${escapeHtml(customer?.nome || 'Cliente')}</strong>${cer?.nome ? ` nella CER <strong>${escapeHtml(cer.nome)}</strong>` : ''}. Aggiornamento ${escapeHtml(periodLabel)}.</p>
      </header>
      <section class="preventivo-metrics">
        ${buildMetricCard('Energia condivisa annua', `${formatKwh(sharedKwh)} kWh`, `Energia allocata con quota ${formatPercent(shareQuota)}`)}
        ${buildMetricCard('Risparmio annuo stimato', formatCurrency(valoreAnnuo), `≈ ${formatCurrency(valoreMensile)} / mese`)}
        ${buildMetricCard('CO₂ evitata', `${formatTons(co2SavedTons)} t`, 'Fattore emissivo 0,35 kg/kWh')}
      </section>
      <section class="preventivo-details">
        <h3>Dati principali</h3>
        <ul class="preventivo-list">
          <li><span>Impianto di riferimento</span><strong>${buildPlantInfo(mainPlant)}</strong></li>
          <li><span>Produzione stimata</span><strong>${formatKwh(fallbackProduction)} kWh/anno</strong></li>
          <li><span>Energia autoconsumata</span><strong>${formatKwh(energySelfConsumed)} kWh</strong></li>
          <li><span>Energia valorizzata</span><strong>${formatKwh(energyRemunerated)} kWh</strong></li>
          <li><span>Autoconsumo cliente</span><strong>${formatPercent(autoconsumoRate)}</strong></li>
          <li><span>Incentivo GSE stimato</span><strong>${formatCurrency(incentivoGse)}/anno</strong></li>
        </ul>
      </section>
      <section class="preventivo-notes">
        <h3>Note operative</h3>
        <p>Calcolo basato su prezzo energia ${formatCurrency(baseTariff)} / kWh e incentivo GSE ${formatCurrency(gseTariff)} / kWh. I valori sono simulati per presentazioni commerciali e possono essere personalizzati inserendo dati reali nei moduli CRM e CER.</p>
      </section>
    </article>
  `;

  lastGeneratedHtml = preventivoHtml;
  outputBox.innerHTML = preventivoHtml;
  feedbackBox.textContent = '';
  toast('Preventivo generato');
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

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_TABLE[char] || char);
}

function buildMetricCard(label, value, helper = '') {
  const safeLabel = escapeHtml(label);
  const safeValue = escapeHtml(value);
  const helperHtml = helper ? `<span class="metric-helper">${escapeHtml(helper)}</span>` : '';
  return `
    <div class="metric-card">
      <span class="metric-label">${safeLabel}</span>
      <span class="metric-value">${safeValue}</span>
      ${helperHtml}
    </div>
  `;
}

function buildPlantInfo(plant) {
  if (!plant) return 'n/d';
  const name = plant?.nome ? escapeHtml(plant.nome) : 'Impianto principale';
  const power = toNumber(plant?.potenza_kwp ?? plant?.potenza_kw ?? plant?.potenza);
  const powerLabel = Number.isFinite(power) && power > 0 ? formatPower(power) : '';
  return powerLabel ? `${name} · ${powerLabel}` : name;
}

function formatPower(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const digits = value < 10 ? 2 : 1;
  const formatted = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${formatted} kW`;
}

function formatKwh(value) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const abs = Math.abs(value);
  const digits = abs >= 10000 ? 0 : abs >= 1000 ? 1 : 2;
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCurrency(value, options = {}) {
  if (!Number.isFinite(value)) return '€0,00';
  const minimumFractionDigits = typeof options.minimumFractionDigits === 'number'
    ? options.minimumFractionDigits
    : 2;
  const maximumFractionDigits = typeof options.maximumFractionDigits === 'number'
    ? options.maximumFractionDigits
    : 2;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  const ratio = Math.min(Math.max(value, 0), 1);
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(ratio);
}

function formatTons(value) {
  if (!Number.isFinite(value)) return '0,00';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function estimateAnnualProduction(plants = []) {
  if (!Array.isArray(plants) || plants.length === 0) return 0;
  return plants.reduce((total, plant) => {
    const power = toNumber(plant?.potenza_kwp ?? plant?.potenza_kw ?? plant?.potenza);
    if (Number.isFinite(power) && power > 0) {
      return total + power * 1200;
    }
    return total;
  }, 0);
}

function resolveShareQuota(cer = {}) {
  const candidates = [cer?.quota_condivisa, cer?.quota, cer?.share, cer?.quota_share];
  for (const candidate of candidates) {
    const numeric = toNumber(typeof candidate === 'string' ? candidate.replace('%', '') : candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      const ratio = numeric > 1 ? numeric / 100 : numeric;
      if (ratio > 0) {
        return Math.min(ratio, 1);
      }
    }
  }
  return 0.35;
}

function resolveConsumption(customer = {}, cer = {}, fallbackProduction = 0) {
  const candidates = [
    customer?.consumo_annuo_kwh,
    customer?.consumo_annuo,
    customer?.consumo,
    customer?.fabbisogno_annuo,
    cer?.consumo_annuo,
    cer?.fabbisogno_annuo,
    cer?.baseline_consumo,
  ];
  for (const candidate of candidates) {
    const numeric = toNumber(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  if (Number.isFinite(fallbackProduction) && fallbackProduction > 0) {
    return fallbackProduction * 0.85;
  }
  return 3500;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9,.-]/g, '').replace(/,/g, '.');
    if (!normalized) return NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
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
    if (isDryRunResult(res, data)) {
      feedbackBox.textContent = 'SAFE MODE attivo: caricamento documento simulato, nessun URL generato.';
      toast('SAFE MODE attivo: caricamento documento in dry-run.');
      return;
    }
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
