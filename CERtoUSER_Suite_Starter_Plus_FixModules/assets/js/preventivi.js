const CURRENCY = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
});

const PERCENT = new Intl.NumberFormat('it-IT', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const STATUS_CONFIG = {
  draft: { label: 'Bozza', badgeClass: 'muted' },
  review: { label: 'In revisione', badgeClass: 'warn' },
  sent: { label: 'Inviato', badgeClass: 'info' },
  approved: { label: 'Approvato', badgeClass: '' },
  signed: { label: 'Firmato', badgeClass: '' },
  rejected: { label: 'Respinto', badgeClass: 'error' },
  expired: { label: 'Scaduto', badgeClass: 'error' }
};

const FILTERS = {
  all: () => true,
  pipeline: (quote) => ['draft', 'review', 'sent'].includes(quote.status),
  won: (quote) => ['approved', 'signed'].includes(quote.status),
  lost: (quote) => ['rejected', 'expired'].includes(quote.status)
};

const QUOTES = [
  {
    id: 'PRV-2025-001',
    customer: 'Comune di Bergamo',
    segment: 'PA / ETS',
    scope: 'CER + Fotovoltaico 110 kWp',
    amount: 24800,
    probability: 0.82,
    status: 'approved',
    createdAt: '2025-02-12',
    updatedAt: '2025-03-18',
    expiresAt: '2025-04-15',
    owner: 'Laura Bianchi',
    source: 'Simulatori CER',
    notes: 'Delibera consiliare prevista il 27 marzo. Aggiornare piano economico con CAPEX definitivo.',
    actions: [
      { label: 'Inviare schema di convenzione e piano economico', owner: 'Laura Bianchi', date: '2025-03-20' },
      { label: 'Coordinare call con ufficio tecnico per conferma POD', owner: 'Team CER', date: '2025-03-25' }
    ],
    history: [
      { date: '2025-03-18', label: 'Aggiornati CAPEX/OPEX con listini 2025' },
      { date: '2025-03-05', label: 'Presentazione in videoconferenza e invio preventivo firmabile' },
      { date: '2025-02-14', label: 'Importati dati da CRM e simulatore CER' }
    ]
  },
  {
    id: 'PRV-2025-007',
    customer: 'Residenza Aurora Srl',
    segment: 'Privato > Condominio',
    scope: 'Pompa di calore CT3 + FV 40 kWp',
    amount: 18650,
    probability: 0.64,
    status: 'review',
    createdAt: '2025-02-28',
    updatedAt: '2025-03-16',
    expiresAt: '2025-03-30',
    owner: 'Giulio Pini',
    source: 'CRM → Opportunità',
    notes: 'Amministratore condominiale in attesa di conferma riparto quote tra 18 unità abitative.',
    actions: [
      { label: 'Ricevere bozza di delibera assembleare', owner: 'Amministratore', date: '2025-03-22' },
      { label: 'Allineare anagrafiche POD con modulo CRM', owner: 'Giulio Pini', date: '2025-03-24' }
    ],
    history: [
      { date: '2025-03-16', label: 'Aggiornata proposta economica con conto termico' },
      { date: '2025-03-10', label: 'Inviato preventivo e simulazione payback' },
      { date: '2025-03-01', label: 'Inserita opportunità dal CRM' }
    ]
  },
  {
    id: 'PRV-2025-010',
    customer: 'Officine Verdi Spa',
    segment: 'Impresa manifatturiera',
    scope: 'Revamping impianto + storage 500 kWh',
    amount: 84500,
    probability: 0.35,
    status: 'sent',
    createdAt: '2025-03-08',
    updatedAt: '2025-03-17',
    expiresAt: '2025-04-05',
    owner: 'Marta Colombo',
    source: 'Simulatori FV',
    notes: 'Richiesta integrazione garanzie bancarie per finanziamento leasing.',
    actions: [
      { label: 'Inviare analisi di fattibilità storage', owner: 'Marta Colombo', date: '2025-03-21' },
      { label: 'Coordinare visita in sito con fornitore storage', owner: 'Ufficio Tecnico', date: '2025-03-26' }
    ],
    history: [
      { date: '2025-03-17', label: 'Preventivo inviato al CFO' },
      { date: '2025-03-12', label: 'Allineamento interno su condizioni economiche' },
      { date: '2025-03-09', label: 'Output simulatore fotovoltaico e storage' }
    ]
  },
  {
    id: 'PRV-2025-003',
    customer: 'Comune di Lecco',
    segment: 'PA / ETS',
    scope: 'Impianto FV scuole + CER',
    amount: 29850,
    probability: 0.0,
    status: 'expired',
    createdAt: '2024-12-15',
    updatedAt: '2025-02-03',
    expiresAt: '2025-02-15',
    owner: 'Laura Bianchi',
    source: 'Import Preventivi legacy',
    notes: 'Preventivo scaduto: rifare proposta con nuovi criteri CT3.0 e prezzi aggiornati.',
    actions: [],
    history: [
      { date: '2025-02-03', label: 'Preventivo scaduto senza feedback' },
      { date: '2025-01-20', label: 'Follow-up telefonico senza risposta' },
      { date: '2024-12-16', label: 'Preventivo inviato via PEC' }
    ]
  }
];

let currentFilter = 'pipeline';
let selectedQuoteId = null;

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  elements.tableBody = document.querySelector('#preventivi-table tbody');
  elements.metrics = document.getElementById('preventivi-metrics');
  elements.count = document.getElementById('preventivi-count');
  elements.detail = document.getElementById('preventivo-detail');
  elements.detailContent = document.getElementById('preventivo-content');
  elements.detailEmpty = document.getElementById('preventivo-empty');
  elements.status = document.getElementById('preventivo-status');
  elements.probability = document.getElementById('preventivo-probability');
  elements.validity = document.getElementById('preventivo-validity');
  elements.subtitle = document.getElementById('preventivo-subtitle');
  elements.customer = document.getElementById('preventivo-customer');
  elements.segment = document.getElementById('preventivo-segment');
  elements.scope = document.getElementById('preventivo-scope');
  elements.amount = document.getElementById('preventivo-amount');
  elements.owner = document.getElementById('preventivo-owner');
  elements.updated = document.getElementById('preventivo-updated');
  elements.actions = document.getElementById('preventivo-actions');
  elements.history = document.getElementById('preventivo-history');
  elements.notes = document.getElementById('preventivo-notes');

  bindFilters();
  bindCTA();
  renderMetrics();
  renderTable();
});

function bindFilters() {
  const buttons = document.querySelectorAll('[data-filter]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.getAttribute('data-filter');
      if (!value || value === currentFilter) return;
      currentFilter = value;
      buttons.forEach((btn) => btn.classList.toggle('active', btn === button));
      renderTable();
    });
    button.classList.toggle('active', button.getAttribute('data-filter') === currentFilter);
  });
}

function bindCTA() {
  const notify = (message) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cer:notify', { detail: message }));
    }
  };

  document.getElementById('btn-new-quote')?.addEventListener('click', () => {
    notify('La creazione del preventivo aprirà il flusso CRM → Modelli nella versione completa.');
  });

  document.getElementById('btn-export-preventivi')?.addEventListener('click', () => {
    notify('Export CSV disponibile nella release Netlify con backend connesso.');
  });
}

function renderMetrics() {
  if (!elements.metrics) return;
  const activeQuotes = QUOTES.filter((quote) => !FILTERS.lost(quote));
  const pipelineQuotes = QUOTES.filter(FILTERS.pipeline);

  const weightedValue = pipelineQuotes.reduce((total, quote) => total + quote.amount * quote.probability, 0);
  const averageProbability = activeQuotes.length
    ? activeQuotes.reduce((total, quote) => total + quote.probability, 0) / activeQuotes.length
    : 0;

  const closingSoon = activeQuotes.filter((quote) => {
    if (!quote.expiresAt) return false;
    const diff = daysBetween(new Date(), new Date(quote.expiresAt));
    return diff >= 0 && diff <= 21;
  }).length;

  elements.metrics.innerHTML = `
    <div class="metric-card">
      <span>Preventivi attivi</span>
      <strong>${activeQuotes.length}</strong>
    </div>
    <div class="metric-card">
      <span>Valore ponderato pipeline</span>
      <strong>${CURRENCY.format(Math.round(weightedValue))}</strong>
    </div>
    <div class="metric-card">
      <span>Probabilità media</span>
      <strong>${PERCENT.format(averageProbability)}</strong>
    </div>
    <div class="metric-card">
      <span>Scadenze entro 21 giorni</span>
      <strong>${closingSoon}</strong>
    </div>
  `;
}

function renderTable() {
  if (!elements.tableBody) return;
  const filterFn = FILTERS[currentFilter] || FILTERS.all;
  const filtered = QUOTES.filter(filterFn).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (filtered.length === 0) {
    elements.tableBody.innerHTML = '<tr><td colspan="7">Nessun preventivo in questa vista.</td></tr>';
    elements.count.textContent = 'Nessun preventivo da mostrare.';
    renderDetail(null);
    return;
  }

  const rows = filtered
    .map((quote) => {
      const status = formatStatus(quote.status);
      const probability = PERCENT.format(quote.probability || 0);
      return `
        <tr data-quote-id="${quote.id}">
          <td>${quote.id}</td>
          <td>
            <strong>${quote.customer}</strong><br/>
            <small>${quote.segment}</small>
          </td>
          <td>${quote.scope}</td>
          <td>${CURRENCY.format(quote.amount)}</td>
          <td>${probability}</td>
          <td>
            <span class="status-badge${status.badgeClass ? ` ${status.badgeClass}` : ''}">${status.label}</span>
          </td>
          <td>${formatDate(quote.updatedAt)}</td>
        </tr>
      `;
    })
    .join('');

  elements.tableBody.innerHTML = rows;
  elements.count.textContent = `${filtered.length} preventivi mostrati su ${QUOTES.length} totali.`;

  elements.tableBody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      const quoteId = row.getAttribute('data-quote-id');
      if (!quoteId) return;
      selectedQuoteId = quoteId;
      highlightSelectedRow(quoteId);
      const quote = QUOTES.find((item) => item.id === quoteId);
      renderDetail(quote || null);
    });
  });

  const initial = filtered.find((quote) => quote.id === selectedQuoteId) || filtered[0];
  selectedQuoteId = initial?.id ?? null;
  highlightSelectedRow(selectedQuoteId);
  renderDetail(initial || null);
}

function highlightSelectedRow(quoteId) {
  if (!elements.tableBody) return;
  elements.tableBody.querySelectorAll('tr').forEach((row) => {
    const rowId = row.getAttribute('data-quote-id');
    row.classList.toggle('active', !!quoteId && rowId === quoteId);
  });
}

function renderDetail(quote) {
  if (!elements.detailContent || !elements.detailEmpty) return;
  if (!quote) {
    elements.detailContent.hidden = true;
    elements.detailEmpty.hidden = false;
    elements.subtitle.textContent = 'Seleziona un preventivo per vedere stato, importi e prossime azioni.';
    return;
  }

  const status = formatStatus(quote.status);
  elements.status.className = `status-badge${status.badgeClass ? ` ${status.badgeClass}` : ''}`;
  elements.status.textContent = status.label;

  const probability = quote.probability || 0;
  elements.probability.className = 'badge muted';
  elements.probability.textContent = `Probabilità ${PERCENT.format(probability)}`;

  const validityInfo = formatValidity(quote.expiresAt);
  elements.validity.className = `badge${validityInfo.variant ? ` ${validityInfo.variant}` : ''}`;
  elements.validity.textContent = validityInfo.label;

  elements.subtitle.textContent = `Ultimo aggiornamento ${formatDate(quote.updatedAt)} — referente ${quote.owner}.`;
  elements.customer.textContent = quote.customer;
  elements.segment.textContent = quote.segment;
  elements.scope.textContent = quote.scope;
  elements.amount.textContent = CURRENCY.format(quote.amount);
  elements.owner.textContent = quote.owner;
  elements.updated.textContent = formatDate(quote.updatedAt);

  renderList(elements.actions, quote.actions, (action) => `
    <strong>${action.label}</strong>
    <span class="badge muted">Responsabile: ${action.owner}</span>
    <time>Entro ${formatDate(action.date)}</time>
  `, 'Nessuna azione pianificata.');

  renderList(elements.history, quote.history, (event) => `
    <time>${formatDate(event.date)}</time>
    <strong>${event.label}</strong>
  `, 'Nessuna attività registrata.');

  elements.notes.textContent = quote.notes || 'Nessuna nota aggiuntiva.';

  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
}

function renderList(target, items, templateFn, emptyMessage = 'Nessun elemento disponibile.') {
  if (!target) return;
  if (!items || items.length === 0) {
    target.innerHTML = `<li>${emptyMessage}</li>`;
    return;
  }
  target.innerHTML = items.map((item) => `<li>${templateFn(item)}</li>`).join('');
}

function formatStatus(status) {
  const fallback = { label: status ?? '—', badgeClass: 'muted' };
  if (!status) return fallback;
  const config = STATUS_CONFIG[status];
  return config ? config : fallback;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (error) {
    return value;
  }
}

function daysBetween(start, end) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatValidity(value) {
  if (!value) {
    return { label: 'Validità non impostata', variant: 'muted' };
  }
  const today = new Date();
  const target = new Date(value);
  const diff = daysBetween(today, target);
  if (diff < 0) {
    return { label: `Scaduto il ${formatDate(value)}`, variant: 'warn' };
  }
  if (diff <= 7) {
    return { label: `Scade il ${formatDate(value)} (${diff} giorni)`, variant: 'warn' };
  }
  if (diff <= 21) {
    return { label: `Scade il ${formatDate(value)} (${diff} giorni)`, variant: 'badge-accent' };
  }
  return { label: `Valido fino al ${formatDate(value)}`, variant: 'green' };
}
