const SAFE_MODE = String(process.env.SAFE_MODE || '').toLowerCase() === 'true';

exports.handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*'
  },
  body: JSON.stringify({
    ok: true,
    ts: Date.now(),
    env: SAFE_MODE ? 'preview(dry-run)' : 'prod'
  })
});
