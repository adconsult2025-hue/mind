const { guard } = require('./_safe');
const { parseBody } = require('./_http');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const CT3_PHASES = [
  { id: 'F0', title: 'F0 — Intake', description: 'Raccolta dati soggetto/immobile, privacy e deleghe iniziali.' },
  { id: 'F1', title: 'F1 — Requisiti soggetto', description: 'Verifica titolarità, autorizzazioni condominiali e autocertificazioni.' },
  { id: 'F2', title: 'F2 — Tecnologia & Catalogo', description: 'Schede tecniche, dichiarazioni di conformità e marcatura CE per l’intervento.' },
  { id: 'F3', title: 'F3 — Titoli & Progetto', description: 'Relazione tecnica, APE se richiesto e dichiarazioni sostitutive.' },
  { id: 'F4', title: 'F4 — Spesa & Richiesta', description: 'Preventivi/fatture, quietanze e domanda GSE con ricevute.' },
  { id: 'F5', title: 'F5 — Erogazione & Rate', description: 'Monitoraggio erogazione incentivo, piano rate e integrazioni GSE.' }
];

const CT3_CATALOG = [
  {
    type: 'pompe_calore',
    label: 'Pompe di calore',
    unit: 'kW',
    min_size: 5,
    max_size: 1000,
    subject_allowed: ['PA/ETS', 'Privato', 'Impresa'],
    requires_catalog: true,
    subtypes: [
      { code: 'aria_acqua', label: 'Aria/Acqua' },
      { code: 'acqua_acqua', label: 'Acqua/Acqua' },
      { code: 'geotermica', label: 'Geotermica' }
    ]
  },
  {
    type: 'biomassa',
    label: 'Biomassa (caldaie/stufe)',
    unit: 'kW',
    min_size: 10,
    max_size: 500,
    subject_allowed: ['PA/ETS', 'Privato', 'Impresa'],
    requires_catalog: true,
    subtypes: [
      { code: 'caldaia', label: 'Caldaia a biomassa' },
      { code: 'stufa', label: 'Stufa a biomassa' }
    ]
  },
  {
    type: 'solare_termico',
    label: 'Solare termico',
    unit: 'm2',
    min_size: 2,
    max_size: 200,
    subject_allowed: ['PA/ETS', 'Privato', 'Impresa'],
    requires_catalog: true,
    subtypes: [
      { code: 'piano', label: 'Collettori piani' },
      { code: 'sottovuoto', label: 'Collettori sottovuoto' }
    ]
  },
  {
    type: 'sistemi_ibridi',
    label: 'Sistemi ibridi',
    unit: 'kW',
    min_size: 5,
    max_size: 200,
    subject_allowed: ['PA/ETS', 'Privato', 'Impresa'],
    requires_catalog: true,
    subtypes: [
      { code: 'pompa_calore_caldaia', label: 'Pompa di calore + caldaia' },
      { code: 'pompa_calore_solare', label: 'Pompa di calore + solare termico' }
    ]
  },
  {
    type: 'regolazione',
    label: 'Sistemi di regolazione/controllo',
    unit: 'kW',
    min_size: 1,
    max_size: 500,
    subject_allowed: ['PA/ETS', 'Privato', 'Impresa'],
    requires_catalog: false,
    subtypes: [
      { code: 'domotica', label: 'Domotica/controllo remoto' },
      { code: 'bacs', label: 'BACS / sistemi di supervisione' }
    ]
  },
  {
    type: 'altro',
    label: 'Altro ammesso da regole',
    unit: 'kW',
    min_size: 1,
    max_size: 500,
    subject_allowed: ['PA/ETS', 'Privato', 'Impresa'],
    requires_catalog: false,
    subtypes: []
  }
];

const BASE_DOCS = [
  { phase: 'F0', code: 'intake_dati', name: 'Modulo raccolta dati soggetto', mandatory: true },
  { phase: 'F0', code: 'privacy', name: 'Informativa privacy firmata', mandatory: true },
  { phase: 'F0', code: 'deleghe', name: 'Deleghe e autorizzazioni', mandatory: false },
  { phase: 'F1', code: 'titolarita', name: 'Titolarità immobile/impianto', mandatory: true },
  { phase: 'F1', code: 'condominio', name: 'Autorizzazioni condominiali (se applicabile)', mandatory: false },
  { phase: 'F1', code: 'autocert', name: 'Autocertificazioni requisiti CT', mandatory: true },
  { phase: 'F2', code: 'scheda_tecnica', name: 'Scheda tecnica tecnologia', mandatory: true },
  { phase: 'F2', code: 'dichiarazione_conformita', name: 'Dichiarazione di conformità', mandatory: true },
  { phase: 'F2', code: 'marcatura_ce', name: 'Marcatura CE', mandatory: true },
  { phase: 'F2', code: 'schemi', name: 'Schemi impianto / layout', mandatory: false },
  { phase: 'F2', code: 'libretto_impianto', name: 'Libretto impianto', mandatory: false },
  { phase: 'F3', code: 'relazione_tecnica', name: 'Relazione tecnica o progetto', mandatory: true },
  { phase: 'F3', code: 'ape', name: 'APE (se richiesto)', mandatory: false },
  { phase: 'F3', code: 'dichiarazioni_sostitutive', name: 'Dichiarazioni sostitutive', mandatory: true },
  { phase: 'F4', code: 'preventivi', name: 'Preventivi o fatture', mandatory: true },
  { phase: 'F4', code: 'quietanze', name: 'Quietanze di pagamento', mandatory: true },
  { phase: 'F4', code: 'domanda_gse', name: 'Domanda GSE (PDF/ricevute)', mandatory: true },
  { phase: 'F5', code: 'esito_gse', name: 'Esito istruttoria GSE', mandatory: true },
  { phase: 'F5', code: 'piano_erogazioni', name: 'Piano erogazioni / rate', mandatory: true },
  { phase: 'F5', code: 'integrazioni', name: 'Eventuali integrazioni richieste', mandatory: false }
];

const SUBJECT_DOCS = {
  'PA/ETS': [
    { phase: 'F0', code: 'atto_nomina', name: 'Atto di nomina responsabile procedura', mandatory: true }
  ],
  Privato: [
    { phase: 'F0', code: 'documento_identita', name: 'Documento identità intestatario', mandatory: true }
  ],
  Impresa: [
    { phase: 'F0', code: 'visura_camerale', name: 'Visura camerale aggiornata', mandatory: true }
  ]
};

const INTERVENTION_DOCS = {
  pompe_calore: [
    { phase: 'F2', code: 'scheda_catalogo', name: 'Scheda a catalogo pompe di calore', mandatory: true },
    { phase: 'F2', code: 'certificazione_pdc', name: 'Certificazioni prestazionali pompe di calore', mandatory: true }
  ],
  biomassa: [
    { phase: 'F2', code: 'scheda_catalogo', name: 'Scheda a catalogo biomassa', mandatory: true },
    { phase: 'F2', code: 'emissioni', name: 'Dichiarazione emissioni / classe ambientale', mandatory: true }
  ],
  solare_termico: [
    { phase: 'F2', code: 'scheda_catalogo', name: 'Scheda a catalogo solare termico', mandatory: true },
    { phase: 'F2', code: 'certificazione_solare', name: 'Certificazione collettori (Solar Keymark)', mandatory: true }
  ],
  sistemi_ibridi: [
    { phase: 'F2', code: 'scheda_catalogo', name: 'Scheda a catalogo sistemi ibridi', mandatory: true },
    { phase: 'F2', code: 'schema_integrazione', name: 'Schema integrazione ibrida', mandatory: true }
  ],
  regolazione: [
    { phase: 'F2', code: 'manuale_taratura', name: 'Manuale taratura/regolazione', mandatory: true }
  ],
  altro: [
    { phase: 'F2', code: 'documentazione_specifica', name: 'Documentazione tecnica specifica', mandatory: true }
  ]
};

function headers() {
  return { ...HEADERS };
}

function normalizeSubject(subject) {
  if (!subject) return '';
  const value = String(subject).trim();
  if (/^pa/i.test(value)) return 'PA/ETS';
  if (/^ets/i.test(value)) return 'PA/ETS';
  if (/impresa/i.test(value)) return 'Impresa';
  if (/privato/i.test(value)) return 'Privato';
  return value;
}

function uniqueDocs(list) {
  const map = new Map();
  list.forEach((doc) => {
    if (!doc || !doc.code) return;
    const key = `${doc.phase || ''}:${doc.code}`;
    if (!map.has(key)) {
      map.set(key, { ...doc });
    } else {
      const existing = map.get(key);
      map.set(key, { ...existing, mandatory: existing.mandatory || doc.mandatory });
    }
  });
  return Array.from(map.values()).sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase));
}

function composeDocs(subjectType, interventionType) {
  const docs = [...BASE_DOCS];
  const normalized = normalizeSubject(subjectType);
  if (SUBJECT_DOCS[normalized]) {
    docs.push(...SUBJECT_DOCS[normalized]);
  }
  if (INTERVENTION_DOCS[interventionType]) {
    docs.push(...INTERVENTION_DOCS[interventionType]);
  }
  return uniqueDocs(docs);
}

function phaseOrder(phase) {
  const index = CT3_PHASES.findIndex((item) => item.id === phase);
  return index === -1 ? 999 : index;
}

function getIntervention(type) {
  return CT3_CATALOG.find((item) => item.type === type) || null;
}

function parseSize(data, catalogItem) {
  if (!catalogItem) return 0;
  if (catalogItem.unit === 'm2') {
    return Number(data?.intervention?.area_m2 || 0);
  }
  return Number(data?.intervention?.size_kw || 0);
}

function evaluateEligibility(payload) {
  const reasons = [];
  if (!payload) {
    reasons.push('Dati pratica non disponibili.');
    return { eligible: false, reasons };
  }
  const subject = normalizeSubject(payload.subject_type);
  if (!subject) {
    reasons.push('Selezionare la tipologia di soggetto.');
  }
  if (!payload.client_id) {
    reasons.push('Associare un cliente CRM alla pratica.');
  }
  if (!payload.building || payload.building.existing !== true) {
    reasons.push('Il Conto Termico richiede edifici esistenti.');
  }
  const interventionType = payload.intervention?.type;
  if (!interventionType) {
    reasons.push('Selezionare un intervento dal catalogo CT 3.0.');
    return { eligible: false, reasons };
  }
  const intervention = getIntervention(interventionType);
  if (!intervention) {
    reasons.push('Intervento non presente nel catalogo parametrico.');
    return { eligible: false, reasons };
  }
  if (intervention.subtypes?.length && !payload.intervention?.subtype) {
    reasons.push('Indicare il sottotipo di tecnologia per l’intervento selezionato.');
  }
  const size = parseSize(payload, intervention);
  if (!(size > 0)) {
    reasons.push('Indicare la taglia (kW/m²) coerente con la tecnologia.');
  } else {
    if (intervention.min_size && size < intervention.min_size) {
      reasons.push(`Taglia inferiore al minimo previsto (${intervention.min_size} ${intervention.unit}).`);
    }
    if (intervention.max_size && size > intervention.max_size) {
      reasons.push(`Taglia superiore al massimo ammesso (${intervention.max_size} ${intervention.unit}).`);
    }
  }
  if (subject && !intervention.subject_allowed.includes(subject)) {
    reasons.push('La tipologia di soggetto non è abilitata per questo intervento.');
  }
  const pct = Number(payload.incentive_params?.pct || 0);
  if (!(pct > 0)) {
    reasons.push('Impostare la percentuale di incentivo base (>0).');
  }
  const years = Number(payload.incentive_params?.years || 0);
  if (!(years >= 1 && years <= 5)) {
    reasons.push('Il numero di anni di erogazione deve essere compreso tra 1 e 5.');
  }
  return { eligible: reasons.length === 0, reasons };
}

function isCatalogRequest(event) {
  return /\/catalog\b/.test(event.path || '') || /\/catalog\b/.test(event.rawUrl || '');
}

function isCheckRequest(event) {
  return /\/check\b/.test(event.path || '') || /\/check\b/.test(event.rawUrl || '');
}

exports.CT3_PHASES = CT3_PHASES;
exports.CT3_CATALOG = CT3_CATALOG;
exports.composeDocs = composeDocs;
exports.evaluateEligibility = evaluateEligibility;

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }
  try {
    if (event.httpMethod === 'GET' && isCatalogRequest(event)) {
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: CT3_CATALOG }) };
    }

    if (event.httpMethod === 'GET') {
      const subject = event.queryStringParameters?.subject_type;
      const intervention = event.queryStringParameters?.intervention_type;
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: { phases: CT3_PHASES, documents: composeDocs(subject, intervention) } })
      };
    }

    if (event.httpMethod === 'POST' && isCheckRequest(event)) {
      const body = parseBody(event);
      const payload = body.case || body;
      const evaluation = evaluateEligibility(payload);
      const requiredDocs = composeDocs(payload?.subject_type, payload?.intervention?.type);
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: { eligible: evaluation.eligible, reasons: evaluation.reasons, required_docs: requiredDocs } })
      };
    }

    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});
