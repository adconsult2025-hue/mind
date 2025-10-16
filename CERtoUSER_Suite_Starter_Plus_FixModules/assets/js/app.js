import { identityReady, getSessionSync, logout } from './identity.js';

export const BRAND_NAME = 'MIND';

const UNIVERSAL_PERMISSION_TOKENS = new Set([
  '*',
  'all',
  'any',
  'full-access',
  'full_access',
  'unrestricted',
  'everything'
]);

const ADMIN_ROLE_TOKENS = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'owner',
  'editor',
  'manager',
  'staff',
  'operator',
  'backoffice',
  'back-office',
  'poweruser',
  'power-user',
  'cer-admin',
  'cer_manager'
]);

const ROLE_LABELS = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  agente: 'Agente',
  'resp-cer': 'Resp. CER',
  prosumer: 'Prosumer',
  produttore: 'Produttore',
  consumer: 'Consumer',
  authenticated: 'Autenticato'
};

if (typeof window !== 'undefined') {
  window.BRAND_NAME = BRAND_NAME;
  const safeModeFlag = (() => {
    if (window.__SAFE_MODE__ === true) return true;
    const raw = window.SAFE_MODE ?? window.__SAFE_MODE__;
    return String(raw).toLowerCase() === 'true';
  })();
  window.__SAFE_MODE__ = safeModeFlag;
  let toastContainer;
  let navRootElement;
  let navItemsCache = [];
  const NAV_MODULE_CONFIG = {
    simulatori: {
      label: 'SIMULATORE',
      href: '/modules/simulatori/index.html'
    },
    preventivi: {
      label: 'PREVENTIVATORE',
      href: '/modules/preventivi/index.html'
    },
    utenti: {
      label: 'UTENTI & RUOLI',
      href: '/modules/utenti/index.html'
    }
  };
  const CORE_NAV_MODULES = Object.keys(NAV_MODULE_CONFIG);

  function normalizeToken(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function collectRoleTokens(sessionOverride) {
    const tokens = new Set();
    if (typeof window === 'undefined') return tokens;
    const session = sessionOverride || window.MIND_IDENTITY || (typeof getSessionSync === 'function' ? getSessionSync() : null);
    const user = session?.user;
    if (!user || typeof user !== 'object') return tokens;
    const sources = [
      user.roles,
      user.role,
      user.app_metadata?.roles,
      user.app_metadata?.role,
      user.user_metadata?.roles,
      user.user_metadata?.role,
      user.metadata?.roles,
      user.metadata?.role,
      user.data?.roles,
      user.data?.role
    ];
    sources.forEach((value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((item) => {
          const normalized = normalizeToken(item);
          if (normalized) tokens.add(normalized);
        });
      } else if (value instanceof Set) {
        value.forEach((item) => {
          const normalized = normalizeToken(item);
          if (normalized) tokens.add(normalized);
        });
      } else {
        const normalized = normalizeToken(value);
        if (normalized) tokens.add(normalized);
      }
    });
    return tokens;
  }

  let sessionControlContainers = new Set();

  function collectTokensFromIterable(source) {
    const tokens = new Set();
    if (!source) return tokens;
    const addToken = (token) => {
      const normalized = normalizeToken(token);
      if (normalized) tokens.add(normalized);
    };
    if (Array.isArray(source)) {
      source.forEach(addToken);
    } else if (source instanceof Set) {
      source.forEach(addToken);
    } else if (typeof source === 'string') {
      addToken(source);
    } else if (typeof source[Symbol.iterator] === 'function') {
      for (const item of source) {
        addToken(item);
      }
    }
    return tokens;
  }

  function formatRoleLabels(roleTokens) {
    const labels = [];
    if (!roleTokens) return labels;
    const iterable = roleTokens instanceof Set ? roleTokens : new Set(roleTokens);
    iterable.forEach((token) => {
      const normalized = normalizeToken(token);
      if (!normalized || normalized === 'authenticated') return;
      const label = ROLE_LABELS[normalized] || token;
      if (!labels.includes(label)) {
        labels.push(label);
      }
    });
    return labels;
  }

  function ensureSessionControls() {
    if (typeof document === 'undefined') return [];
    const containers = document.querySelectorAll('[data-session-controls]');
    containers.forEach((container) => {
      if (!(container instanceof HTMLElement)) return;
      sessionControlContainers.add(container);
      if (container.dataset.sessionBound === 'true') return;
      container.dataset.sessionBound = 'true';
      container.innerHTML = `
        <div class="login-status" data-session-status>
          <span class="badge muted" data-session-badge>Verifica accesso…</span>
          <span class="session-info" data-session-info>Controllo credenziali in corso.</span>
        </div>
        <div class="session-actions">
          <button type="button" class="btn ghost" data-action="logout" hidden>Esci</button>
          <button type="button" class="btn" data-action="login">Accedi</button>
        </div>
      `;
      const loginButton = container.querySelector('[data-action="login"]');
      const logoutButton = container.querySelector('[data-action="logout"]');
      if (loginButton) {
        loginButton.addEventListener('click', () => {
          const redirectTarget =
            container.dataset.redirectTarget || `${window.location.pathname}${window.location.search || ''}`;
          const url = `/login/index.html?redirect=${encodeURIComponent(redirectTarget || '/')}`;
          window.location.assign(url);
        });
      }
      if (logoutButton) {
        logoutButton.addEventListener('click', () => {
          logout().catch((error) => {
            console.warn('[app] logout fallito:', error);
          });
        });
      }
    });
    return Array.from(sessionControlContainers);
  }

  function updateSessionControls(session) {
    const containers = ensureSessionControls();
    if (!containers.length) return;
    const roleTokens = collectRoleTokens(session);
    const roleLabels = formatRoleLabels(roleTokens);

    containers.forEach((container) => {
      if (!(container instanceof HTMLElement)) return;
      const badge = container.querySelector('[data-session-badge]');
      const info = container.querySelector('[data-session-info]');
      const loginButton = container.querySelector('[data-action="login"]');
      const logoutButton = container.querySelector('[data-action="logout"]');
      if (!badge || !info) return;

      if (!session || !session.user) {
        badge.className = 'badge warn';
        badge.textContent = 'Accesso richiesto';
        info.textContent = 'Accedi con le credenziali assegnate per proseguire.';
        if (loginButton) loginButton.hidden = false;
        if (logoutButton) logoutButton.hidden = true;
      } else {
        badge.className = 'badge green';
        badge.textContent = 'Autenticato';
        const displayName =
          session.user.full_name || session.user.displayName || session.user.email || session.user.phone_number || 'Account';
        info.textContent = roleLabels.length ? `${displayName} · ${roleLabels.join(', ')}` : displayName;
        if (loginButton) loginButton.hidden = true;
        if (logoutButton) logoutButton.hidden = false;
      }
    });
  }

  function buildModuleTokenSet(moduleName, permissionName) {
    const tokens = new Set();
    const moduleToken = normalizeToken(moduleName);
    const permissionToken = normalizeToken(permissionName);
    if (moduleToken) {
      tokens.add(moduleToken);
      tokens.add(`${moduleToken}:view`);
      tokens.add(`${moduleToken}:read`);
      tokens.add(`${moduleToken}:access`);
      tokens.add(`${moduleToken}:*`);
      tokens.add(`view:${moduleToken}`);
      tokens.add(`read:${moduleToken}`);
      tokens.add(`access:${moduleToken}`);
      tokens.add(`${moduleToken}_view`);
      tokens.add(`${moduleToken}-view`);
      tokens.add(`${moduleToken}_access`);
      tokens.add(`${moduleToken}-access`);
      tokens.add(`${moduleToken}.view`);
    }
    if (permissionToken) {
      tokens.add(permissionToken);
    }
    return tokens;
  }

  function hasAnyToken(candidateTokens, requiredTokens) {
    if (!candidateTokens || !requiredTokens) return false;
    for (const token of requiredTokens) {
      if (candidateTokens.has(token)) return true;
    }
    return false;
  }

  ['DEFAULT_VISIBLE_MODULES', 'VISIBLE_MODULES'].forEach((prop) => {
    const list = window[prop];
    CORE_NAV_MODULES.forEach((moduleName) => {
      if (Array.isArray(list)) {
        if (!list.includes(moduleName)) {
          list.push(moduleName);
        }
      } else if (list instanceof Set) {
        list.add(moduleName);
      }
    });
  });

  function gatherNavItems() {
    const root = navRootElement || document.querySelector('.main-nav');
    if (root) {
      navRootElement = root;
      navItemsCache = Array.from(root.querySelectorAll('.nav-item'));
    } else {
      navItemsCache = Array.from(document.querySelectorAll('.nav-item'));
    }
    navItemsCache.forEach((item) => {
      const moduleName = item.getAttribute('data-module');
      if (moduleName && !item.hasAttribute('data-requires-any-role')) {
        item.setAttribute('data-requires-any-role', moduleName);
      }
    });
    return navItemsCache;
  }

  function parseRequiredRolesAttribute(value) {
    if (!value) return [];
    return value
      .split(',')
      .map((token) => normalizeToken(token))
      .filter(Boolean);
  }

  async function evaluateNavAccess() {
    const navItems = navItemsCache.length ? navItemsCache : gatherNavItems();
    if (!navItems.length) return;
    const featureFlags = window.FEATURE_FLAGS || {};

    let normalizedIdentityRoles = null;
    if (window.IdentityGate?.getRoles) {
      try {
        const roles = await window.IdentityGate.getRoles();
        normalizedIdentityRoles = new Set(roles.map((role) => normalizeToken(role)));
      } catch (error) {
        console.warn('[app] impossibile leggere i ruoli IdentityGate:', error);
        normalizedIdentityRoles = new Set();
      }
    }

    navItems.forEach((link) => {
      const moduleName = link.getAttribute('data-module');
      if (!moduleName) return;
      const permissionName = `${moduleName}:view`;
      let allowed = hasModuleAccess(permissionName, moduleName);
      if (!allowed && normalizedIdentityRoles?.size) {
        const required = parseRequiredRolesAttribute(link.getAttribute('data-requires-any-role'));
        if (required.length) {
          allowed = required.some((role) => normalizedIdentityRoles.has(role));
        }
      }
      const featureDisabled = featureFlags[moduleName] === false;
      const isCoreModule = CORE_NAV_MODULES.includes(moduleName);
      const shouldDisable = !allowed || (featureDisabled && !isCoreModule);
      const defaultReason = 'Sezione non abilitata per il tuo profilo.';
      const reason = !allowed
        ? link.getAttribute('data-gate-message') || defaultReason
        : (featureDisabled && !isCoreModule)
          ? 'Modulo disattivato per questa istanza.'
          : '';
      setNavItemDisabled(link, shouldDisable, reason);
    });
  }

  function runNavAccessEvaluation() {
    evaluateNavAccess().catch((error) => {
      console.warn('[app] aggiornamento permessi di navigazione fallito:', error);
    });
  }

  function highlightActiveNavItem() {
    const navItems = navItemsCache.length ? navItemsCache : gatherNavItems();
    if (!navItems.length) return;
    const path = window.location.pathname || '';
    navItems.forEach((link) => {
      const moduleName = link.getAttribute('data-module');
      if (!moduleName) return;
      const modulePath = `/modules/${moduleName}`;
      if (path.includes(`${modulePath}/`) || path.endsWith(modulePath)) {
        link.classList.add('active');
      }
    });
  }

  function initializeNavigation() {
    document.querySelectorAll('[data-brand-name]').forEach((el) => {
      el.textContent = BRAND_NAME;
    });

    ensureSessionControls();
    try {
      updateSessionControls(getSessionSync?.());
    } catch (error) {
      console.warn('[app] impossibile inizializzare il pannello sessione:', error);
    }

    navRootElement = document.querySelector('.main-nav');
    if (navRootElement) {
      CORE_NAV_MODULES.forEach((moduleName) => ensureNavItem(navRootElement, moduleName));
    }

    gatherNavItems();
    runNavAccessEvaluation();
    highlightActiveNavItem();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavigation, { once: true });
  } else {
    initializeNavigation();
  }

  identityReady
    .then((session) => {
      updateSessionControls(session);
      runNavAccessEvaluation();
    })
    .catch((error) => {
      console.warn('[app] inizializzazione Identity fallita:', error);
    });

  window.addEventListener('mind:identity', (event) => {
    const session = event?.detail?.session || (typeof getSessionSync === 'function' ? getSessionSync() : null);
    updateSessionControls(session);
    runNavAccessEvaluation();
  });

  window.addEventListener('cer:notify', (event) => {
    const message = event?.detail;
    if (!message) return;
    showToast(message);
  });

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }

  function showToast(message) {
    ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function ensureNavItem(navRoot, moduleName) {
    if (!navRoot || !moduleName) return [];
    let existing = navRoot.querySelectorAll(`[data-module="${moduleName}"]`);
    if (existing.length) return Array.from(existing);
    const config = NAV_MODULE_CONFIG[moduleName];
    if (!config) return [];
    const link = document.createElement('a');
    link.className = 'btn nav-item';
    link.setAttribute('data-module', moduleName);
    link.setAttribute('data-requires-any-role', moduleName);
    link.href = config.href;
    link.textContent = config.label;
    const hubLink = navRoot.querySelector('.btn.ghost');
    navRoot.insertBefore(link, hubLink || null);
    existing = navRoot.querySelectorAll(`[data-module="${moduleName}"]`);
    return Array.from(existing);
  }

  function navDisabledClickHandler(event) {
    const target = event.currentTarget;
    if (!target || target.dataset.navDisabled !== 'true') return;
    event.preventDefault();
    event.stopPropagation();
    const reason = target.dataset.navDisabledReason;
    if (reason) {
      showToast(reason);
    }
  }

  function setNavItemDisabled(element, disabled, reason = '') {
    if (!element) return;
    if (disabled) {
      element.classList.add('nav-item-disabled');
      element.setAttribute('aria-disabled', 'true');
      element.dataset.navDisabled = 'true';
      if (reason) {
        element.dataset.navDisabledReason = reason;
        element.title = reason;
      } else {
        delete element.dataset.navDisabledReason;
        element.removeAttribute('title');
      }
      element.addEventListener('click', navDisabledClickHandler);
    } else {
      element.classList.remove('nav-item-disabled');
      element.removeAttribute('aria-disabled');
      element.dataset.navDisabled = 'false';
      delete element.dataset.navDisabledReason;
      element.removeAttribute('title');
      element.removeEventListener('click', navDisabledClickHandler);
    }
  }

  function hasModuleAccess(permissionName, moduleName) {
    const permissions = window.USER_PERMISSIONS;
    const normalizedModuleTokens = buildModuleTokenSet(moduleName, permissionName);
    const roleTokens = collectRoleTokens();
    if (hasAnyToken(roleTokens, UNIVERSAL_PERMISSION_TOKENS) || hasAnyToken(roleTokens, ADMIN_ROLE_TOKENS)) {
      return true;
    }
    if (normalizedModuleTokens.size && hasAnyToken(roleTokens, normalizedModuleTokens)) {
      return true;
    }
    if (Array.isArray(permissions)) {
      const tokens = collectTokensFromIterable(permissions);
      if (hasAnyToken(tokens, UNIVERSAL_PERMISSION_TOKENS) || hasAnyToken(tokens, ADMIN_ROLE_TOKENS)) {
        return true;
      }
      if (normalizedModuleTokens.size && hasAnyToken(tokens, normalizedModuleTokens)) {
        return true;
      }
      return tokens.has(normalizeToken(permissionName)) || tokens.has(normalizeToken(moduleName));
    }
    if (permissions instanceof Set) {
      const tokens = collectTokensFromIterable(permissions);
      if (hasAnyToken(tokens, UNIVERSAL_PERMISSION_TOKENS) || hasAnyToken(tokens, ADMIN_ROLE_TOKENS)) {
        return true;
      }
      if (normalizedModuleTokens.size && hasAnyToken(tokens, normalizedModuleTokens)) {
        return true;
      }
      return tokens.has(normalizeToken(permissionName)) || tokens.has(normalizeToken(moduleName));
    }
    if (permissions && typeof permissions === 'object') {
      if (typeof permissions.can === 'function') {
        try {
          return !!permissions.can(permissionName);
        } catch (error) {
          return true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(permissions, permissionName)) {
        const value = permissions[permissionName];
        if (value === true) return true;
        if (value === false) return false;
      }
      const roleCandidates = [];
      if (Array.isArray(permissions.roles)) roleCandidates.push(...permissions.roles);
      if (permissions.role) roleCandidates.push(permissions.role);
      if (roleCandidates.length) {
        const roleTokensFromObject = collectTokensFromIterable(roleCandidates);
        if (hasAnyToken(roleTokensFromObject, UNIVERSAL_PERMISSION_TOKENS) || hasAnyToken(roleTokensFromObject, ADMIN_ROLE_TOKENS)) {
          return true;
        }
        if (normalizedModuleTokens.size && hasAnyToken(roleTokensFromObject, normalizedModuleTokens)) {
          return true;
        }
      }
      let modulePermissions = moduleName ? permissions[moduleName] : undefined;
      if (!modulePermissions && permissions.modules && typeof permissions.modules === 'object') {
        modulePermissions = permissions.modules[moduleName];
      }
      if (Array.isArray(modulePermissions)) {
        const tokens = collectTokensFromIterable(modulePermissions);
        if (hasAnyToken(tokens, UNIVERSAL_PERMISSION_TOKENS) || hasAnyToken(tokens, ADMIN_ROLE_TOKENS)) {
          return true;
        }
        if (normalizedModuleTokens.size && hasAnyToken(tokens, normalizedModuleTokens)) {
          return true;
        }
        return tokens.has('view') || tokens.has(normalizeToken(permissionName));
      }
      if (modulePermissions instanceof Set) {
        const tokens = collectTokensFromIterable(modulePermissions);
        if (hasAnyToken(tokens, UNIVERSAL_PERMISSION_TOKENS) || hasAnyToken(tokens, ADMIN_ROLE_TOKENS)) {
          return true;
        }
        if (normalizedModuleTokens.size && hasAnyToken(tokens, normalizedModuleTokens)) {
          return true;
        }
        return tokens.has('view') || tokens.has(normalizeToken(permissionName));
      }
      if (modulePermissions && typeof modulePermissions === 'object') {
        if (Object.prototype.hasOwnProperty.call(modulePermissions, 'view')) {
          return modulePermissions.view !== false;
        }
        if (Object.prototype.hasOwnProperty.call(modulePermissions, permissionName)) {
          const value = modulePermissions[permissionName];
          if (value === true) return true;
          if (value === false) return false;
        }
        const nestedTokens = collectTokensFromIterable(modulePermissions.roles || []);
        if (hasAnyToken(nestedTokens, UNIVERSAL_PERMISSION_TOKENS) || hasAnyToken(nestedTokens, ADMIN_ROLE_TOKENS)) {
          return true;
        }
        if (normalizedModuleTokens.size && hasAnyToken(nestedTokens, normalizedModuleTokens)) {
          return true;
        }
      }
    }
    return true;
  }
}
