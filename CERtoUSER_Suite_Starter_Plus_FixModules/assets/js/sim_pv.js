const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const number = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const percentFmt = new Intl.NumberFormat('it-IT', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

let activeScenario = 'base';

const scenarioOrder = ['base', 'pnrr', 'irpef', 'cer', 'piva', 'pivacer'];

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const normalized = String(value).replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function num(selector) {
  const el = qs(selector);
  if (!el) return 0;
  return parseNumber(el.value);
}

function getBool(selector) {
  const el = qs(selector);
  return !!el && el.checked;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return '€ 0,00';
  return euro.format(value);
}

function formatYears(value) {
  if (!Number.isFinite(value)) return 'n.d.';
  return `${number.format(value)} anni`;
}

function formatIrr(value) {
  if (!Number.isFinite(value)) return 'n.d.';
  return percentFmt.format(value);
}

function sanitizeInputs() {
  const percentFields = [
    '#pv_degrado',
    '#pv_autoconsumo',
    '#pv_inflazione',
    '#pv_cer_perc',
    '#pv_tasso',
    '#pv_pnrr_grant',
    '#pv_irpef',
    '#pv_tax',
  ];

  percentFields.forEach((selector) => {
    const el = qs(selector);
    if (!el) return;
    const value = clamp(parseNumber(el.value || 0), 0, 100);
    if (value !== parseNumber(el.value || 0)) {
      el.value = value;
    }
  });

  const positiveFields = [
    '#pv_kw',
    '#pv_capex',
    '#pv_opex',
    '#pv_prod_specific',
    '#pv_price',
    '#pv_cer_costi',
    '#pv_cer_kwh',
    '#cer_incentivo',
    '#cer_premio',
    '#cer_zona',
  ];

  positiveFields.forEach((selector) => {
    const el = qs(selector);
    if (!el) return;
    const raw = parseNumber(el.value || 0);
    const value = Math.max(0, raw);
    if (value !== raw) el.value = value;
  });

  const horizonInput = qs('#pv_orizzonte');
  if (horizonInput) {
    const raw = parseNumber(horizonInput.value || 0);
    const value = clamp(Math.round(raw || 0), 1, 30);
    if (value !== raw) horizonInput.value = value;
  }

  const ammInput = qs('#pv_ammortamento');
  if (ammInput) {
    const raw = parseNumber(ammInput.value || 0);
    const value = clamp(Math.round(raw || 0), 1, 20);
    if (value !== raw) ammInput.value = value;
  }
}

function gatherFlags() {
  return {
    pnrr: getBool('#chk_pnrr'),
    irpef: getBool('#chk_irpef'),
    cer: getBool('#chk_cer') || getBool('#chk_piva_cer'),
    piva: getBool('#chk_piva') || getBool('#chk_piva_cer'),
    pivaCer: getBool('#chk_piva_cer'),
  };
}

function computeInputs(flags) {
  sanitizeInputs();

  const inputs = {
    potenza: num('#pv_kw'),
    capex: num('#pv_capex'),
    opex: num('#pv_opex'),
    prodSpecific: num('#pv_prod_specific'),
    degrado: clamp(num('#pv_degrado'), 0, 100) / 100,
    autoconsumo: clamp(num('#pv_autoconsumo'), 0, 100) / 100,
    prezzoEnergia: num('#pv_price'),
    inflazione: clamp(num('#pv_inflazione'), 0, 100) / 100,
    cerCosti: num('#pv_cer_costi'),
    cerKwh: num('#pv_cer_kwh'),
    cerPerc: clamp(num('#pv_cer_perc'), 0, 100) / 100,
    degradaCer: getBool('#chk_cer_degrada'),
    orizzonte: clamp(Math.round(num('#pv_orizzonte') || 0), 1, 30),
    tassoSconto: clamp(num('#pv_tasso'), 0, 100) / 100,
    pnrrGrant: clamp(num('#pv_pnrr_grant'), 0, 100) / 100,
    irpefAliquota: clamp(num('#pv_irpef'), 0, 100) / 100,
    taxAliquota: clamp(num('#pv_tax'), 0, 100) / 100,
    ammortamento: clamp(Math.round(num('#pv_ammortamento') || 0), 1, 20),
    cerIncentivo: Math.max(0, num('#cer_incentivo')),
    cerPremio: Math.max(0, num('#cer_premio')),
    cerZona: Math.max(0, num('#cer_zona')),
  };

  const produzioneAnnua = inputs.potenza * inputs.prodSpecific;
  inputs.produzioneAnnua = produzioneAnnua;

  const cerBaseTotal = inputs.cerIncentivo + inputs.cerPremio + inputs.cerZona;
  const cerEffectiveIncentive = flags.pnrr ? inputs.cerIncentivo * 0.5 : inputs.cerIncentivo;
  const tariffaCER = Math.max(0, cerEffectiveIncentive) + Math.max(0, inputs.cerPremio) + Math.max(0, inputs.cerZona);

  return {
    ...inputs,
    cerBaseTotal,
    cerEffectiveIncentive,
    tariffaCER,
  };
}

function buildBaseData(inputs) {
  const { orizzonte } = inputs;
  const baseFlows = new Array(orizzonte + 1).fill(0);
  const cerFlows = new Array(orizzonte + 1).fill(0);
  const irpefFlows = new Array(orizzonte + 1).fill(0);
  const pivaFlows = new Array(orizzonte + 1).fill(0);

  let produzione = inputs.produzioneAnnua;
  const produzioneYear1 = produzione;

  for (let year = 1; year <= orizzonte; year += 1) {
    if (year > 1) {
      produzione *= (1 - inputs.degrado);
    }

    const prezzo = inputs.prezzoEnergia * (1 + inputs.inflazione) ** (year - 1);
    const autoconsumoKwh = produzione * inputs.autoconsumo;
    const saving = autoconsumoKwh * prezzo;
    baseFlows[year] = saving - inputs.opex;

    let cerKwh = 0;
    if (inputs.cerPerc > 0) {
      cerKwh = produzione * inputs.cerPerc;
    } else if (inputs.cerKwh > 0) {
      if (inputs.degradaCer && produzioneYear1 > 0) {
        cerKwh = inputs.cerKwh * (produzione / produzioneYear1);
      } else {
        cerKwh = inputs.cerKwh;
      }
    }

    const ricavoCer = cerKwh * inputs.tariffaCER - inputs.cerCosti;
    cerFlows[year] = ricavoCer;
  }

  const detrazioneAnnua = (inputs.capex * 0.5) / 10;
  for (let year = 1; year <= Math.min(inputs.orizzonte, 10); year += 1) {
    irpefFlows[year] = detrazioneAnnua * inputs.irpefAliquota;
  }

  const ammQuota = inputs.capex / inputs.ammortamento;
  for (let year = 1; year <= Math.min(inputs.orizzonte, inputs.ammortamento); year += 1) {
    pivaFlows[year] = ammQuota * inputs.taxAliquota;
  }

  return {
    baseFlows,
    cerFlows,
    irpefFlows,
    pivaFlows,
  };
}

function npv(rate, flows) {
  return flows.reduce((acc, value, index) => acc + value / (1 + rate) ** index, 0);
}

function irr(flows) {
  const hasPositive = flows.some((v) => v > 0);
  const hasNegative = flows.some((v) => v < 0);
  if (!hasPositive || !hasNegative) {
    return Number.NaN;
  }

  let low = -0.99;
  let high = 1.5;
  let guess = 0;

  for (let i = 0; i < 100; i += 1) {
    guess = (low + high) / 2;
    const value = npv(guess, flows);
    if (Math.abs(value) < 1e-6) {
      return guess;
    }
    if (value > 0) {
      low = guess;
    } else {
      high = guess;
    }
  }

  return guess;
}

function payback(flows) {
  let cumulative = 0;
  for (let year = 0; year < flows.length; year += 1) {
    const value = flows[year];
    cumulative += value;
    if (cumulative >= 0) {
      if (year === 0) return 0;
      const prevCumulative = cumulative - value;
      const fraction = value === 0 ? 0 : (0 - prevCumulative) / value;
      return year - 1 + clamp(fraction, 0, 1);
    }
  }
  return Number.NaN;
}

function discountedPayback(flows, rate) {
  let cumulative = 0;
  for (let year = 0; year < flows.length; year += 1) {
    const discounted = flows[year] / (1 + rate) ** year;
    cumulative += discounted;
    if (cumulative >= 0) {
      if (year === 0) return 0;
      const prevCumulative = cumulative - discounted;
      const fraction = discounted === 0 ? 0 : (0 - prevCumulative) / discounted;
      return year - 1 + clamp(fraction, 0, 1);
    }
  }
  return Number.NaN;
}

function computeScenario(inputs, baseData, options) {
  const { includeCer = false, includePnrr = false, includeIrpef = false, includePiva = false } = options;
  const flows = new Array(inputs.orizzonte + 1).fill(0);
  const capexNet = includePnrr ? inputs.capex * (1 - inputs.pnrrGrant) : inputs.capex;

  flows[0] = -capexNet;

  for (let year = 1; year <= inputs.orizzonte; year += 1) {
    let cash = baseData.baseFlows[year];
    if (includeCer) cash += baseData.cerFlows[year];
    if (includeIrpef) cash += baseData.irpefFlows[year];
    if (includePiva) cash += baseData.pivaFlows[year];
    flows[year] = cash;
  }

  const discountedFlows = flows.map((value, index) => value / (1 + inputs.tassoSconto) ** index);
  const cumulative = flows.reduce((acc, value) => {
    const last = acc.length ? acc[acc.length - 1] : 0;
    acc.push(last + value);
    return acc;
  }, []);
  const cumulativeDiscounted = discountedFlows.reduce((acc, value) => {
    const last = acc.length ? acc[acc.length - 1] : 0;
    acc.push(last + value);
    return acc;
  }, []);

  const metrics = {
    paybackSimple: payback(flows),
    paybackDiscounted: discountedPayback(flows, inputs.tassoSconto),
    npv: cumulativeDiscounted[cumulativeDiscounted.length - 1],
    irr: irr(flows),
  };

  const cashflows = flows.map((value, index) => ({
    year: index,
    value,
    discounted: discountedFlows[index],
    cumulative: cumulative[index],
  }));

  return {
    enabled: true,
    metrics,
    cashflows,
  };
}

function renderScenario(key, result, messageWhenDisabled) {
  const panel = qs(`[data-scenario-panel="${key}"]`);
  if (!panel) return;
  const messageEl = panel.querySelector('[data-scenario-message]');
  const kpiGrid = panel.querySelector('.kpi-grid');
  const tableWrap = panel.querySelector('.table-wrap');

  if (!result || !result.enabled) {
    if (messageEl) {
      messageEl.textContent = messageWhenDisabled;
      messageEl.hidden = false;
    }
    if (kpiGrid) kpiGrid.hidden = true;
    if (tableWrap) tableWrap.hidden = true;
    return;
  }

  if (messageEl) messageEl.hidden = true;
  if (kpiGrid) kpiGrid.hidden = false;
  if (tableWrap) tableWrap.hidden = false;

  if (kpiGrid) {
    const { metrics } = result;
    const map = {
      'payback-simple': formatYears(metrics.paybackSimple),
      'payback-discounted': formatYears(metrics.paybackDiscounted),
      npv: formatCurrency(metrics.npv),
      irr: formatIrr(metrics.irr),
    };
    Object.entries(map).forEach(([metric, value]) => {
      const el = kpiGrid.querySelector(`[data-metric="${metric}"]`);
      if (el) el.textContent = value;
    });
  }

  if (tableWrap) {
    const tbody = tableWrap.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = result.cashflows
        .map((row) => `
          <tr>
            <td>${row.year}</td>
            <td>${formatCurrency(row.value)}</td>
            <td>${formatCurrency(row.discounted)}</td>
            <td>${formatCurrency(row.cumulative)}</td>
          </tr>
        `)
        .join('');
    }
  }
}

function updateScenarioTabs(results) {
  const buttons = qsa('[data-scenario-tab]');
  buttons.forEach((btn) => {
    const key = btn.getAttribute('data-scenario-tab');
    const result = results[key];
    if (!result || !result.enabled) {
      btn.setAttribute('disabled', 'disabled');
      btn.classList.add('disabled');
      if (activeScenario === key) {
        activeScenario = 'base';
      }
    } else {
      btn.removeAttribute('disabled');
      btn.classList.remove('disabled');
    }
  });

  setActiveScenario(activeScenario);
}

function setActiveScenario(key) {
  const panels = qsa('[data-scenario-panel]');
  const buttons = qsa('[data-scenario-tab]');
  const target = scenarioOrder.includes(key) ? key : 'base';
  activeScenario = target;

  buttons.forEach((btn) => {
    const keyBtn = btn.getAttribute('data-scenario-tab');
    btn.classList.toggle('active', keyBtn === target);
  });

  panels.forEach((panel) => {
    const keyPanel = panel.getAttribute('data-scenario-panel');
    panel.classList.toggle('active', keyPanel === target);
  });
}

function updateUi(flags, inputs) {
  const pnrrConflict = getBool('#chk_pnrr') && getBool('#chk_irpef');
  const badgeConflict = qs('#badge-pnrr-irpef');
  if (badgeConflict) badgeConflict.hidden = !pnrrConflict;

  const badgePnrr = qs('#badge-pnrr-incentivo');
  if (badgePnrr) badgePnrr.hidden = !flags.pnrr;

  const cerInputs = qs('#cer-inputs-card');
  const cerEnergy = qs('#cer-energy-card');
  if (cerInputs) cerInputs.hidden = !flags.cer;
  if (cerEnergy) cerEnergy.hidden = !flags.cer;

  const tariffTotalEl = qs('#cer-tariff-total');
  if (tariffTotalEl) tariffTotalEl.textContent = formatCurrency(inputs.cerBaseTotal);

  const tariffEffectiveEl = qs('#tariffa-cer-label');
  if (tariffEffectiveEl) tariffEffectiveEl.textContent = formatCurrency(inputs.tariffaCER);

  const cerBadge = qs('#pv-tariff-info');
  if (cerBadge) cerBadge.hidden = !flags.cer;
}

function computeResults(flags, inputs, baseData) {
  const baseIncludesPiva = flags.piva && !flags.cer && !flags.pnrr && !flags.irpef && !flags.pivaCer;

  const results = {
    base: computeScenario(inputs, baseData, {
      includeCer: false,
      includePnrr: false,
      includeIrpef: false,
      includePiva: baseIncludesPiva,
    }),
  };

  results.pnrr = flags.pnrr
    ? computeScenario(inputs, baseData, {
        includeCer: flags.cer,
        includePnrr: true,
        includeIrpef: false,
        includePiva: false,
      })
    : { enabled: false };

  results.irpef = flags.irpef
    ? computeScenario(inputs, baseData, {
        includeCer: false,
        includePnrr: false,
        includeIrpef: true,
        includePiva: false,
      })
    : { enabled: false };

  results.cer = flags.cer
    ? computeScenario(inputs, baseData, {
        includeCer: true,
        includePnrr: false,
        includeIrpef: false,
        includePiva: false,
      })
    : { enabled: false };

  results.piva = flags.piva
    ? computeScenario(inputs, baseData, {
        includeCer: false,
        includePnrr: false,
        includeIrpef: false,
        includePiva: true,
      })
    : { enabled: false };

  results.pivacer = flags.piva && flags.cer
    ? computeScenario(inputs, baseData, {
        includeCer: true,
        includePnrr: false,
        includeIrpef: false,
        includePiva: true,
      })
    : { enabled: false };

  return results;
}

function renderResults(results) {
  renderScenario('base', results.base, 'Lo scenario base considera solo risparmi da autoconsumo e OPEX.');
  renderScenario('pnrr', results.pnrr, 'Attiva il flag PNRR per sbloccare questo scenario.');
  renderScenario('irpef', results.irpef, 'Attiva il flag IRPEF 50% per calcolare la detrazione.');
  renderScenario('cer', results.cer, 'Attiva il flag CER per includere ricavi e costi CER.');
  renderScenario('piva', results.piva, 'Attiva il flag Soggetto P.IVA per calcolare ammortamenti e tax shield.');
  renderScenario('pivacer', results.pivacer, 'Attiva il flag P.IVA + CER per sommare tax shield e ricavi CER.');
  updateScenarioTabs(results);
}

function simulate() {
  const flags = gatherFlags();
  const inputs = computeInputs(flags);
  const baseData = buildBaseData(inputs);
  updateUi(flags, inputs);
  const results = computeResults(flags, inputs, baseData);
  renderResults(results);
}

function setupTabs() {
  const mainTabs = qsa('#simulatori-tabs .tab-btn');
  mainTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (!tab) return;
      mainTabs.forEach((other) => other.classList.toggle('active', other === btn));
      qsa('[data-panel]').forEach((panel) => {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === tab);
      });
    });
  });

  const scenarioButtons = qsa('[data-scenario-tab]');
  scenarioButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('disabled')) return;
      const key = btn.getAttribute('data-scenario-tab');
      setActiveScenario(key);
    });
  });
}

function setupInputs() {
  const inputs = qsa('#pv-input-card input');
  inputs.forEach((input) => {
    input.addEventListener('input', () => simulate());
    input.addEventListener('change', () => simulate());
  });

  const flags = ['#chk_pnrr', '#chk_irpef', '#chk_cer', '#chk_piva', '#chk_piva_cer'];
  flags.forEach((selector) => {
    const el = qs(selector);
    if (!el) return;
    el.addEventListener('change', (event) => {
      if (selector === '#chk_piva_cer') {
        const checked = event.target.checked;
        if (checked) {
          const chkPiva = qs('#chk_piva');
          const chkCer = qs('#chk_cer');
          if (chkPiva) chkPiva.checked = true;
          if (chkCer) chkCer.checked = true;
        }
      }
      simulate();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupInputs();
  simulate();
});
