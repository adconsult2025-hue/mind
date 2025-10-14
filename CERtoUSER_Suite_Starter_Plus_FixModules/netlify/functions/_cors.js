exports.headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.preflight = () => ({ statusCode: 200, headers: exports.headers, body: '' });
