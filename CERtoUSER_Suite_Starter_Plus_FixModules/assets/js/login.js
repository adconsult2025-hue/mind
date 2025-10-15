const STORAGE_KEY = 'mind.identity.session';
const form = document.getElementById('login-form');
const statusEl = document.querySelector('[data-status]');
const submitBtn = document.querySelector('[data-submit]');
const submitLabel = submitBtn?.querySelector('span');
const redirectParam = new URLSearchParams(window.location.search).get('redirect');
const redirectTarget = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';

function exposeSession(session) {
  if (typeof window !== 'undefined') {
    window.MIND_IDENTITY = session;
  }
}

function loadSession() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Impossibile leggere la sessione Identity:', error);
    return null;
  }
}

function isSessionValid(session) {
  if (!session || typeof session !== 'object') return false;
  if (!session.accessToken || !session.expiresAt) return false;
  return Number(session.expiresAt) > Date.now() + 5_000;
}

function saveSession(session) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn('Impossibile salvare la sessione Identity:', error);
  }
  exposeSession(session);
}

function clearStatus() {
  if (!statusEl) return;
  statusEl.hidden = true;
  statusEl.textContent = '';
  statusEl.classList.remove('error', 'success');
  statusEl.removeAttribute('role');
  statusEl.setAttribute('aria-live', 'polite');
}

function setStatus(message, type = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.classList.remove('error', 'success');
  if (type === 'error') {
    statusEl.classList.add('error');
    statusEl.setAttribute('role', 'alert');
    statusEl.setAttribute('aria-live', 'assertive');
  } else if (type === 'success') {
    statusEl.classList.add('success');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
  } else {
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
  }
}

function setLoading(isLoading) {
  if (!submitBtn) return;
  submitBtn.disabled = isLoading;
  if (submitLabel) {
    submitLabel.textContent = isLoading ? 'Accesso in corso…' : 'Accedi';
  }
}

function redirectToApp() {
  window.location.assign(redirectTarget);
}

async function fetchIdentityToken(email, password) {
  const params = new URLSearchParams();
  params.set('grant_type', 'password');
  params.set('username', email);
  params.set('password', password);

  const response = await fetch('/.netlify/identity/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    // ignore parsing errors, handled below
  }

  if (!response.ok) {
    const message = data.error_description || data.error || 'Credenziali non valide o account non abilitato.';
    const error = new Error(message);
    error.code = data.error || response.status;
    throw error;
  }

  return data;
}

async function fetchIdentityUser(accessToken) {
  if (!accessToken) return null;
  try {
    const response = await fetch('/.netlify/identity/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn('Impossibile recuperare i dettagli utente Identity:', error);
    return null;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  clearStatus();

  const email = form?.email?.value?.trim();
  const password = form?.password?.value;

  if (!email || !password) {
    setStatus('Inserisci email e password per continuare.', 'error');
    return;
  }

  setLoading(true);

  try {
    const tokenInfo = await fetchIdentityToken(email, password);
    const accessToken = tokenInfo.access_token;
    const expiresIn = Number(tokenInfo.expires_in) || 3600;
    const createdAt = Date.now();

    const profile = await fetchIdentityUser(accessToken);

    const session = {
      accessToken,
      tokenType: tokenInfo.token_type,
      refreshToken: tokenInfo.refresh_token,
      expiresAt: createdAt + expiresIn * 1000,
      createdAt,
      user: profile || null
    };

    saveSession(session);
    setStatus('Accesso eseguito, reindirizzamento in corso…', 'success');

    setTimeout(redirectToApp, 600);
  } catch (error) {
    const message = error?.message || 'Accesso non riuscito. Verifica le credenziali e riprova.';
    setStatus(message, 'error');
  } finally {
    setLoading(false);
  }
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}

const existingSession = loadSession();
if (isSessionValid(existingSession)) {
  exposeSession(existingSession);
  setStatus('Sessione già attiva, reindirizzamento in corso…', 'success');
  setLoading(true);
  setTimeout(redirectToApp, 400);
}
