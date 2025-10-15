const { Client } = require("pg");
const { nanoid } = require("nanoid");
const Handlebars = require("handlebars");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
// Nota: per PDF da HTML, aggiungerai puppeteer-core + @sparticuz/chromium

const connStr = process.env.NEON_DATABASE_URL;

async function db() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

const ok  = (data) => ({ statusCode: 200, body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, body: JSON.stringify({ error: msg }) });

exports.handler = async (event) => {
  try {
    const path = (new URL(event.rawUrl)).pathname
      .replace('/.netlify/functions/api','')
      .replace('/api','') || '/';
    const method = event.httpMethod.toUpperCase();

    if (path === '/templates/upload' && method === 'POST') return uploadTemplate(event);
    if (path === '/templates/update' && method === 'POST') return updateTemplate(event);
    if (path === '/templates' && method === 'GET') return listTemplates();
    if (path === '/documents/generate' && method === 'POST') return generateDocument(event);

    return err(404, `No route for ${method} ${path}`);
  } catch (e) {
    console.error(e);
    return err(500, 'Internal error');
  }
};

async function uploadTemplate(event) {
  const body = JSON.parse(event.body || '{}');
  const { name, slug, type, changelog, content_text, file } = body;
  if (!name || !slug || !type) return err(400, 'Missing name/slug/type');

  const client = await db();
  try {
    const t = await client.query('INSERT INTO templates(name,slug,type) VALUES($1,$2,$3) RETURNING id', [name, slug, type]);
    const templateId = t.rows[0].id;
    const version = 1;

    if (type === 'docx') {
      if (!file) return err(400, 'Missing DOCX base64 file');
      const buf = Buffer.from(file, 'base64');
      await client.query('INSERT INTO template_versions(template_id,version,content,changelog) VALUES ($1,$2,$3,$4)', [templateId, version, buf, changelog || 'v1']);
    } else {
      if (!content_text) return err(400, 'Missing content_text');
      await client.query('INSERT INTO template_versions(template_id,version,content_text,changelog) VALUES ($1,$2,$3,$4)', [templateId, version, content_text, changelog || 'v1']);
    }
    return ok({ templateId, version });
  } finally { await client.end(); }
}

async function updateTemplate(event) {
  const body = JSON.parse(event.body || '{}');
  const { templateId, changelog, content_text, file } = body;
  if (!templateId) return err(400, 'Missing templateId');

  const client = await db();
  try {
    const { rows } = await client.query('SELECT type FROM templates WHERE id=$1', [templateId]);
    if (!rows.length) return err(404, 'Template not found');
    const type = rows[0].type;

    const { rows: vr } = await client.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM template_versions WHERE template_id=$1', [templateId]);
    const version = vr[0].v;

    if (type === 'docx') {
      if (!file) return err(400, 'Missing DOCX base64 file');
      const buf = Buffer.from(file, 'base64');
      await client.query('INSERT INTO template_versions(template_id,version,content,changelog) VALUES ($1,$2,$3,$4)', [templateId, version, buf, changelog || `v${version}`]);
    } else {
      if (!content_text) return err(400, 'Missing content_text');
      await client.query('INSERT INTO template_versions(template_id,version,content_text,changelog) VALUES ($1,$2,$3,$4)', [templateId, version, content_text, changelog || `v${version}`]);
    }
    return ok({ templateId, version });
  } finally { await client.end(); }
}

async function listTemplates() {
  const client = await db();
  try {
    const { rows } = await client.query(`
      SELECT t.id, t.name, t.slug, t.type,
             (SELECT MAX(version) FROM template_versions v WHERE v.template_id=t.id) AS latest_version
      FROM templates t
      ORDER BY t.created_at DESC
    `);
    return ok(rows);
  } finally { await client.end(); }
}

async function generateDocument(event) {
  const body = JSON.parse(event.body || '{}');
  const { templateSlug, refType, refId, output } = body;
  if (!templateSlug || !refType || !refId) return err(400, 'Missing templateSlug/refType/refId');

  const client = await db();
  try {
    const t = await client.query('SELECT id,type FROM templates WHERE slug=$1', [templateSlug]);
    if (!t.rows.length) return err(404, 'Template not found');
    const { id: templateId, type } = t.rows[0];

    const v = await client.query(`
      SELECT version, content, content_text
      FROM template_versions
      WHERE template_id=$1
      ORDER BY version DESC LIMIT 1
    `, [templateId]);
    if (!v.rows.length) return err(404, 'Template has no versions');
    const ver = v.rows[0];

    const context = await buildContext(refType, refId);

    let fileBuffer, ext;
    if (type === 'docx') {
      const zip = new PizZip(Buffer.from(ver.content));
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.setData(context);
      doc.render();
      fileBuffer = doc.getZip().generate({ type: 'nodebuffer' });
      ext = 'docx';
    } else {
      const html = Handlebars.compile(ver.content_text)(context);
      fileBuffer = Buffer.from(html, 'utf8');
      ext = (output === 'html' ? 'html' : 'html'); // per PDF aggiungerai renderer
    }

    const fs = require('fs');
    const path = require('path');
    const dir = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'public', 'docs');
    fs.mkdirSync(dir, { recursive: true });

    const id = nanoid(10);
    const fname = `${templateSlug}-${refType}-${refId}-${id}.${ext}`;
    const fpath = path.join(dir, fname);
    fs.writeFileSync(fpath, fileBuffer);

    await client.query(
      'INSERT INTO generated_documents(template_id, ref_type, ref_id, file_path, file_ext, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [templateId, refType, refId, fpath, ext, 'suite']
    );

    return ok({ file: fname, path: fpath, public_url: `/docs/${fname}` });
  } finally { await client.end(); }
}

async function buildContext(refType, refId) {
  if (refType === 'CER') {
    return {
      CER: {
        Nome: "CER Ponte Grande",
        FormaGiuridica: "Associazione",
        SedeLegale: "Via Roma 1, Frosinone",
        CodiceFiscale: "12345678901",
        Rappresentante: { Nome: "Mario Rossi" },
        PEC: "cer@pec.it",
        CabinaPrimaria: { Codice: "CP-001", Descrizione: "Ponte Grande" },
        Trader: { RagioneSociale: "Omnia Energia", PIVA: "IT01234567890" },
        POD: { Elenco: "IT001E123..., IT001E456..." }
      },
      CTU: {
        RagioneSociale: "CERtoUSER S.r.l.",
        Sede: "Roma",
        PIVA: "IT09876543210",
        Referente: "David Azzellino",
        PEC: "certouser@pec.it"
      },
      Corrispettivo: { RoyaltyPercent: 15, Fisso: 1000 },
      Data: { Decorrenza: "2025-10-15" },
      RisoluzioneControversie: "Mediazione obbligatoria; Foro di Frosinone"
    };
  } else {
    return {
      CER: {
        Nome: "CER Ponte Grande",
        CodiceFiscale: "12345678901",
        SedeLegale: "Via Roma 1",
        Rappresentante: { Nome: "Mario Rossi" },
        PEC: "cer@pec.it",
        CabinaPrimaria: { Codice: "CP-001", Descrizione: "Ponte Grande" },
        Regolamento: { Versione: "1.0", Data: "2025-09-30" }
      },
      Membro: {
        RagioneSocialeONome: "Impianti Verdi S.r.l.",
        CF_PIVA: "IT1122334455",
        Indirizzo: "Via Verdi 5",
        Referente: "Paolo Bianchi",
        PEC: "impiantiverdi@pec.it"
      },
      Impianto: {
        Codice: "FV-123",
        kWp: 180,
        Tecnologia: "Fotovoltaico",
        DataEsercizio: "2024-07-01",
        POD: "IT001E123...",
        PDR: "",
        Indirizzo: "Via Centrale 10",
        Comune: "Frosinone",
        Provincia: "FR",
        Misuratore: "MID-001"
      },
      Riparti: { Produttore: { Percentuale: 55 } },
      Calcoli: { Totale75perKWp: (180 * 75).toFixed(2) }
    };
  }
}
