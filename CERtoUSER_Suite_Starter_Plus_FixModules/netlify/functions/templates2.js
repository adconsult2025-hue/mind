const { Client } = require("pg");
const connStr = process.env.NEON_DATABASE_URL;

async function db() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

const ok  = (d) => ({ statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
const err = (s,m) => ({ statusCode: Number.isFinite(+s) ? +s : 500, headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ok:false, error:{ code: String(s), message: m } }) });

exports.handler = async (event) => {
  try {
    const m = event.httpMethod.toUpperCase();
    const p = (new URL(event.rawUrl)).pathname;

    // GET /api2/templates  -> lista minimale e robusta
    if (m === "GET" && /\/api2\/templates(\/)?$/.test(p)) {
      const client = await db();
      try {
        // Non usiamo colonne opzionali (module, code) per evitare 500 in DB non migrati
        const { rows } = await client.query(`
          SELECT t.id, t.name, t.slug, t.type,
                 (SELECT MAX(version) FROM template_versions v WHERE v.template_id = t.id) AS latest_version
          FROM templates t
          ORDER BY t.created_at DESC`);
        // Aggiungiamo in JS i campi "code" e "module" per la UI (fallback)
        const safe = rows.map(r => ({ ...r, code: r.slug, module: "CER" }));
        return ok(safe);
      } finally { await client.end(); }
    }

    // POST /api2/templates/upload  -> inserisce usando solo colonne base
    if (m === "POST" && /\/api2\/templates\/upload(\/)?$/.test(p)) {
      const body = JSON.parse(event.body || "{}");
      const { name, slug, type, changelog, content_text, file } = body;
      if (!name || !slug || !type) return err(400, "Missing name/slug/type");

      const client = await db();
      try {
        const ins = await client.query(
          "INSERT INTO templates (name, slug, type, editable, updated_at) VALUES ($1,$2,$3,true,now()) RETURNING id",
          [name, slug, type]
        );
        const templateId = ins.rows[0].id;
        const version = 1;

        if (type === "docx") {
          if (!file) return err(400, "Missing DOCX base64 file");
          await client.query(
            "INSERT INTO template_versions (template_id, version, content, changelog) VALUES ($1,$2,$3,$4)",
            [templateId, version, Buffer.from(file, "base64"), changelog || "v1"]
          );
        } else {
          if (!content_text) return err(400, "Missing content_text");
          await client.query(
            "INSERT INTO template_versions (template_id, version, content_text, changelog) VALUES ($1,$2,$3,$4)",
            [templateId, version, content_text, changelog || "v1"]
          );
        }
        return ok({ ok:true, templateId, version });
      } finally { await client.end(); }
    }

    // POST /api2/templates/update  -> nuova versione (no colonne opzionali)
    if (m === "POST" && /\/api2\/templates\/update(\/)?$/.test(p)) {
      const body = JSON.parse(event.body || "{}");
      const { templateId, changelog, content_text, file } = body;
      if (!templateId) return err(400, "Missing templateId");

      const client = await db();
      try {
        const t = await client.query("SELECT type FROM templates WHERE id=$1", [templateId]);
        if (!t.rows.length) return err(404, "Template not found");
        const type = t.rows[0].type;

        const vr = await client.query(
          "SELECT COALESCE(MAX(version),0)+1 AS v FROM template_versions WHERE template_id=$1",
          [templateId]
        );
        const version = vr.rows[0].v;

        if (type === "docx") {
          if (!file) return err(400, "Missing DOCX base64 file");
          await client.query(
            "INSERT INTO template_versions (template_id, version, content, changelog) VALUES ($1,$2,$3,$4)",
            [templateId, version, Buffer.from(file, "base64"), changelog || `v${version}`]
          );
        } else {
          if (!content_text) return err(400, "Missing content_text");
          await client.query(
            "INSERT INTO template_versions (template_id, version, content_text, changelog) VALUES ($1,$2,$3,$4)",
            [templateId, version, content_text, changelog || `v${version}`]
          );
        }
        return ok({ ok:true, templateId, version });
      } finally { await client.end(); }
    }

    return err(404, "Not found");
  } catch (e) {
    console.error("templates2 error:", e);
    return err(500, "Internal error");
  }
};
