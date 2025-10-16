import { identityReady, signInWithEmailPassword, logout, getSessionSync } from './identity.js';

const params = new URLSearchParams(window.location.search);
const redirectParam = params.get('redirect');
const redirectTarget = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';

const form = document.querySelector('#login-form');
const emailInput = form?.querySelector('input[type="email"]');
const passwordInput = form?.querySelector('input[type="password"]');
const submitButton = form?.querySelector('button[type="submit"]');
const statusBox = document.querySelector('[data-login-status]');
const errorBox = document.querySelector('[data-login-error]');
const logoutButton = document.querySelector('[data-action="logout-current"]');
const goBackButton = document.querySelector('[data-action="go-back"]');

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

function setError(message) {
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

function handleAuthenticatedSession(session, options = {}) {
  const { redirect = false } = options;
  if (!session || !session.user) {
    setStatus('info', 'Inserisci le credenziali fornite dall\'amministratore.');
    setError('');
    if (logoutButton) logoutButton.hidden = true;
    if (goBackButton) goBackButton.hidden = false;
    return;
  }

  setStatus('success', `Accesso effettuato come ${session.user.full_name || session.user.email || 'utente'}.`);
  setError('');
  if (logoutButton) logoutButton.hidden = false;
  if (goBackButton) goBackButton.hidden = false;
  if (redirect) {
    setTimeout(() => redirectToTarget(), 480);
  }
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!emailInput || !passwordInput) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      setError('Inserisci sia email sia password.');
      return;
    }
    setError('');
    setStatus('info', 'Verifica delle credenziali in corso…');
    setLoading(true);
    try {
      await signInWithEmailPassword(email, password);
      const session = getSessionSync();
      handleAuthenticatedSession(session, { redirect: true });
    } catch (error) {
      console.warn('[login] errore autenticazione:', error);
      setStatus('error', 'Accesso non riuscito.');
      setError(translateAuthError(error));
    } finally {
      setLoading(false);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    logout()
      .then(() => {
        setStatus('info', 'Sessione terminata. Inserisci le nuove credenziali.');
        setError('');
      })
      .catch((error) => {
        console.warn('[login] impossibile eseguire il logout:', error);
        setError('Logout non riuscito. Riprovare.');
      });
  });
}

if (goBackButton) {
  goBackButton.addEventListener('click', () => {
    window.location.assign('/');
  });
}

identityReady
  .then((session) => {
    if (session && session.user) {
      handleAuthenticatedSession(session);
    } else {
      setStatus('info', 'Inserisci le credenziali fornite dall\'amministratore.');
    }
  })
  .catch((error) => {
    console.warn('[login] impossibile verificare la sessione corrente:', error);
    setStatus('error', 'Impossibile verificare la sessione.');
    setError('Verifica la connessione o riprova più tardi.');
  });
