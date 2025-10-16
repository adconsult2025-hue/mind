import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  getIdTokenResult,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

const params = new URLSearchParams(window.location.search);
const redirectParam = params.get('redirect');
const redirectTarget = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/index.html';

const form = document.querySelector('#login-form');
const emailInput = form?.querySelector('input[type="email"]');
const passwordInput = form?.querySelector('input[type="password"]');
const submitButton = form?.querySelector('button[type="submit"]');
const statusBox = document.querySelector('[data-login-status]');
const errorBox = document.querySelector('[data-login-error]');
const logoutButton = document.querySelector('[data-action="logout-current"]');
const goBackButton = document.querySelector('[data-action="go-back"]');

function waitAuth() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function spin() {
      if (window.__authError === 'NO_CONFIG') {
        reject(new Error('Configurazione Firebase mancante.'));
        return;
      }
      if (window.__authReady && window.firebaseAuth) {
        resolve(window.firebaseAuth);
        return;
      }
      if (Date.now() - start > 5000) {
        reject(new Error('Firebase Authentication non inizializzato.'));
        return;
      }
      setTimeout(spin, 50);
    })();
  });
}

function setStatus(type, message) {
  if (!statusBox) return;
  statusBox.classList.remove('error', 'success');
  if (type === 'error') {
    statusBox.classList.add('error');
  } else if (type === 'success') {
    statusBox.classList.add('success');
  }
  statusBox.textContent = message;
}

function showError(message) {
  if (!errorBox) return;
  if (!message) {
    errorBox.textContent = '';
    errorBox.hidden = true;
  } else {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
}

function setLoading(isLoading) {
  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Accesso in corso…' : 'Accedi';
  }
  if (emailInput) emailInput.disabled = isLoading;
  if (passwordInput) passwordInput.disabled = isLoading;
}

function translateAuthError(error) {
  if (!error) return 'Accesso non riuscito. Riprova.';
  if (typeof error === 'string') return error;
  const code = error.code || error.message || '';
  if (code.includes('config')) {
    return 'Configurazione Firebase non disponibile. Contatta l\'amministratore.';
  }
  const map = {
    'auth/invalid-credential': 'Credenziali non valide. Controlla email e password.',
    'auth/invalid-email': 'Formato email non valido.',
    'auth/user-disabled': 'Account disabilitato. Contatta l\'amministratore.',
    'auth/user-not-found': 'Utente non trovato.',
    'auth/wrong-password': 'Password non corretta.',
    'auth/too-many-requests': 'Troppi tentativi falliti. Attendi qualche minuto e riprova.'
  };
  return map[code] || 'Accesso non riuscito. Riprova.';
}

function redirectToTarget() {
  window.location.assign(redirectTarget);
}

function describeUser(user) {
  if (!user) return 'utente';
  return user.displayName || user.email || 'utente';
}

function handleAuthState(user) {
  if (!user) {
    setStatus('info', 'Inserisci le credenziali fornite dall\'amministratore.');
    showError('');
    if (logoutButton) logoutButton.hidden = true;
    if (goBackButton) goBackButton.hidden = false;
    return;
  }

  setStatus('success', `Accesso effettuato come ${describeUser(user)}.`);
  showError('');
  if (logoutButton) logoutButton.hidden = false;
  if (goBackButton) goBackButton.hidden = false;
}

function handleAuthError(error) {
  console.warn('[login] errore autenticazione:', error);
  setStatus('error', 'Accesso non riuscito.');
  showError(translateAuthError(error));
}

function disableForm() {
  if (!form) return;
  const controls = form.querySelectorAll('input, button');
  controls.forEach((control) => {
    control.disabled = true;
  });
}

waitAuth()
  .then((auth) => {
    onAuthStateChanged(auth, (user) => {
      handleAuthState(user);
      if (user) {
        logoutButton?.removeAttribute('hidden');
      }
    });

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!emailInput || !passwordInput) return;
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) {
          showError('Inserisci sia email sia password.');
          return;
        }
        setStatus('info', 'Verifica delle credenziali in corso…');
        showError('');
        setLoading(true);
        try {
          const credentials = await signInWithEmailAndPassword(auth, email, password);
          await getIdTokenResult(credentials.user, true);
          handleAuthState(credentials.user);
          setTimeout(redirectToTarget, 300);
        } catch (error) {
          handleAuthError(error);
        } finally {
          setLoading(false);
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        signOut(auth)
          .then(() => {
            setStatus('info', 'Sessione terminata. Inserisci le nuove credenziali.');
            showError('');
          })
          .catch((error) => {
            console.warn('[login] impossibile eseguire il logout:', error);
            showError('Logout non riuscito. Riprovare.');
          });
      });
    }
  })
  .catch((error) => {
    console.warn('[login] inizializzazione Firebase fallita:', error);
    setStatus('error', 'Autenticazione non disponibile.');
    showError(error?.message || 'Configurazione Firebase non disponibile.');
    disableForm();
  });

if (goBackButton) {
  goBackButton.addEventListener('click', () => {
    window.location.assign('/');
  });
}
