const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const { corsHeaders, preflight, json } = require("./_cors");

const MANIFEST_PATH = path.join(process.cwd(), 'config', 'templates', 'models.manifest.json');

let manifestMap = null;
let manifestMtime = 0;

function buildManifestMap() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('Manifest file not found');
  }

  const stat = fs.statSync(MANIFEST_PATH);
  if (manifestMap && manifestMtime === stat.mtimeMs) {
    return manifestMap;
  }

  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid manifest JSON: ${error.message}`);
  }

  const models = Array.isArray(parsed?.models) ? parsed.models : [];
  manifestMap = models.reduce((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const code = typeof entry.code === 'string' ? entry.code.trim().toUpperCase() : '';
    const file = typeof entry.file === 'string' ? entry.file.trim() : '';
    if (code && file) {
      acc[code] = file;
    }
    return acc;
  }, {});
  manifestMtime = stat.mtimeMs;
  return manifestMap;
}

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
    const normalizedCode = typeof templateCode === 'string' ? templateCode.trim().toUpperCase() : '';
    if (!normalizedCode) return json(400, { ok: false, error: "MISSING templateCode" });

    let file;
    try {
      const map = buildManifestMap();
      file = map[normalizedCode];
    } catch (manifestError) {
      console.error('templates-merge manifest error', manifestError);
      return json(500, { ok: false, error: 'MANIFEST_ERROR' });
    }
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
        "Content-Disposition": `attachment; filename="${filename || normalizedCode}.docx"`
      },
      isBase64Encoded: true,
      body: out.toString("base64")
    };
  } catch (error) {
    console.error("templates-merge error", error);
    return json(500, { ok: false, error: String(error) });
  }
};
