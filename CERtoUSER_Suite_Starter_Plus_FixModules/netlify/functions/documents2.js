const { Client } = require("pg");
const Handlebars = require("handlebars");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const { nanoid } = require("nanoid");
const fs = require("fs"); const path = require("path");
const connStr = process.env.NEON_DATABASE_URL;
async function db(){ const c=new Client({connectionString:connStr,ssl:{rejectUnauthorized:false}}); await c.connect(); return c; }
const ok=(d)=>({statusCode:200,headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
const err=(s,m)=>({statusCode:s,headers:{'Content-Type':'application/json'},body:JSON.stringify({ok:false,error:{code:String(s),message:m}})});

async function buildContext(refType, refId){
  if (refType === "CER") {
    return { CER:{ Nome:"CER Ponte Grande", FormaGiuridica:"Associazione", SedeLegale:"Via Roma 1",
                   CodiceFiscale:"12345678901", Rappresentante:{Nome:"Mario Rossi"}, PEC:"cer@pec.it",
                   CabinaPrimaria:{Codice:"CP-001", Descrizione:"Ponte Grande"} },
             CTU:{ RagioneSociale:"CERtoUSER S.r.l.", Sede:"Roma", PIVA:"IT09876543210", Referente:"David Azzellino", PEC:"certouser@pec.it"},
             Corrispettivo:{ RoyaltyPercent:15, Fisso:1000 }, Data:{ Decorrenza:"2025-10-15"},
             RisoluzioneControversie:"Mediazione obbligatoria; Foro di Frosinone" };
  }
  return { CER:{ Nome:"CER Ponte Grande", CodiceFiscale:"12345678901",
                 CabinaPrimaria:{Codice:"CP-001", Descrizione:"Ponte Grande"} },
           Membro:{ RagioneSocialeONome:"Impianti Verdi S.r.l.", CF_PIVA:"IT1122334455", PEC:"impiantiverdi@pec.it" },
           Impianto:{ Codice:"FV-123", kWp:180, POD:"IT001E123..." },
           Riparti:{ Produttore:{ Percentuale:55 } },
           Calcoli:{ Totale75perKWp:(180*75).toFixed(2) } };
}

exports.handler = async (event) => {
  try{
    if (event.httpMethod.toUpperCase() !== "POST") return err(405, "POST only");
    const body = JSON.parse(event.body||"{}");
    let { templateSlug, refType, refId, output } = body;
    if (!templateSlug || !refType || !refId) return err(400,"Missing templateSlug/refType/refId");

    const client = await db();
    try{
      // accetta slug o code
      const t = await client.query("SELECT id,type FROM templates WHERE slug=$1 OR code=$1",[templateSlug]);
      if (!t.rows.length) return err(404,"Modello non trovato");
      const { id: templateId, type } = t.rows[0];

      const v = await client.query("SELECT version,content,content_text FROM template_versions WHERE template_id=$1 ORDER BY version DESC LIMIT 1",[templateId]);
      if (!v.rows.length) return err(404,"Nessuna versione del modello");

      const context = await buildContext(refType, refId);
      const dir = process.env.FILE_STORAGE_DIR || path.join(process.cwd(),"public","docs");
      fs.mkdirSync(dir,{recursive:true});
      const id = nanoid(10);

      if (type === "docx") {
        const zip = new PizZip(Buffer.from(v.rows[0].content));
        const doc = new Docxtemplater(zip,{paragraphLoop:true,linebreaks:true});
        doc.setData(context); doc.render();
        const buf = doc.getZip().generate({type:"nodebuffer"});
        const fname = `${templateSlug}-${refType}-${refId}-${id}.docx`;
        fs.writeFileSync(path.join(dir,fname), buf);
        return ok({ ok:true, public_url: `/docs/${fname}` });
      } else {
        const html = Handlebars.compile(v.rows[0].content_text)(context);
        const fname = `${templateSlug}-${refType}-${refId}-${id}.html`;
        fs.writeFileSync(path.join(dir,fname), Buffer.from(html,"utf8"));
        return ok({ ok:true, public_url: `/docs/${fname}` });
      }
    } finally { await client.end(); }
  } catch(e){ console.error(e); return err(500,"Internal error"); }
};
