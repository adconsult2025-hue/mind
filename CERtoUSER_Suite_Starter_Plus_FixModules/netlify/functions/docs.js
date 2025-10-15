const fs = require('fs');
const os = require('os');
const path = require('path');

const { listDocs, addDoc, updateDocStatus, listCER, getPlantById } = require('./_data');
const { listPlantDocs, uploadPlantDoc, markPlantDoc, findPlantDoc } = require('./plant_docs');
const { guard } = require('./_safe');

const SAFE_MODE = String(process.env.SAFE_MODE || '').toLowerCase() === 'true';

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'];

function normalizePlantPhase(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    if (/^P[0-4]$/.test(upper)) return upper;
    const numeric = Number(upper);
    if (Number.isFinite(numeric)) return `P${numeric}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `P${value}`;
  }
  return null;
}

function parseGenericPhase(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    return trimmed;
  }
  return value;
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  if (SAFE_MODE && event.httpMethod === 'GET') {
    return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: [] }) };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const phaseParam = params.phase;
      const filter = {
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        phase: params.phase
      };
      if (!filter.entity_type || !filter.entity_id) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'entity_type ed entity_id sono obbligatori' } })
        };
      }
      if (filter.entity_type === 'plant') {
        const phase = normalizePlantPhase(filter.phase);
        const data = listPlantDocs(filter.entity_id, { phase: phase || undefined });
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
      }
      const parsedFilter = {
        ...filter,
        phase: parseGenericPhase(phaseParam)
      };
      const data = listDocs(parsedFilter);
      return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (parseErr) {
        return {
          statusCode: 400,
          headers: headers(),
          body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'Payload non valido' } })
        };
      }
      const isUpload = event.path.endsWith('/upload') || event.rawUrl?.includes('/upload');
      const isMark = event.path.endsWith('/mark') || event.rawUrl?.includes('/mark');
      const isGenerate = event.path.endsWith('/generate') || event.rawUrl?.includes('/generate');

      if (isMark) {
        const { doc_id, status } = body;
        if (!doc_id || !status) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'doc_id e status sono obbligatori' } })
          };
        }
        if (!['approved', 'rejected', 'uploaded'].includes(status)) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Status non valido' } })
          };
        }
        if (SAFE_MODE) {
          return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, dryRun: true, data: { doc_id, status } }) };
        }
        const plantDoc = findPlantDoc(doc_id);
        if (plantDoc) {
          const updatedPlantDoc = markPlantDoc(doc_id, status);
          return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: updatedPlantDoc }) };
        }
        const updated = updateDocStatus(doc_id, status);
        if (!updated) {
          return {
            statusCode: 404,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Documento non trovato' } })
          };
        }
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: updated }) };
      }

      if (isUpload) {
        const { entity_type, entity_id, phase, filename, code, name, doc_id } = body;
        if (!entity_type || !entity_id || !filename) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Parametri obbligatori mancanti' } })
          };
        }
        if (!['client', 'cer', 'plant', 'ct3_case'].includes(entity_type)) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'ENTITY_TYPE_NOT_ALLOWED', message: 'Tipo entità non supportato' } })
          };
        }
        const ext = filename.split('.').pop().toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) {
          return {
            statusCode: 400,
            headers: headers(),
            body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Estensione file non supportata' } })
          };
        }
        const docId = doc_id || `doc_${Date.now()}`;
        if (entity_type === 'plant') {
          const plantPhase = normalizePlantPhase(phase);
          if (!plantPhase) {
            return {
              statusCode: 400,
              headers: headers(),
              body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'phase non valida per impianto' } })
            };
          }
          const mockDoc = {
            doc_id: docId,
            plant_id: entity_id,
            entity_type: 'plant',
            entity_id,
            phase: plantPhase,
            filename,
            url: `https://storage.mock/docs/plant/${entity_id}/${docId}.${ext}`,
            status: 'uploaded',
            uploaded_at: new Date().toISOString()
          };
          if (SAFE_MODE) {
            return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, dryRun: true, data: mockDoc }) };
          }
          const doc = uploadPlantDoc({ plant_id: entity_id, phase: plantPhase, filename });
          return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: { ...doc, entity_type: 'plant', entity_id } }) };
        }
        const parsedPhase = parseGenericPhase(phase);
        const baseDoc = {
          doc_id: docId,
          entity_type,
          entity_id,
          phase: parsedPhase ?? null,
          code: code || null,
          name: name || '',
          filename,
          url: `https://storage.mock/docs/${entity_type}/${entity_id}/${docId}.${ext}`,
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        if (SAFE_MODE) {
          return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, dryRun: true, data: baseDoc }) };
        }
        const doc = addDoc(baseDoc);
        return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: true, data: { ...doc, entity_type, entity_id } }) };
      }

      if (isGenerate) {
        return handleGenerate(body);
      }

      return {
        statusCode: 400,
        headers: headers(),
        body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'Endpoint non riconosciuto' } })
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

function handleGenerate(body) {
  const h = headers();
  const templateKey = normalizeIdentifier(body.templateSlug || body.template || body.template_id || body.templateId);
  const refType = normalizeIdentifier(body.refType || body.entity_type);
  const refId = typeof body.refId === 'string' && body.refId.trim()
    ? body.refId.trim()
    : typeof body.entity_id === 'string' && body.entity_id.trim()
      ? body.entity_id.trim()
      : '';
  const outputType = normalizeIdentifier(body.output) === 'html' ? 'html' : 'docx';

  if (!templateKey) {
    return {
      statusCode: 400,
      headers: h,
      body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'templateSlug è obbligatorio' } })
    };
  }

  if (!refType || !refId) {
    return {
      statusCode: 400,
      headers: h,
      body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'refType e refId sono obbligatori' } })
    };
  }

  const template = findTemplateByKey(templateKey);
  if (!template) {
    return {
      statusCode: 404,
      headers: h,
      body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Modello non trovato' } })
    };
  }

  const { context, meta, warning } = buildGenerationContext({ refType, refId, template, payload: body });
  if (!context) {
    return {
      statusCode: 404,
      headers: h,
      body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: meta?.error || 'Dati non disponibili' } })
    };
  }

  const templateContent = getTemplateContent(template);
  const compiledBody = compileTemplate(templateContent, context);
  const documentHtml = wrapHtmlDocument(compiledBody, template.name || template.code || 'Documento CER');

  const filenameBase = body.fileName
    || body.filename
    || template.fileName
    || template.file_name
    || template.slug
    || template.code
    || template.id
    || 'documento-cer';
  const safeFilename = `${slugifyFilename(filenameBase)}.${outputType === 'html' ? 'html' : 'docx'}`;
  const mimeType = outputType === 'html'
    ? 'text/html; charset=utf-8'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const encoded = Buffer.from(outputType === 'html' ? documentHtml : compiledBody, 'utf8').toString('base64');

  const payload = {
    ok: true,
    warning,
    data: {
      template: {
        id: template.id || null,
        code: template.code || null,
        version: template.version || null,
        name: template.name || null
      },
      ref: { type: refType.toUpperCase(), id: refId },
      context: meta
    },
    html: documentHtml,
    file: {
      name: safeFilename,
      mime: mimeType,
      content: encoded
    }
  };

  if (outputType === 'docx') {
    payload.download_url = `data:${mimeType};base64,${encoded}`;
  }

  return { statusCode: 200, headers: h, body: JSON.stringify(stripNullish(payload)) };
}

function findTemplateByKey(key) {
  if (!key) return null;
  const templates = loadTemplatesCache();
  const normalized = normalizeIdentifier(key);
  const normalizedSlugKey = normalizeIdentifier(slugifyCandidate(key));
  const match = templates.find((tpl) => {
    const candidates = [
      tpl.slug,
      tpl.slug_id,
      tpl.slugId,
      tpl.templateSlug,
      tpl.template_slug,
      tpl.code,
      tpl.codice,
      tpl.id,
      tpl.name
    ];
    return candidates.some((candidate) => {
      const candidateNormalized = normalizeIdentifier(candidate);
      const candidateSlug = normalizeIdentifier(slugifyCandidate(candidate));
      return candidateNormalized === normalized
        || candidateNormalized === normalizedSlugKey
        || candidateSlug === normalized
        || candidateSlug === normalizedSlugKey;
    });
  });
  return match ? { ...match } : null;
}

function normalizePersistedTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clone = { ...raw };
  const slugSource = firstNonEmpty(
    clone.slug,
    clone.slug_id,
    clone.slugId,
    clone.templateSlug,
    clone.template_slug,
    clone.code,
    clone.codice,
    clone.name,
    clone.id
  );
  const normalizedSlug = slugSource ? slugifyCandidate(slugSource) : '';
  const slugId = firstNonEmpty(clone.slug_id, clone.slugId, slugSource) || null;
  const templateSlug = firstNonEmpty(clone.templateSlug, clone.template_slug, slugId, normalizedSlug) || null;
  return {
    ...clone,
    slug: clone.slug || (normalizedSlug ? normalizedSlug : null),
    slug_id: clone.slug_id || clone.slugId || (slugId || null),
    slugId: clone.slugId || clone.slug_id || (slugId || null),
    templateSlug: templateSlug || null
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    } else if (value !== undefined && value !== null) {
      const stringified = String(value).trim();
      if (stringified) return stringified;
    }
  }
  return '';
}

function slugifyCandidate(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

let templatesCacheStore = null;
let templatesCacheSignature = '';

function loadTemplatesCache() {
  const signature = computeTemplatesSignature();
  if (templatesCacheStore && templatesCacheSignature === signature && signature) {
    return templatesCacheStore;
  }
  templatesCacheStore = readTemplatesFromSources();
  templatesCacheSignature = signature;
  return templatesCacheStore;
}

function readTemplatesFromSources() {
  const candidates = getTemplateSources();
  for (const filePath of candidates) {
    if (!filePath) continue;
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((tpl) => normalizePersistedTemplate(tpl))
          .filter(Boolean);
      }
    } catch (error) {
      console.warn('[docs] impossibile leggere modello da', filePath, error?.message || error);
    }
  }
  return [];
}

function computeTemplatesSignature() {
  const candidates = getTemplateSources();
  if (!Array.isArray(candidates) || !candidates.length) {
    return '';
  }
  return candidates
    .map((filePath) => {
      if (!filePath) return 'missing';
      try {
        const stat = fs.statSync(filePath);
        return `${filePath}:${stat.size}:${stat.mtimeMs}`;
      } catch {
        return `${filePath}:missing`;
      }
    })
    .join('|');
}

function getTemplateSources() {
  const sources = [];
  if (process.env.TEMPLATES_DATA_FILE) {
    try {
      sources.push(path.resolve(process.env.TEMPLATES_DATA_FILE));
    } catch (err) {
      console.warn('[docs] TEMPLATES_DATA_FILE non valida:', err?.message || err);
    }
  }
  sources.push(path.join(__dirname, '../data/templates.json'));
  sources.push(path.join(os.tmpdir(), 'certouser_templates_data', 'templates.json'));
  sources.push(path.join(__dirname, 'templates.seed.json'));
  return sources;
}

function buildGenerationContext({ refType, refId, template, payload }) {
  const now = new Date();
  const baseContext = {
    oggi: formatDate(now),
    data: formatDate(now),
    anno: String(now.getFullYear()),
    ora: formatTime(now),
    sistema: {
      data: formatDate(now),
      oggi: formatDate(now),
      anno: String(now.getFullYear()),
      ora: formatTime(now)
    },
    template: {
      id: template?.id || null,
      code: template?.code || null,
      name: template?.name || null,
      version: template?.version || null
    },
    ref: {
      type: refType.toUpperCase(),
      id: refId
    }
  };

  if (payload?.extra && typeof payload.extra === 'object') {
    baseContext.extra = { ...payload.extra };
  }

  const type = refType.toUpperCase();
  if (type === 'CER') {
    const list = listCER();
    const cer = list.find((entry) => normalizeIdentifier(entry.id) === normalizeIdentifier(refId));
    if (!cer) {
      return { context: null, meta: { error: 'CER non trovata' } };
    }

    const members = Array.isArray(cer.membri) ? cer.membri.map((member) => ({ ...member })) : [];
    const plants = Array.isArray(cer.impianti) ? cer.impianti.map((entry) => {
      const plant = entry.id ? getPlantById(entry.id) : null;
      if (plant) {
        return {
          id: plant.id,
          nome: plant.name || plant.nome || '',
          tipologia: plant.tipologia || '',
          pct_cer: plant.pct_cer || null,
          pct_contra: plant.pct_contra || null,
          pod_produttore: plant.pod_id_produttore || '',
          inverter_api_key: plant.inverter_api_key || ''
        };
      }
      return {
        id: entry.id || entry.plant_id || '',
        nome: entry.nome || '',
        tipologia: entry.tipologia || '',
        pct_cer: entry.pct_cer || null,
        pct_contra: entry.pct_contra || null
      };
    }) : [];

    const consumer = members.find((member) => normalizeIdentifier(member.ruolo) !== 'produttore');
    const producer = members.find((member) => normalizeIdentifier(member.ruolo) === 'produttore');

    baseContext.cer = {
      id: cer.id,
      nome: cer.nome || '',
      comune: cer.comune || '',
      cabina: cer.cabina || '',
      quota_condivisa: cer.quota ? `${cer.quota}%` : '',
      riparto: cer.riparto || '',
      membri: members,
      impianti: plants
    };

    baseContext.cliente = consumer
      ? {
          id: consumer.id || '',
          nome: consumer.nome || '',
          ruolo: consumer.ruolo || '',
          pod: consumer.pod || '',
          comune: consumer.comune || ''
        }
      : { nome: '', ruolo: '', pod: '', comune: '' };

    baseContext.producer = producer
      ? {
          id: producer.id || '',
          nome: producer.nome || '',
          pod: producer.pod || '',
          comune: producer.comune || ''
        }
      : null;

    baseContext.pod = baseContext.cliente.pod || producer?.pod || '';
    baseContext.impianto = plants[0] || null;

    const meta = {
      cer: {
        id: cer.id,
        nome: cer.nome || ''
      },
      membri: {
        totale: members.length,
        produttori: members.filter((m) => normalizeIdentifier(m.ruolo) === 'produttore').length,
        prosumer: members.filter((m) => /prosumer/i.test(m.ruolo || '')).length
      },
      impianti: plants.length
    };

    return { context: baseContext, meta, warning: !members.length ? 'CER senza membri registrati' : undefined };
  }

  return { context: baseContext, meta: { ref: baseContext.ref } };
}

function compileTemplate(content, context) {
  const source = typeof content === 'string' ? content : '';
  if (!source) return '';
  return source.replace(/{{\s*([^}\s]+(?:\.[^}\s]+)*)\s*}}/g, (match, token) => {
    const pathParts = token.split('.');
    let current = context;
    for (const part of pathParts) {
      if (current && Object.prototype.hasOwnProperty.call(current, part)) {
        current = current[part];
      } else {
        current = undefined;
        break;
      }
    }
    if (current === undefined || current === null) return '';
    if (typeof current === 'function') {
      try {
        const value = current(context);
        return value === undefined || value === null ? '' : String(value);
      } catch (err) {
        console.warn('[docs] errore placeholder', token, err?.message || err);
        return '';
      }
    }
    if (current instanceof Date) {
      return formatDate(current);
    }
    return String(current);
  });
}

function wrapHtmlDocument(body, title = 'Documento') {
  if (!body) return '';
  const trimmed = body.trim();
  if (/<!DOCTYPE|<html/i.test(trimmed)) {
    return body;
  }
  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; line-height: 1.5; margin: 2rem; color: #202124; }
      h1, h2, h3 { color: #0b3d91; }
      table { border-collapse: collapse; width: 100%; margin: 1.5rem 0; }
      th, td { border: 1px solid #cbd5e1; padding: 0.5rem 0.75rem; text-align: left; }
      .info { background: #eff6ff; border: 1px solid #bfdbfe; padding: 1rem; border-radius: 0.5rem; }
    </style>
  </head>
  <body>
${body}
  </body>
</html>`;
}

function getTemplateContent(template) {
  if (!template || typeof template !== 'object') return '';
  if (typeof template.content === 'string' && template.content.trim()) {
    return template.content;
  }
  if (typeof template.html === 'string' && template.html.trim()) {
    return template.html;
  }
  const fileContent = template.file && template.file.content;
  if (typeof fileContent === 'string' && fileContent) {
    try {
      return Buffer.from(fileContent, 'base64').toString('utf8');
    } catch (err) {
      console.warn('[docs] impossibile decodificare contenuto modello', err?.message || err);
    }
  }
  return `<article><h1>${escapeHtml(template.name || template.code || 'Documento')}</h1><p>Contenuto del modello non disponibile.</p></article>`;
}

function normalizeIdentifier(value) {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function slugifyFilename(value) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : 'documento';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'documento';
}

function stripNullish(value) {
  if (Array.isArray(value)) {
    return value.map(stripNullish);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, val]) => {
      if (val === undefined) {
        return acc;
      }
      acc[key] = stripNullish(val);
      return acc;
    }, {});
  }
  return value;
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.valueOf())) return '';
  const day = `${d.getDate()}`.padStart(2, '0');
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.valueOf())) return '';
  const hours = `${d.getHours()}`.padStart(2, '0');
  const minutes = `${d.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
