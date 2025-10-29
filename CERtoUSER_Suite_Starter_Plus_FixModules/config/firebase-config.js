(function initFirebaseConfig() {
  if (typeof window === 'undefined') {
    return;
  }

  const globalObject = window;

  const applyConfig = (config) => {
    const fallback = {
      apiKey: '',
      authDomain: '',
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
      measurementId: ''
    };
    const normalized = Object.assign({}, fallback, config || {});
    globalObject.__FIREBASE_CONFIG__ = normalized;
    return normalized;
  };

  if (globalObject.__FIREBASE_CONFIG__ && globalObject.__FIREBASE_CONFIG__.apiKey) {
    globalObject.__FIREBASE_CONFIG_PROMISE__ = Promise.resolve(globalObject.__FIREBASE_CONFIG__);
    return;
  }

  if (globalObject.__FIREBASE_RUNTIME_CONFIG__ && globalObject.__FIREBASE_RUNTIME_CONFIG__.apiKey) {
    const resolved = applyConfig(globalObject.__FIREBASE_RUNTIME_CONFIG__);
    globalObject.__FIREBASE_CONFIG_PROMISE__ = Promise.resolve(resolved);
    return;
  }

  let fetchedConfig = null;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/.netlify/functions/firebase-config', false);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 300) {
      fetchedConfig = JSON.parse(xhr.responseText);
    } else {
      console.warn('[firebase-config] risposta inattesa dalla funzione runtime:', xhr.status, xhr.responseText);
    }
  } catch (error) {
    console.warn('[firebase-config] impossibile recuperare la configurazione runtime', error);
  }

  const resolved = applyConfig(fetchedConfig);
  globalObject.__FIREBASE_CONFIG_PROMISE__ = Promise.resolve(resolved);
})();
