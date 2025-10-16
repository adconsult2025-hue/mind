// Configurazione Firebase per l'applicazione client.
// Sostituisci i valori di esempio con quelli del tuo progetto Firebase.
// Questo file viene caricato prima dei moduli Identity e rende disponibile
// l'oggetto window.__FIREBASE_CONFIG__.

(function configureFirebase() {
  if (typeof window === 'undefined') return;

  const existingConfig = window.__FIREBASE_CONFIG__;
  if (existingConfig && typeof existingConfig === 'object') {
    return; // Config già fornita da un'altra sorgente.
  }

  window.__FIREBASE_CONFIG__ = {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'your-project-id.firebaseapp.com',
    projectId: 'your-project-id',
    appId: 'YOUR_FIREBASE_APP_ID',
    // facoltativi ma consigliati per alcune API (popola se disponibili)
    // messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    // storageBucket: 'your-project-id.appspot.com',
  };
})();
