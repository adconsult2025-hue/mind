exports.handler = async (event, context) => {
  const u = context.clientContext?.user || null;
  return { statusCode:200, headers:{ "Content-Type":"application/json" },
           body: JSON.stringify({ ok:true, auth:!!u, email:u?.email||null, roles:u?.app_metadata?.roles||[] }) };
};
