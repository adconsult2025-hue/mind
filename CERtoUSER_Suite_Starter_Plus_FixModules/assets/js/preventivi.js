import { safeGuardAction, isDryRunResult } from './safe.js';

const TYPE_OPTIONS = ['CER Setup', 'Grant', 'Fotovoltaico', 'Servizi', 'Combinato'];
const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] || char);
}

function sanitizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveType(prefill) {
  const provided = typeof prefill.type === 'string' ? prefill.type : '';
  return TYPE_OPTIONS.includes(provided) ? provided : TYPE_OPTIONS[0];
}

function showToast(message) {
  if (!message) return;
  try {
    const evt = new CustomEvent('cer:notify', { detail: message });
    window.dispatchEvent(evt);
  } catch (error) {
    console.info(message);
  }
}

export function openPreventivoWizard(prefill = {}) {
  const selectedType = resolveType(prefill);
  const clientNameValue = escapeHtml(prefill.client_name || '');
  const cabinaValue = escapeHtml(prefill.cabina || '');
  const kwpValue = sanitizeNumber(prefill.kwp, 80);
  const validDays = sanitizeNumber(prefill.valid_days, 30);
  const noteValue = escapeHtml(prefill.note || '');
  const optionsHtml = TYPE_OPTIONS
    .map((type) => `<option value="${escapeHtml(type)}"${type === selectedType ? ' selected' : ''}>${escapeHtml(type)}</option>`)
    .join('');

  const root = document.createElement('div');
  root.className = 'preventivo-wizard-overlay';
  root.innerHTML = `
    <div class="preventivo-wizard" role="dialog" aria-modal="true" aria-label="Nuovo preventivo">
      <div class="preventivo-wizard-header">
        <h3>Nuovo preventivo</h3>
        <button class="close" type="button" aria-label="Chiudi">&times;</button>
      </div>
      <div class="preventivo-wizard-body">
        <label>Cliente
          <input id="q-client-name" placeholder="Ragione sociale" value="${clientNameValue}" autocomplete="organization" />
        </label>
        <label>Tipo
          <select id="q-type">${optionsHtml}</select>
        </label>
        <label>Cabina primaria
          <input id="q-cabina" placeholder="Codice cabina" value="${cabinaValue}" autocomplete="off" />
        </label>
        <label>Potenza prevista (kWp)
          <input id="q-kwp" type="number" min="1" step="0.1" value="${escapeHtml(String(kwpValue))}" />
        </label>
        <label>Validità (giorni)
          <input id="q-valid" type="number" min="1" max="180" value="${escapeHtml(String(validDays))}" />
        </label>
        <label>Note
          <textarea id="q-note" rows="3" placeholder="Note opzionali...">${noteValue}</textarea>
        </label>
        <p id="q-feedback" class="preventivo-wizard-feedback" role="status" aria-live="polite" hidden></p>
      </div>
      <div class="preventivo-wizard-footer">
        <button class="secondary close" type="button">Annulla</button>
        <button id="q-genera" class="primary" type="button">Genera preventivo</button>
      </div>
    </div>
  `;

  const previouslyFocused = document.activeElement;
  const feedbackEl = root.querySelector('#q-feedback');
  const setFeedback = (message, tone = 'neutral') => {
    if (!feedbackEl) return;
    if (!message) {
      feedbackEl.textContent = '';
      feedbackEl.hidden = true;
      feedbackEl.classList.remove('error', 'success');
      return;
    }
    feedbackEl.textContent = message;
    feedbackEl.hidden = false;
    feedbackEl.classList.remove('error', 'success');
    if (tone === 'error') feedbackEl.classList.add('error');
    if (tone === 'success') feedbackEl.classList.add('success');
  };

  const close = () => {
    window.removeEventListener('keydown', onKeydown);
    root.remove();
    setFeedback('', 'neutral');
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  };

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  document.body.appendChild(root);
  window.addEventListener('keydown', onKeydown);

  const firstInput = root.querySelector('#q-client-name');
  if (firstInput && typeof firstInput.focus === 'function') {
    setTimeout(() => firstInput.focus(), 0);
  }

  root.addEventListener('click', (event) => {
    if (event.target === root) {
      close();
    }
  });
  root.querySelectorAll('.close').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      close();
    });
  });

  const generateBtn = root.querySelector('#q-genera');
  const typeSelect = root.querySelector('#q-type');
  const kwpInput = root.querySelector('#q-kwp');
  const validInput = root.querySelector('#q-valid');
  const cabinaInput = root.querySelector('#q-cabina');
  const noteInput = root.querySelector('#q-note');
  const clientNameInput = root.querySelector('#q-client-name');

  generateBtn?.addEventListener('click', async () => {
    if (!generateBtn || generateBtn.disabled) return;
    setFeedback('', 'neutral');

    const clientName = clientNameInput?.value.trim() || prefill.client_name || '';
    if (!clientName) {
      setFeedback('Inserisci il nome o la ragione sociale del cliente.', 'error');
      clientNameInput?.focus();
      return;
    }

    const kwp = sanitizeNumber(kwpInput?.value, NaN);
    if (!Number.isFinite(kwp) || kwp <= 0) {
      setFeedback('Indica una potenza kWp valida maggiore di zero.', 'error');
      kwpInput?.focus();
      return;
    }

    const validity = sanitizeNumber(validInput?.value, 30);
    if (!Number.isFinite(validity) || validity <= 0) {
      setFeedback('La validità deve essere un numero di giorni positivo.', 'error');
      validInput?.focus();
      return;
    }

    const type = typeSelect?.value || selectedType;
    const cabina = cabinaInput?.value.trim() || prefill.cabina || null;
    const note = noteInput?.value.trim() || null;

    const computeValidUntil = () => {
      const days = Number.isFinite(validity) ? Math.max(Math.floor(validity), 1) : 30;
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString().slice(0, 10);
    };

    const payload = {
      type,
      client_id: prefill.client_id || null,
      client_name: clientName,
      cabina,
      kwp,
      iva_default: 22,
      valid_until: computeValidUntil(),
      note,
      items: Array.isArray(prefill.items) && prefill.items.length ? prefill.items : [
        { sku: 'S-LIC-KWP-Y1', name: 'Licenza CER kWp (Y1)', unit: 'kWp', price: 75, discount: 0, qty: kwp, category: 'Servizi' },
        { sku: 'S-CER-SET', name: 'Setup CER base', unit: 'pz', price: 2500, discount: 0, qty: 1, category: 'Servizi' }
      ],
      totals: { imponibile: 0, iva: 0, totale: 0 },
      context: {
        client_name: clientName,
        note,
        cabina,
        kwp,
        due: computeValidUntil(),
        cer_id: prefill.cer_id || null,
        cer_name: prefill.cer_name || null,
        cer_quota: prefill.cer_quota || null,
        cer_trader: prefill.cer_trader || null,
        client_pod: prefill.client_pod || null,
        origin: 'modelli-contratti'
      }
    };

    const originalLabel = generateBtn.textContent;
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generazione...';

    try {
      const response = await safeGuardAction(() => fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }));
      let data;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }

      if (isDryRunResult(response, data)) {
        generateBtn.disabled = false;
        generateBtn.textContent = originalLabel;
        setFeedback('SAFE MODE attivo: creazione preventivo simulata, nessun codice reale generato.', 'success');
        showToast('SAFE MODE: preventivo simulato in modalità demo.');
        return;
      }

      if (!response.ok || !data || data.ok === false) {
        const errorMessage = data?.error?.message || data?.error || response.statusText || 'Errore durante la creazione del preventivo';
        throw new Error(errorMessage);
      }

      const code = data?.data?.code || data?.data?.id;
      showToast('Preventivo creato con successo.');
      close();
      if (code) {
        window.location.href = `/modules/preventivi/editor.html?id=${encodeURIComponent(code)}`;
      }
    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Errore durante la creazione del preventivo.', 'error');
      showToast(error.message || 'Errore creazione preventivo');
      generateBtn.disabled = false;
      generateBtn.textContent = originalLabel;
    }
  });
}
