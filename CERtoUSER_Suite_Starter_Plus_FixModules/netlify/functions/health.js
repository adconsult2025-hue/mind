const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*'
};

exports.handler = async () => ({
  statusCode: 200,
  headers,
  body: JSON.stringify({ ok: true, status: 'healthy' })
});
