const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
};

function preflight() {
  return { statusCode: 204, headers: corsHeaders, body: "" };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body ?? {})
  };
}

module.exports = { corsHeaders, preflight, json };
