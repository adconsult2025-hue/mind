const { Client } = require("pg");
const connStr = process.env.NEON_DATABASE_URL;
async function db(){ const c=new Client({connectionString:connStr,ssl:{rejectUnauthorized:false}}); await c.connect(); return c; }
const ok=(d)=>({statusCode:200,headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
const err=(s,m)=>({statusCode:s,headers:{'Content-Type':'application/json'},body:JSON.stringify({ok:false,error:{code:String(s),message:m}})});
exports.handler = async (event) => {
  try{
    const m = event.httpMethod.toUpperCase();
    const p = (new URL(event.rawUrl)).pathname;
    if(m==="GET" && /\/api2\/templates(\/)?$/.test(p)){
      const client=await db(); try{
        const { rows } = await client.query(`
          SELECT t.id, t.name, t.slug, COALESCE(t.code,t.slug) AS code, t.type, t.module,
                 (SELECT MAX(version) FROM template_versions v WHERE v.template_id=t.id) AS latest_version
          FROM templates t ORDER BY t.created_at DESC`);
        return ok(rows);
      } finally { await client.end(); }
    }
    if(m==="POST" && /\/api2\/templates\/upload(\/)?$/.test(p)){
      const body = JSON.parse(event.body||"{}");
      const { name, slug, type, module, changelog, content_text, file, code } = body;
      if(!name || !slug || !type) return err(400,"Missing name/slug/type");
      const client=await db(); try{
        const q = await client.query(
          "INSERT INTO templates(name,slug,type,editable,updated_at,module,code) VALUES($1,$2,$3,true,now(),$4,$5) RETURNING id",
          [name, slug, type, module||"CER", code||slug]
        );
        const templateId = q.rows[0].id, version=1;
        if(type==="docx"){
          if(!file) return err(400,"Missing DOCX base64 file");
          await client.query("INSERT INTO template_versions(template_id,version,content,changelog) VALUES($1,$2,$3,$4)",
            [templateId, version, Buffer.from(file,"base64"), changelog||"v1"]);
        } else {
          if(!content_text) return err(400,"Missing content_text");
          await client.query("INSERT INTO template_versions(template_id,version,content_text,changelog) VALUES($1,$2,$3,$4)",
            [templateId, version, content_text, changelog||"v1"]);
        }
        return ok({ok:true, templateId, version});
      } finally { await client.end(); }
    }
    if(m==="POST" && /\/api2\/templates\/update(\/)?$/.test(p)){
      const body = JSON.parse(event.body||"{}");
      const { templateId, changelog, content_text, file } = body;
      if(!templateId) return err(400,"Missing templateId");
      const client=await db(); try{
        const t = await client.query("SELECT type FROM templates WHERE id=$1",[templateId]);
        if(!t.rows.length) return err(404,"Template not found");
        const type = t.rows[0].type;
        const vr = await client.query("SELECT COALESCE(MAX(version),0)+1 AS v FROM template_versions WHERE template_id=$1",[templateId]);
        const version = vr.rows[0].v;
        if(type==="docx"){
          if(!file) return err(400,"Missing DOCX base64 file");
          await client.query("INSERT INTO template_versions(template_id,version,content,changelog) VALUES($1,$2,$3,$4)",
            [templateId, version, Buffer.from(file,"base64"), changelog||`v${version}`]);
        } else {
          if(!content_text) return err(400,"Missing content_text");
          await client.query("INSERT INTO template_versions(template_id,version,content_text,changelog) VALUES($1,$2,$3,$4)",
            [templateId, version, content_text, changelog||`v${version}`]);
        }
        return ok({ok:true, templateId, version});
      } finally { await client.end(); }
    }
    return err(404,"Not found");
  }catch(e){ console.error(e); return err(500,"Internal error"); }
};
