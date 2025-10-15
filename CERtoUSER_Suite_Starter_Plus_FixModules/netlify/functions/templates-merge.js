const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const { corsHeaders, preflight, json } = require("./_cors");

// mappa codice modello → file .docx in site/assets/models/
const MAP = {
  "CER-STATUTO-BASE": "02_Statuto_CER_template.docx",
  "CER-REGOLAMENTO-BASE": "03_Regolamento_CER_template.docx",
  "CER-ATTOCOSTITUTIVO-BASE": "01_AttoCostitutivo_CER_template.docx",
  "CER-ADESIONE-BASE": "04_Adesione_Membro_template.docx",
  "CER-DELEGA-GSEDSO-BASE": "05_Delega_GSE_DSO_template.docx",
  "CER-CONTRATTO-TRADER-BASE": "06_Contratto_Trader_template.docx",
  "CER-GDPR-INFORMATIVA-BREVE": "07_GDPR_Informativa_template.docx",
  "CER-CRONOPROGRAMMA-BASE": "08_Cronoprogramma_template.docx",
  "CER-REGISTRO-POD": "09_Registro_POD_template.docx",
  "CER-REGISTRO-IMPIANTI": "10_Registro_Impianti_template.docx"
};

function angularParser(tag) {
  const expr = tag.replace(/^[{]+|[}]+$/g, "").trim();
  return {
    get: (scope) => expr.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), scope)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const { templateCode, payload, filename } = JSON.parse(event.body || "{}");
    if (!templateCode) return json(400, { ok: false, error: "MISSING templateCode" });

    const file = MAP[templateCode];
    if (!file) return json(404, { ok: false, error: "UNKNOWN_TEMPLATE" });

    const fp = path.join(process.cwd(), "site", "assets", "models", file);
    if (!fs.existsSync(fp)) {
      return json(404, { ok: false, error: "TEMPLATE_FILE_NOT_FOUND" });
    }

    const content = fs.readFileSync(fp);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      parser: angularParser,
      nullGetter: () => ""
    });

    // payload = oggetto dati CER; se non passato, la UI dovrà farlo
    doc.render(payload || {});
    const out = doc.getZip().generate({ type: "nodebuffer" });

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename || templateCode}.docx"`
      },
      isBase64Encoded: true,
      body: out.toString("base64")
    };
  } catch (error) {
    console.error("templates-merge error", error);
    return json(500, { ok: false, error: String(error) });
  }
};
