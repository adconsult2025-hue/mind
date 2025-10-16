const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS"
};

const preflight = () => ({ statusCode: 204, headers: corsHeaders, body: "" });

const json = (status, body) => ({
  statusCode: status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

module.exports = { corsHeaders, preflight, json };
