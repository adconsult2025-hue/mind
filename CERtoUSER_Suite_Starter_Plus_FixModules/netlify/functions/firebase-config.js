const { json, preflight } = require('./_cors');

const CONFIG_JSON_ENV_KEYS = ['FIREBASE_CONFIG_JSON', 'FIREBASE_CLIENT_CONFIG_JSON'];

const MAPPING = {
  apiKey: ['FIREBASE_WEB_API_KEY', 'FIREBASE_API_KEY', 'REACT_APP_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY'],
  authDomain: ['FIREBASE_AUTH_DOMAIN', 'REACT_APP_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
  databaseURL: ['FIREBASE_DATABASE_URL', 'REACT_APP_FIREBASE_DATABASE_URL'],
  projectId: ['FIREBASE_PROJECT_ID', 'REACT_APP_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
  storageBucket: ['FIREBASE_STORAGE_BUCKET', 'REACT_APP_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'],
  messagingSenderId: ['FIREBASE_MESSAGING_SENDER_ID', 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
  appId: ['FIREBASE_APP_ID', 'REACT_APP_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID'],
  measurementId: ['FIREBASE_MEASUREMENT_ID', 'REACT_APP_FIREBASE_MEASUREMENT_ID', 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID']
};

function coerceString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

function resolveConfigFromJson() {
  for (const key of CONFIG_JSON_ENV_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      console.warn('[firebase-config] JSON config parsing failed for %s: %s', key, error.message);
    }
  }
  return null;
}

function resolveEnvValue(names) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const value = coerceString(process.env[name]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function buildConfig() {
  const fromJson = resolveConfigFromJson();
  const config = {};
  if (fromJson) {
    Object.assign(config, fromJson);
  }

  for (const [key, envNames] of Object.entries(MAPPING)) {
    if (config[key]) {
      continue;
    }
    const value = resolveEnvValue(envNames);
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
  if (!coerceString(config.apiKey)) {
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
