const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

const { guard } = require('./_safe');

exports.handler = guard(async () => ({
  statusCode: 200,
  headers,
  body: JSON.stringify({ ok: true, safeMode: process.env.SAFE_MODE === 'true' })
}));
