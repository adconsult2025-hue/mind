const { Client } = require("pg");
const Handlebars = require("handlebars");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const { nanoid } = require("nanoid");
const fs = require("fs");
const path = require("path");
const { parseBody } = require("./_http");

const connStr = process.env.NEON_DATABASE_URL;

async function db() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

const ok = (data) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

const err = (status, message) => ({
  statusCode: Number.isFinite(+status) ? +status : 500,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ok: false, error: { code: String(status), message } }),
});

async function hasColumn(client, table, column) {
  const result = await client.query(
    "select 1 from information_schema.columns where table_name=$1 and column_name=$2 limit 1",
    [String(table || "").toLowerCase(), String(column || "").toLowerCase()]
  );
  return result.rowCount > 0;
}

function safeName(input) {
  return String(input || '')
    .replace(/[^a-z0-9_\-.]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$|^\.+/g, '');
}

async function buildContext(refType, refId) {
  if (refType === "CER") {
    return {
      CER: {
        Nome: "CER Ponte Grande",
        FormaGiuridica: "Associazione",
        SedeLegale: "Via Roma 1",
        CodiceFiscale: "12345678901",
        Rappresentante: { Nome: "Mario Rossi" },
        PEC: "cer@pec.it",
        CabinaPrimaria: { Codice: "CP-001", Descrizione: "Ponte Grande" },
      },
      CTU: {
        RagioneSociale: "CERtoUSER S.r.l.",
        Sede: "Roma",
        PIVA: "IT09876543210",
        Referente: "David Azzellino",
        PEC: "certouser@pec.it",
      },
      Corrispettivo: { RoyaltyPercent: 15, Fisso: 1000 },
      Data: { Decorrenza: "2025-10-15" },
      RisoluzioneControversie: "Mediazione obbligatoria; Foro di Frosinone",
    };
  }
  return {
    CER: {
      Nome: "CER Ponte Grande",
      CodiceFiscale: "12345678901",
      CabinaPrimaria: { Codice: "CP-001", Descrizione: "Ponte Grande" },
    },
    Membro: {
      RagioneSocialeONome: "Impianti Verdi S.r.l.",
      CF_PIVA: "IT1122334455",
      PEC: "impiantiverdi@pec.it",
    },
    Impianto: { Codice: "FV-123", kWp: 180, POD: "IT001E123..." },
    Riparti: { Produttore: { Percentuale: 55 } },
    Calcoli: { Totale75perKWp: (180 * 75).toFixed(2) },
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod.toUpperCase() !== "POST") return err(405, "POST only");
    const body = parseBody(event);
    const { templateSlug, refType, refId } = body;
    if (!templateSlug || !refType || !refId) return err(400, "Missing templateSlug/refType/refId");

    const client = await db();
    try {
      const hasCode = await hasColumn(client, "templates", "code");
      const lookupSql = hasCode
        ? "select id, type, coalesce(code, slug) as code, slug from templates where slug=$1 or id::text=$1 or code=$1 limit 1"
        : "select id, type, slug from templates where slug=$1 or id::text=$1 limit 1";
      const templateResult = await client.query(lookupSql, [templateSlug]);
      if (!templateResult.rows.length) return err(404, "Modello non trovato");

      const templateRow = templateResult.rows[0];
      const templateId = templateRow.id;
      const type = templateRow.type;

      const versionResult = await client.query(
        "select version, content, content_text from template_versions where template_id=$1 order by version desc limit 1",
        [templateId]
      );
      if (!versionResult.rows.length) return err(404, "Nessuna versione del modello");

      const ctx = await buildContext(refType, refId);
      const outputDir = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), "public", "docs");
      fs.mkdirSync(outputDir, { recursive: true });

      const identifier = nanoid(8);
      const baseName = safeName(`${templateRow.code || templateRow.slug || templateSlug}-${refType}-${refId}-${identifier}`);

      if (type === "docx") {
        const zip = new PizZip(Buffer.from(versionResult.rows[0].content));
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        doc.setData(ctx);
        doc.render();
        const buffer = doc.getZip().generate({ type: "nodebuffer" });
        const fileName = `${baseName || `doc-${identifier}`}.docx`;
        fs.writeFileSync(path.join(outputDir, fileName), buffer);
        return ok({ ok: true, public_url: `/docs/${fileName}` });
      }

      const html = Handlebars.compile(versionResult.rows[0].content_text)(ctx);
      const fileName = `${baseName || `doc-${identifier}`}.html`;
      fs.writeFileSync(path.join(outputDir, fileName), Buffer.from(html, "utf8"));
      return ok({ ok: true, public_url: `/docs/${fileName}` });
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error("documents2 error:", error);
    return err(500, "Internal error");
  }
};
