const isSafe = process.env.SAFE_MODE === 'true';

exports.guard = (fn) => async (event, context) => {
  if (isSafe && event.httpMethod !== 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, dryRun: true })
    };
  }
  try {
    return await fn(event, context);
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } })
    };
  }
};
