import { authFetch, identityReady, getSessionSync } from './identity.js';

const ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Superadmin', description: 'Accesso completo a tutte le funzioni.' },
  { value: 'admin', label: 'Admin', description: 'Approva preventivi e gestisce configurazioni generali.' },
  { value: 'agente', label: 'Agente', description: 'Gestisce CRM e crea CER nelle cabine autorizzate.' },
  { value: 'resp-cer', label: 'Resp. CER', description: 'Consulta la CER di cui è titolare o delegato.' },
  { value: 'prosumer', label: 'Prosumer', description: 'Vede la CER associata e il proprio impianto.' },
  { value: 'produttore', label: 'Produttore', description: 'Vede la CER associata e il proprio impianto.' },
  { value: 'consumer', label: 'Consumer', description: 'Visualizza solo la CER di appartenenza.' }
];

const state = {
  users: [],
  filteredUsers: [],
  currentUser: null,
  loading: false,
  saving: false,
  creating: false,
  sessionEmail: null
};

const elements = {};

function $(selector) {
  return document.querySelector(selector);
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('it-IT');
  } catch (error) {
    console.warn('[admin-users] impossibile formattare la data', value, error);
    return value;
  }
}

function formatRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return '<span class="badge muted">Nessun ruolo</span>';
  }
  return roles
    .map((role) => {
      const option = ROLE_OPTIONS.find((item) => item.value === role);
      const label = option ? option.label : role;
      return `<span class="badge">${label}</span>`;
    })
    .join(' ');
}

function formatTerritories(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return '<span class="muted">—</span>';
  }
  return list.join(', ');
}

function notify(message, type = 'info') {
  const detail = typeof message === 'string' ? message : JSON.stringify(message);
  window.dispatchEvent(
    new CustomEvent('cer:notify', {
      detail: type === 'error' ? `⚠️ ${detail}` : detail
    })
  );
}

function toggleHidden(element, hidden) {
  if (!element) return;
  element.hidden = Boolean(hidden);
}

function renderRoleOptions(container, selected = []) {
  if (!container) return;
  const selectedSet = new Set(selected);
  container.innerHTML = ROLE_OPTIONS.map((role) => {
    const checked = selectedSet.has(role.value) ? 'checked' : '';
    return `
      <label class="role-option">
        <input type="checkbox" name="roles" value="${role.value}" ${checked}>
        <span>
          <strong>${role.label}</strong>
          <small>${role.description}</small>
        </span>
      </label>
    `;
  }).join('');
}

function updateCountBadge() {
  if (!elements.countBadge) return;
  const total = state.filteredUsers.length;
  if (!total) {
    elements.countBadge.textContent = '';
    toggleHidden(elements.countBadge, true);
    return;
  }
  elements.countBadge.textContent = `${total} utenti`;
  toggleHidden(elements.countBadge, false);
}

function renderUsers() {
  if (!elements.tableBody || !elements.emptyState) return;

  elements.tableBody.innerHTML = '';
  if (state.filteredUsers.length === 0) {
    toggleHidden(elements.emptyState, false);
    return;
  }
  toggleHidden(elements.emptyState, true);

  const fragment = document.createDocumentFragment();
  state.filteredUsers.forEach((user) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.email || '—'}</td>
      <td>${user.displayName || '—'}</td>
      <td>${formatRoles(user.roles)}</td>
      <td>${formatTerritories(user.territories)}</td>
      <td>${formatDate(user.metadata?.lastSignInTime)}</td>
      <td class="table-actions">
        <button type="button" class="btn ghost" data-action="edit" data-uid="${user.uid}">Gestisci</button>
      </td>
    `;
    if (user.disabled) {
      row.classList.add('muted');
    }
    fragment.appendChild(row);
  });
  elements.tableBody.appendChild(fragment);
  updateCountBadge();
}

function filterUsers(query = '') {
  const token = query.trim().toLowerCase();
  if (!token) {
    state.filteredUsers = [...state.users];
    return;
  }
  state.filteredUsers = state.users.filter((user) => {
    return [user.email, user.displayName, user.uid]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(token));
  });
}

function setLoading(isLoading) {
  state.loading = isLoading;
  if (elements.reloadBtn) {
    elements.reloadBtn.disabled = isLoading;
  }
  if (elements.tableWrap) {
    elements.tableWrap.classList.toggle('loading', isLoading);
  }
}

async function fetchUsers() {
  if (state.loading) return;
  setLoading(true);
  toggleHidden(elements.errorText, true);
  try {
    const response = await authFetch('/.netlify/functions/admin-users');
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error?.error?.message || 'Impossibile caricare gli utenti.');
    }
    const payload = await response.json();
    state.users = Array.isArray(payload.users) ? payload.users : [];
    filterUsers(elements.search?.value || '');
    renderUsers();
    notify('Elenco utenti aggiornato.');
  } catch (error) {
    console.error('[admin-users] caricamento utenti fallito:', error);
    elements.errorText.textContent = error.message || 'Errore durante il caricamento degli utenti.';
    toggleHidden(elements.errorText, false);
  } finally {
    setLoading(false);
  }
}

function parseTerritories(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectRoles(container) {
  if (!container) return [];
  const inputs = container.querySelectorAll('input[name="roles"]:checked');
  return Array.from(inputs).map((input) => input.value);
}

function fillForm(user) {
  state.currentUser = user;
  if (!user) return;
  elements.formTitle.textContent = user.displayName ? `Modifica ${user.displayName}` : 'Modifica utente';
  elements.formEmail.textContent = user.email || user.uid;
  elements.displayName.value = user.displayName || '';
  elements.password.value = '';
  elements.disabled.checked = Boolean(user.disabled);
  elements.territories.value = (user.territories || []).join(', ');
  renderRoleOptions(elements.roleOptions, user.roles || []);
  toggleHidden(elements.editor, false);
  toggleHidden(elements.formError, true);
}

function resetForm() {
  if (!state.currentUser) return;
  fillForm(state.currentUser);
}

async function saveCurrentUser(event) {
  event.preventDefault();
  if (!state.currentUser || state.saving) return;
  state.saving = true;
  toggleHidden(elements.formError, true);
  elements.saveBtn.disabled = true;

  const roles = collectRoles(elements.roleOptions);
  const territories = parseTerritories(elements.territories.value);
  const payload = {
    uid: state.currentUser.uid,
    displayName: elements.displayName.value.trim() || undefined,
    roles,
    territories,
    disabled: elements.disabled.checked
  };
  const password = elements.password.value.trim();
  if (password) {
    payload.password = password;
  }

  try {
    const response = await authFetch('/.netlify/functions/admin-users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error?.message || 'Impossibile aggiornare l\'utente.');
    }
    const updated = data.user;
    state.users = state.users.map((user) => (user.uid === updated.uid ? updated : user));
    filterUsers(elements.search?.value || '');
    renderUsers();
    state.currentUser = updated;
    fillForm(updated);
    notify(`Ruoli aggiornati per ${updated.email || updated.uid}.`);
  } catch (error) {
    console.error('[admin-users] salvataggio utente fallito:', error);
    elements.formError.textContent = error.message || 'Aggiornamento non riuscito.';
    toggleHidden(elements.formError, false);
  } finally {
    state.saving = false;
    elements.saveBtn.disabled = false;
  }
}

async function createUser(event) {
  event.preventDefault();
  if (state.creating) return;
  state.creating = true;
  toggleHidden(elements.createError, true);
  const formData = new FormData(event.currentTarget);
  const roles = formData.getAll('roles');
  const territories = parseTerritories(formData.get('territories'));

  const payload = {
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName') || undefined,
    roles,
    territories
  };

  try {
    const response = await authFetch('/.netlify/functions/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error?.message || 'Impossibile creare l\'utente.');
    }
    state.users.push(data.user);
    filterUsers(elements.search?.value || '');
    renderUsers();
    event.currentTarget.reset();
    renderRoleOptions(elements.createRoleOptions, []);
    notify(`Utente ${data.user.email || data.user.uid} creato con successo.`);
  } catch (error) {
    console.error('[admin-users] creazione utente fallita:', error);
    elements.createError.textContent = error.message || 'Creazione non riuscita.';
    toggleHidden(elements.createError, false);
  } finally {
    state.creating = false;
  }
}

function handleTableClick(event) {
  const target = event.target.closest('[data-action="edit"]');
  if (!target) return;
  const { uid } = target.dataset;
  const user = state.users.find((item) => item.uid === uid);
  if (user) {
    fillForm(user);
  }
}

function initElements() {
  elements.tableBody = $('#users-table tbody');
  elements.tableWrap = $('#users-table-wrap');
  elements.emptyState = $('#users-empty');
  elements.errorText = $('#users-error');
  elements.search = $('#user-search');
  elements.reloadBtn = $('#btn-reload-users');
  elements.countBadge = $('#user-count-badge');
  elements.editor = $('#user-editor');
  elements.form = $('#user-form');
  elements.formTitle = $('#user-form-title');
  elements.formEmail = $('#user-form-email');
  elements.displayName = $('#user-display-name');
  elements.password = $('#user-password');
  elements.disabled = $('#user-disabled');
  elements.roleOptions = $('#user-role-options');
  elements.territories = $('#user-territories');
  elements.saveBtn = $('#user-save-btn');
  elements.resetBtn = $('#user-reset-btn');
  elements.formError = $('#user-form-error');
  elements.closeBtn = $('#user-form-close');
  elements.createForm = $('#create-user-form');
  elements.createRoleOptions = $('#create-role-options');
  elements.createError = $('#create-user-error');
}

function bindEvents() {
  if (elements.reloadBtn) {
    elements.reloadBtn.addEventListener('click', () => fetchUsers());
  }
  if (elements.search) {
    elements.search.addEventListener('input', (event) => {
      filterUsers(event.target.value);
      renderUsers();
    });
  }
  if (elements.tableBody) {
    elements.tableBody.addEventListener('click', handleTableClick);
  }
  if (elements.form) {
    elements.form.addEventListener('submit', saveCurrentUser);
  }
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', (event) => {
      event.preventDefault();
      resetForm();
    });
  }
  if (elements.closeBtn) {
    elements.closeBtn.addEventListener('click', () => {
      state.currentUser = null;
      toggleHidden(elements.editor, true);
    });
  }
  if (elements.createForm) {
    elements.createForm.addEventListener('submit', createUser);
    elements.createForm.addEventListener('reset', () => {
      setTimeout(() => renderRoleOptions(elements.createRoleOptions, []), 0);
    });
  }
}

function renderSessionInfo(session) {
  const email = session?.user?.email || null;
  state.sessionEmail = email;
  if (!email) return;
  const banner = document.createElement('div');
  banner.className = 'card soft info-banner';
  banner.innerHTML = `
    <strong>Accesso con:</strong> ${email}
    <p class="info-text">Solo un Superadmin può modificare ruoli e utenti.</p>
  `;
  const main = document.querySelector('main');
  if (main) {
    main.insertBefore(banner, main.firstElementChild);
  }
}

function initRolePanels() {
  renderRoleOptions(elements.roleOptions, []);
  renderRoleOptions(elements.createRoleOptions, ['consumer']);
}

async function init() {
  initElements();
  bindEvents();
  initRolePanels();
  identityReady
    .then((session) => {
      renderSessionInfo(session);
      return session;
    })
    .catch((error) => console.warn('[admin-users] identity non disponibile:', error));
  filterUsers('');
  renderUsers();
  await fetchUsers();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.AdminUsers = {
  refresh: fetchUsers,
  getState: () => ({ ...state }),
  getSession: () => getSessionSync?.()
};
