import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Preferisci leggere da window.__FIREBASE_CONFIG__ (se esiste) o incolla qui i valori:
const cfg = (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.apiKey)
  ? window.__FIREBASE_CONFIG__
  : {
      apiKey:      "PASTE_API_KEY",
      authDomain:  "PASTE_PROJECT.firebaseapp.com",
      projectId:   "PASTE_PROJECT",
      appId:       "PASTE_APP_ID"
    };

if (!cfg.apiKey || !cfg.projectId) {
  console.error("[firebase-init] Config Firebase mancante o incompleta.");
} else {
  const app = initializeApp(cfg);
  window.firebaseAuth = getAuth(app);
  window.firebaseDB   = getFirestore(app);
}
