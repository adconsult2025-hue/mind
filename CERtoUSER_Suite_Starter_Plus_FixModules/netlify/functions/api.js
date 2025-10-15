const { Client } = require('pg');
const { nanoid } = require('nanoid');
const Handlebars = require('handlebars');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { promises: fs } = require('fs');
const path = require('path');

const { guard } = require('./_safe');

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const connStr = process.env.NEON_DATABASE_URL;

async function db() {
  if (!connStr) {
    throw new Error('NEON_DATABASE_URL non configurato');
  }
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const respond = (statusCode, payload) => ({ statusCode, headers: headers(), body: JSON.stringify(payload) });
const ok = (data) => respond(200, { ok: true, data });
const bad = (statusCode, message, code = 'ERROR', extra = {}) => respond(statusCode, { ok: false, error: { code, message, ...extra } });

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    const rawUrl = event.rawUrl || `https://local${event.path || ''}`;
    const url = new URL(rawUrl);
    const routePath = (url.pathname || '')
      .replace(/^\/\.netlify\/functions\/api/, '')
      .replace(/^\/api/, '') || '/';
    const method = (event.httpMethod || 'GET').toUpperCase();

    if (routePath === '/templates/upload' && method === 'POST') return uploadTemplate(event);
    if (routePath === '/templates/update' && method === 'POST') return updateTemplate(event);
    if (routePath === '/templates' && method === 'GET') return listTemplates();
    if (routePath === '/documents/generate' && method === 'POST') return generateDocument(event);

    return bad(404, `No route for ${method} ${routePath}`, 'NOT_FOUND');
  } catch (err) {
    if (err instanceof HttpError) {
      return bad(err.statusCode, err.message, err.code);
    }
    console.error(err);
    return bad(500, 'Internal error', 'SERVER_ERROR');
  }
});

async function uploadTemplate(event) {
  const body = parseBody(event);
  const { name, slug, type, changelog, content_text: contentText, file } = body;
  if (!name || !slug || !type) {
    return bad(400, 'name, slug e type sono obbligatori', 'VALIDATION_ERROR');
  }

  const client = await db();
  try {
    const result = await client.query(
      'INSERT INTO templates(name, slug, type) VALUES($1, $2, $3) RETURNING id',
      [name, slug, type]
    );
    const templateId = result.rows[0].id;
    const version = 1;

    if (type === 'docx') {
      if (!file) {
        return bad(400, 'file (base64) obbligatorio per template DOCX', 'VALIDATION_ERROR');
      }
      const buffer = Buffer.from(file, 'base64');
      await client.query(
        'INSERT INTO template_versions(template_id, version, content, changelog) VALUES ($1, $2, $3, $4)',
        [templateId, version, buffer, changelog || 'v1']
      );
    } else {
      if (!contentText) {
        return bad(400, 'content_text obbligatorio per template testuali', 'VALIDATION_ERROR');
      }
      await client.query(
        'INSERT INTO template_versions(template_id, version, content_text, changelog) VALUES ($1, $2, $3, $4)',
        [templateId, version, contentText, changelog || 'v1']
      );
    }

    return ok({ templateId, version });
  } finally {
    await client.end();
  }
}

async function updateTemplate(event) {
  const body = parseBody(event);
  const { templateId, changelog, content_text: contentText, file } = body;
  if (!templateId) {
    return bad(400, 'templateId è obbligatorio', 'VALIDATION_ERROR');
  }

  const client = await db();
  try {
    const existing = await client.query('SELECT type FROM templates WHERE id = $1', [templateId]);
    if (!existing.rows.length) {
      return bad(404, 'Template non trovato', 'NOT_FOUND');
    }
    const type = existing.rows[0].type;

    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM template_versions WHERE template_id = $1',
      [templateId]
    );
    const version = versionResult.rows[0].version;

    if (type === 'docx') {
      if (!file) {
        return bad(400, 'file (base64) obbligatorio per template DOCX', 'VALIDATION_ERROR');
      }
      const buffer = Buffer.from(file, 'base64');
      await client.query(
        'INSERT INTO template_versions(template_id, version, content, changelog) VALUES ($1, $2, $3, $4)',
        [templateId, version, buffer, changelog || `v${version}`]
      );
    } else {
      if (!contentText) {
        return bad(400, 'content_text obbligatorio per template testuali', 'VALIDATION_ERROR');
      }
      await client.query(
        'INSERT INTO template_versions(template_id, version, content_text, changelog) VALUES ($1, $2, $3, $4)',
        [templateId, version, contentText, changelog || `v${version}`]
      );
    }

    return ok({ templateId, version });
  } finally {
    await client.end();
  }
}

async function listTemplates() {
  const client = await db();
  try {
    const result = await client.query(`
      SELECT t.id, t.name, t.slug, t.type,
             (SELECT MAX(version) FROM template_versions v WHERE v.template_id = t.id) AS latest_version,
             t.created_at, t.updated_at
      FROM templates t
      ORDER BY t.created_at DESC
    `);
    return ok(result.rows);
  } finally {
    await client.end();
  }
}

async function generateDocument(event) {
  const body = parseBody(event);
  const { templateSlug, refType, refId, output } = body;
  if (!templateSlug || !refType || !refId) {
    return bad(400, 'templateSlug, refType e refId sono obbligatori', 'VALIDATION_ERROR');
  }

  const client = await db();
  try {
    const templateResult = await client.query('SELECT id, type FROM templates WHERE slug = $1', [templateSlug]);
    if (!templateResult.rows.length) {
      return bad(404, 'Template non trovato', 'NOT_FOUND');
    }
    const { id: templateId, type } = templateResult.rows[0];

    const versionResult = await client.query(
      `SELECT version, content, content_text FROM template_versions WHERE template_id = $1 ORDER BY version DESC LIMIT 1`,
      [templateId]
    );
    if (!versionResult.rows.length) {
      return bad(404, 'Template senza versioni', 'NOT_FOUND');
    }
    const version = versionResult.rows[0];

    const context = await buildContext(refType, refId);

    let fileBuffer;
    let ext;
    const desiredOutput = (typeof output === 'string' ? output : type || '').toLowerCase();

    if (type === 'docx') {
      if (!version.content) {
        return bad(422, 'Versione priva di contenuto DOCX', 'INVALID_TEMPLATE');
      }
      const zip = new PizZip(Buffer.from(version.content));
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.setData(context);
      doc.render();
      fileBuffer = doc.getZip().generate({ type: 'nodebuffer' });
      ext = 'docx';
      if (desiredOutput === 'pdf') {
        // TODO: integrare conversione PDF quando disponibile
        ext = 'docx';
      }
    } else {
      if (!version.content_text) {
        return bad(422, 'Versione priva di contenuto testuale', 'INVALID_TEMPLATE');
      }
      const template = Handlebars.compile(version.content_text || '');
      const html = template(context);
      fileBuffer = Buffer.from(html, 'utf8');
      ext = desiredOutput === 'html' ? 'html' : 'html';
      // TODO: aggiungere rendering PDF per template HTML/MD quando richiesto
    }

    const storageDir = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'public', 'docs');
    const absoluteDir = path.isAbsolute(storageDir) ? storageDir : path.join(process.cwd(), storageDir);
    await fs.mkdir(absoluteDir, { recursive: true });

    const id = nanoid(12);
    const fileName = `${templateSlug}-${refType}-${refId}-${id}.${ext}`;
    const filePath = path.join(absoluteDir, fileName);
    await fs.writeFile(filePath, fileBuffer);

    await client.query(
      'INSERT INTO generated_documents(template_id, ref_type, ref_id, file_path, file_ext, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [templateId, refType, refId, filePath, ext, 'suite']
    );

    return ok({ file: fileName, path: filePath });
  } finally {
    await client.end();
  }
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }
  try {
    return JSON.parse(event.body);
  } catch (err) {
    throw new HttpError(400, 'INVALID_JSON', 'Body deve essere un JSON valido');
  }
}

async function buildContext(refType, refId) {
  if (refType === 'CER') {
    return {
      CER: {
        Nome: 'CER Ponte Grande',
        FormaGiuridica: 'Associazione',
        SedeLegale: 'Via Roma 1, Frosinone',
        CodiceFiscale: '12345678901',
        Rappresentante: { Nome: 'Mario Rossi' },
        PEC: 'cer@pec.it',
        CabinaPrimaria: { Codice: 'CP-001', Descrizione: 'Ponte Grande' },
        Trader: { RagioneSociale: 'Omnia Energia', PIVA: 'IT01234567890' },
        POD: { Elenco: 'IT001E123..., IT001E456...' }
      },
      CTU: {
        RagioneSociale: 'CERtoUSER S.r.l.',
        Sede: 'Roma',
        PIVA: 'IT09876543210',
        Referente: 'David Azzellino',
        PEC: 'certouser@pec.it'
      },
      Corrispettivo: { RoyaltyPercent: 15, Fisso: 1000 },
      Data: { Decorrenza: '2025-10-15' },
      RisoluzioneControversie: 'Mediazione obbligatoria; Foro di Frosinone'
    };
  }

  return {
    CER: {
      Nome: 'CER Ponte Grande',
      CodiceFiscale: '12345678901',
      SedeLegale: 'Via Roma 1',
      Rappresentante: { Nome: 'Mario Rossi' },
      PEC: 'cer@pec.it',
      CabinaPrimaria: { Codice: 'CP-001', Descrizione: 'Ponte Grande' },
      Regolamento: { Versione: '1.0', Data: '2025-09-30' }
    },
    Membro: {
      RagioneSocialeONome: 'Impianti Verdi S.r.l.',
      CF_PIVA: 'IT1122334455',
      Indirizzo: 'Via Verdi 5',
      Referente: 'Paolo Bianchi',
      PEC: 'impiantiverdi@pec.it'
    },
    Impianto: {
      Codice: 'FV-123',
      kWp: 180,
      Tecnologia: 'Fotovoltaico',
      DataEsercizio: '2024-07-01',
      POD: 'IT001E123...',
      PDR: '',
      Indirizzo: 'Via Centrale 10',
      Comune: 'Frosinone',
      Provincia: 'FR',
      Misuratore: 'MID-001'
    },
    Riparti: { Produttore: { Percentuale: 55 } },
    Calcoli: { Totale75perKWp: (180 * 75).toFixed(2) }
  };
}
