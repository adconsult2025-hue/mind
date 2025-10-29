const { json, preflight } = require('./_cors');

const MAPPING = {
  apiKey: 'FIREBASE_WEB_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  databaseURL: 'FIREBASE_DATABASE_URL',
  projectId: 'FIREBASE_PROJECT_ID',
  storageBucket: 'FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
  appId: 'FIREBASE_APP_ID',
  measurementId: 'FIREBASE_MEASUREMENT_ID'
};

function buildConfig() {
  const config = {};
  for (const [key, envName] of Object.entries(MAPPING)) {
    const value = process.env[envName];
    if (value) {
      config[key] = value;
    }
  }
  return config;
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || '').toUpperCase();
  if (method === 'OPTIONS') {
    return preflight();
  }
  if (method !== 'GET') {
    return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non supportato' } });
  }
  const config = buildConfig();
  if (!config.apiKey) {
    return json(503, {
      ok: false,
      error: {
        code: 'CONFIG_MISSING',
        message: 'Configurazione Firebase non disponibile'
      }
    });
  }
  return json(200, config);
};
