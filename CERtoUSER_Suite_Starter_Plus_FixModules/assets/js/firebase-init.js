import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const cfg = (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.apiKey) ? window.__FIREBASE_CONFIG__ : null;
if (!cfg) {
  window.__authReady = false;
  window.__authError = 'NO_CONFIG';
  console.error("[firebase-init] Config mancante");
} else {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    window.firebaseApp = app;
    window.firebaseAuth = getAuth(app);
    window.firebaseDB = getFirestore(app);
    window.__authReady = true;
    window.__authError = null;
    console.log("[firebase-init] OK");
  } catch (error) {
    window.__authReady = false;
    window.__authError = error;
    console.error("[firebase-init] errore inizializzazione", error);
  }
}
