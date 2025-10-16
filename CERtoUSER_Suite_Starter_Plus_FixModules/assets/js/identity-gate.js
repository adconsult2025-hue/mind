(function () {
  const MODULE_ROLE_MAP = {
    hub: ['superadmin', 'admin', 'agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
    crm: ['superadmin', 'admin', 'agente'],
    cer: ['superadmin', 'admin', 'agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
    impianti: ['superadmin', 'admin', 'agente', 'prosumer', 'produttore'],
    preventivi: ['superadmin', 'admin', 'agente'],
    modelli: ['superadmin', 'admin'],
    contratti: ['superadmin', 'admin'],
    simulatori: ['superadmin', 'admin'],
    ct3: ['superadmin', 'admin'],
    utenti: ['superadmin']
  };

  const ROLE_INHERITANCE = {
    superadmin: ['admin', 'agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
    admin: ['agente', 'resp-cer', 'prosumer', 'produttore', 'consumer'],
    agente: ['resp-cer', 'prosumer', 'produttore', 'consumer']
  };

  const ROLE_ALIASES = new Map([
    ['superadmin', 'superadmin'],
    ['super-admin', 'superadmin'],
    ['super admin', 'superadmin'],
    ['owner', 'superadmin'],
    ['root', 'superadmin'],
    ['admin', 'admin'],
    ['administrator', 'admin'],
    ['agente', 'agente'],
    ['agent', 'agente'],
    ['sales', 'agente'],
    ['resp cer', 'resp-cer'],
    ['resp_cer', 'resp-cer'],
    ['resp-cer', 'resp-cer'],
    ['responsabilecer', 'resp-cer'],
    ['responsabile cer', 'resp-cer'],
    ['cer_manager', 'resp-cer'],
    ['cer-manager', 'resp-cer'],
    ['prosumer', 'prosumer'],
    ['producer', 'produttore'],
    ['produttore', 'produttore'],
    ['consumer', 'consumer'],
    ['member', 'consumer'],
    ['utente', 'consumer'],
    ['authenticated', 'authenticated']
  ]);

  const DEFAULT_DENIED_MESSAGE = 'Accesso non autorizzato per il tuo ruolo.';
  let currentRoles = new Set();
  let currentSession = null;

  function normalizeToken(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  }

  function canonicalizeRole(rawRole) {
    const token = normalizeToken(String(rawRole).replace(/[._]/g, ' '));
    if (!token) return null;
    if (ROLE_ALIASES.has(token)) {
      return ROLE_ALIASES.get(token);
    }
    return token;
  }

  function expandRoles(roles) {
    const expanded = new Set(roles);
    roles.forEach((role) => {
      const inherited = ROLE_INHERITANCE[role];
      if (inherited) {
        inherited.forEach((child) => expanded.add(child));
      }
    });
    return expanded;
  }

  function collectRolesFromSession(session) {
    const tokens = new Set();
    if (!session) return tokens;
    const user = session.user || {};
    const sources = [
      session.roles,
      user.roles,
      user.app_metadata?.roles,
      user.user_metadata?.roles,
      user.metadata?.roles,
      user.data?.roles,
      user.role,
      user.app_metadata?.role,
      user.user_metadata?.role,
      session.claims?.role,
      session.claims?.roles
    ];

    sources.forEach((source) => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach((item) => {
          const canonical = canonicalizeRole(item);
          if (canonical) tokens.add(canonical);
        });
      } else {
        const canonical = canonicalizeRole(source);
        if (canonical) tokens.add(canonical);
      }
    });

    if (user && Object.keys(user).length && tokens.size === 0) {
      tokens.add('authenticated');
    }

    return expandRoles(tokens);
  }

  function expandRequirements(tokens) {
    const expanded = new Set();
    tokens.forEach((token) => {
      const normalized = normalizeToken(token);
      if (!normalized) return;
      if (MODULE_ROLE_MAP[normalized]) {
        MODULE_ROLE_MAP[normalized].forEach((role) => expanded.add(role));
        return;
      }
      const canonical = canonicalizeRole(normalized);
      if (canonical) {
        expanded.add(canonical);
        return;
      }
      const moduleLike = normalized.split(':')[0].replace(/[-_.]/g, '');
      if (MODULE_ROLE_MAP[moduleLike]) {
        MODULE_ROLE_MAP[moduleLike].forEach((role) => expanded.add(role));
      }
    });
    return Array.from(expanded);
  }

  function parseRequiredRoles(value) {
    if (!value) return [];
    return value
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function ensureGateMessage(element) {
    let message = element.querySelector('.identity-gate-message');
    if (!message) {
      message = document.createElement('div');
      message.className = 'identity-gate-message';
      const span = document.createElement('span');
      message.appendChild(span);
      element.appendChild(message);
    }
    return message;
  }

  function unlockElement(element) {
    element.classList.remove('gate-locked', 'gate-hidden', 'gate-dim');
    element.removeAttribute('aria-disabled');
    const message = element.querySelector('.identity-gate-message');
    if (message) {
      message.hidden = true;
    }
  }

  function lockElement(element, reason) {
    element.classList.add('gate-locked');
    element.setAttribute('aria-disabled', 'true');
    const message = ensureGateMessage(element);
    if (message) {
      message.hidden = false;
      const span = message.querySelector('span');
      if (span) {
        span.textContent = reason || DEFAULT_DENIED_MESSAGE;
      }
    }
  }

  function applyToElement(element) {
    const tokens = parseRequiredRoles(element.getAttribute('data-requires-any-role'));
    if (!tokens.length) {
      unlockElement(element);
      return;
    }
    const requiredRoles = expandRequirements(tokens);
    const allowed = requiredRoles.some((role) => currentRoles.has(role));
    if (allowed) {
      unlockElement(element);
    } else {
      const message = element.getAttribute('data-gate-message') || DEFAULT_DENIED_MESSAGE;
      lockElement(element, message);
    }
  }

  function applyAccess(session = currentSession) {
    currentSession = session;
    currentRoles = collectRolesFromSession(session);
    if (typeof document !== 'undefined' && document.body) {
      if (currentRoles.size > 0) {
        document.body.classList.add('is-auth');
      } else {
        document.body.classList.remove('is-auth');
      }
      document.body.dataset.userRoles = Array.from(currentRoles).join(',');
      const territories = Array.isArray(session?.territories)
        ? session.territories
        : Array.isArray(session?.user?.territories)
          ? session.user.territories
          : [];
      document.body.dataset.userTerritories = (territories || []).join(',');
    }

    if (typeof document !== 'undefined') {
      document.querySelectorAll('[data-requires-any-role]').forEach(applyToElement);
    }
  }

  function hasAny(requiredTokens = []) {
    if (!requiredTokens || !requiredTokens.length) return true;
    const expanded = expandRequirements(requiredTokens);
    return expanded.some((role) => currentRoles.has(role));
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => applyAccess(window.MIND_IDENTITY || null));

  window.addEventListener('mind:identity', (event) => {
    const session = event?.detail?.session || null;
    applyAccess(session);
  });

  window.IdentityGate = {
    apply: () => applyAccess(currentSession),
    getRoles: async () => Array.from(currentRoles),
    hasAny: async (tokens) => hasAny(Array.isArray(tokens) ? tokens : [tokens].filter(Boolean)),
    getSession: () => currentSession
  };
})();
