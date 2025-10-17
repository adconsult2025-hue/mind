function parseBody(event) {
  try {
    let raw = event.body || '';
    if (event.isBase64Encoded && raw) {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    }
    const ct = (event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      return raw ? JSON.parse(raw) : {};
    }
    if (ct.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(raw).entries());
    }
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  } catch (e) {
    console.error('Body parse error:', e, {
      headers: event.headers,
      sample: (event.body || '').slice(0, 200)
    });
    return {};
  }
}

module.exports = { parseBody };
