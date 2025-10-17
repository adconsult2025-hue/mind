const { Client } = require("pg");
const { parseBody } = require("./_http");
const connStr = process.env.NEON_DATABASE_URL;

async function db() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

const ok = (data) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const err = (status, message) => ({
  statusCode: Number.isFinite(+status) ? +status : 500,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ok: false, error: { code: String(status), message } }),
});

async function hasColumn(client, table, column) {
  const result = await client.query(
    "select 1 from information_schema.columns where table_name=$1 and column_name=$2 limit 1",
    [String(table || "").toLowerCase(), String(column || "").toLowerCase()]
  );
  return result.rowCount > 0;
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod.toUpperCase();
    const rawUrl = event.rawUrl || `https://local${event.path || ''}`;
    const path = new URL(rawUrl).pathname;

    // GET /api/templates (compatibile con /api/templates)
    if (method === "GET" && /\/(api2|api)\/templates(\/)?$/.test(path)) {
      const client = await db();
      try {
        const codeColumn = await hasColumn(client, "templates", "code");
        const moduleColumn = await hasColumn(client, "templates", "module");
        const query = `
          select
            t.id,
            t.name,
            t.slug,
            t.type,
            ${codeColumn ? "t.code" : "t.slug"} as code,
            ${moduleColumn ? "t.module" : "'CER'"} as module,
            (select max(version) from template_versions v where v.template_id = t.id) as latest_version
          from templates t
          order by t.created_at desc`;
        const { rows } = await client.query(query);
        const safeRows = rows.map((row) => {
          const coalesce = (...values) => {
            for (const value of values) {
              if (value == null) continue;
              const text = String(value).trim();
              if (text) return text;
            }
            return '';
          };

          const slug = coalesce(row.slug, row.code, row.name, row.id);
          const code = coalesce(row.code, row.slug, row.name, row.id);
          const module = coalesce(row.module, 'CER');
          const version = row.version ?? row.latest_version ?? null;

          return {
            ...row,
            slug,
            code,
            module,
            version,
          };
        });
        return ok(safeRows);
      } finally {
        await client.end();
      }
    }

    // POST /api/templates/upload
    if (method === "POST" && /\/(api2|api)\/templates\/upload(\/)?$/.test(path)) {
      const body = parseBody(event);
      const { name, slug, type, changelog, content_text, file, code, module } = body;
      if (!name || !slug || !type) return err(400, "Missing name/slug/type");

      const client = await db();
      try {
        const hasCode = await hasColumn(client, "templates", "code");
        const hasModule = await hasColumn(client, "templates", "module");

        const columns = ["name", "slug", "type", "editable", "updated_at"];
        const values = ["$1", "$2", "$3", "true", "now()"];
        const params = [name, slug, type];
        let paramIndex = params.length + 1;

        if (hasCode) {
          columns.push("code");
          values.push(`$${paramIndex++}`);
          params.push(code || slug);
        }

        if (hasModule) {
          columns.push("module");
          values.push(`$${paramIndex++}`);
          params.push(module || "CER");
        }

        const insertSql = `insert into templates (${columns.join(",")}) values (${values.join(",")}) returning id`;
        const inserted = await client.query(insertSql, params);
        const templateId = inserted.rows[0].id;
        const version = 1;

        if (type === "docx") {
          if (!file) return err(400, "Missing DOCX base64 file");
          await client.query(
            "insert into template_versions (template_id, version, content, changelog) values ($1,$2,$3,$4)",
            [templateId, version, Buffer.from(file, "base64"), changelog || "v1"]
          );
        } else {
          if (!content_text) return err(400, "Missing content_text");
          await client.query(
            "insert into template_versions (template_id, version, content_text, changelog) values ($1,$2,$3,$4)",
            [templateId, version, content_text, changelog || "v1"]
          );
        }

        return ok({ ok: true, templateId, version });
      } finally {
        await client.end();
      }
    }

    // POST /api/templates/update
    if (method === "POST" && /\/(api2|api)\/templates\/update(\/)?$/.test(path)) {
      const body = parseBody(event);
      const { templateId, changelog, content_text, file } = body;
      if (!templateId) return err(400, "Missing templateId");

      const client = await db();
      try {
        const template = await client.query("select type from templates where id=$1", [templateId]);
        if (!template.rows.length) return err(404, "Template not found");
        const type = template.rows[0].type;

        const versionResult = await client.query(
          "select coalesce(max(version),0)+1 as v from template_versions where template_id=$1",
          [templateId]
        );
        const version = versionResult.rows[0].v;

        if (type === "docx") {
          if (!file) return err(400, "Missing DOCX base64 file");
          await client.query(
            "insert into template_versions (template_id, version, content, changelog) values ($1,$2,$3,$4)",
            [templateId, version, Buffer.from(file, "base64"), changelog || `v${version}`]
          );
        } else {
          if (!content_text) return err(400, "Missing content_text");
          await client.query(
            "insert into template_versions (template_id, version, content_text, changelog) values ($1,$2,$3,$4)",
            [templateId, version, content_text, changelog || `v${version}`]
          );
        }

        return ok({ ok: true, templateId, version });
      } finally {
        await client.end();
      }
    }

    return err(404, "Not found");
  } catch (error) {
    console.error("templates2 error:", error);
    return err(500, "Internal error");
  }
};
