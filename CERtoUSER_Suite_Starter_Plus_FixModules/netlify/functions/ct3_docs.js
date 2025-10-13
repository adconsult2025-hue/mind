const { CT3_PHASES, composeDocs } = require('./ct3_rules');
const { guard } = require('./_safe');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function headers() {
  return { ...HEADERS };
}

function clonePhases(phases) {
  return phases.map((phase) => ({ ...phase }));
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }
  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const subject = params.subject_type;
      const intervention = params.intervention_type;
      const documents = composeDocs(subject, intervention);
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: { phases: clonePhases(CT3_PHASES), documents } })
      };
    }
    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message || 'Errore interno' } })
    };
  }
});
