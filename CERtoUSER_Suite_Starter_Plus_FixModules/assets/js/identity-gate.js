(() => {
  const SELECTOR = '[data-requires-any-role]';
  const MESSAGE_CLASS = 'identity-gate-message';
  const DEFAULT_LOCK_MESSAGE = 'Sezione non abilitata per il tuo profilo.';
  let observer = null;
  let pendingApply = false;

  function onReady(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function normalizeRole(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function parseRoleList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(normalizeRole).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => normalizeRole(item))
        .filter(Boolean);
    }
    if (typeof value[Symbol.iterator] === 'function') {
      const list = [];
      for (const item of value) {
        const normalized = normalizeRole(item);
        if (normalized) list.push(normalized);
      }
      return list;
    }
    return [];
  }

  function collectRolesFromUser(user, target) {
    if (!user || typeof user !== 'object') return;
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
    sources.forEach((source) => {
      if (!source) return;
      if (Array.isArray(source) || source instanceof Set) {
        for (const value of source) {
          const normalized = normalizeRole(value);
          if (normalized) target.add(normalized);
        }
        return;
      }
      const normalized = normalizeRole(source);
      if (normalized) target.add(normalized);
    });
  }

  async function resolveUserRoles() {
    const roles = new Set();
    try {
      const session = typeof window !== 'undefined' ? window.MIND_IDENTITY : null;
      if (session?.user) {
        collectRolesFromUser(session.user, roles);
      } else if (session) {
        collectRolesFromUser(session, roles);
      }
    } catch (error) {
      console.warn('[identity-gate] impossibile leggere MIND_IDENTITY:', error);
    }

    const widget = typeof window !== 'undefined' ? window.netlifyIdentity : null;
    if (widget?.currentUser) {
      try {
        const current = widget.currentUser();
        if (current) {
          try {
            await current.jwt();
          } catch (jwtError) {
            console.warn('[identity-gate] token Identity non aggiornato:', jwtError);
          }
          collectRolesFromUser(current, roles);
        }
      } catch (error) {
        console.warn('[identity-gate] impossibile ottenere l\'utente correntemente loggato:', error);
      }
    }

    return Array.from(roles);
  }

  function ensureMessageElement(element) {
    if (!element) return null;
    let message = element.querySelector(`:scope > .${MESSAGE_CLASS}`);
    if (!message) {
      message = document.createElement('div');
      message.className = MESSAGE_CLASS;
      message.setAttribute('role', 'status');
      message.setAttribute('aria-live', 'polite');
      message.hidden = true;
      const text = document.createElement('span');
      message.appendChild(text);
      element.appendChild(message);
    }
    return message;
  }

  function lockElement(element, messageText) {
    if (!element) return;
    element.classList.add('gate-locked');
    const message = ensureMessageElement(element);
    if (message) {
      const textNode = message.querySelector('span');
      if (textNode) {
        textNode.textContent = messageText || DEFAULT_LOCK_MESSAGE;
      }
      message.hidden = false;
    }
    element.setAttribute('aria-disabled', 'true');
  }

  function unlockElement(element) {
    if (!element) return;
    element.classList.remove('gate-locked');
    const message = element.querySelector(`:scope > .${MESSAGE_CLASS}`);
    if (message) {
      message.hidden = true;
    }
    element.removeAttribute('aria-disabled');
  }

  async function applyGates() {
    if (typeof document === 'undefined' || !document.body) {
      return [];
    }
    pendingApply = false;
    const roles = await resolveUserRoles();

    document.body.dataset.userRoles = roles.join(',');
    document.body.classList.toggle('is-auth', roles.length > 0);

    const normalizedRoles = new Set(roles.map(normalizeRole));

    document.querySelectorAll(SELECTOR).forEach((element) => {
      const required = parseRoleList(element.getAttribute('data-requires-any-role'));
      if (!required.length) {
        unlockElement(element);
        return;
      }
      const gateMessage = element.getAttribute('data-gate-message') || DEFAULT_LOCK_MESSAGE;
      const hasRole = required.some((role) => normalizedRoles.has(role));
      if (hasRole) {
        unlockElement(element);
      } else {
        lockElement(element, gateMessage);
      }
    });

    return roles;
  }

  function scheduleApply() {
    if (pendingApply) return;
    pendingApply = true;
    Promise.resolve().then(() => {
      if (!pendingApply) return;
      applyGates().catch((error) => {
        console.warn('[identity-gate] applicazione gate fallita:', error);
      });
    });
  }

  function ensureObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          scheduleApply();
          return;
        }
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches?.(SELECTOR) || node.querySelector?.(SELECTOR)) {
              scheduleApply();
              return;
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-requires-any-role', 'data-gate-message'],
      childList: true,
      subtree: true
    });
  }

  function ensureIdentityHooks() {
    const widget = typeof window !== 'undefined' ? window.netlifyIdentity : null;
    if (!widget) return false;
    if (ensureIdentityHooks.bound) return true;
    ensureIdentityHooks.bound = true;
    const handlers = ['init', 'login', 'logout', 'error'];
    handlers.forEach((eventName) => {
      widget.on?.(eventName, () => {
        applyGates().catch((error) => {
          console.warn('[identity-gate] aggiornamento ruoli fallito:', error);
        });
      });
    });
    if (typeof widget.init === 'function') {
      try {
        widget.init();
      } catch (error) {
        console.warn('[identity-gate] impossibile inizializzare netlifyIdentity:', error);
      }
    }
    return true;
  }
  ensureIdentityHooks.bound = false;

  function injectWidgetScript() {
    if (typeof document === 'undefined') return;
    if (document.querySelector('script[src*="identity.netlify.com/v1/netlify-identity-widget.js"]')) {
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
    script.async = true;
    script.onload = () => {
      ensureIdentityHooks();
      applyGates().catch((error) => {
        console.warn('[identity-gate] applicazione gate post-caricamento widget fallita:', error);
      });
    };
    document.head.appendChild(script);
  }

  function exposeAPI() {
    if (typeof window === 'undefined') return;
    window.IdentityGate = {
      apply: () => applyGates(),
      getRoles: async () => {
        const roles = await resolveUserRoles();
        return roles.slice();
      },
      hasAny: async (requiredRoles) => {
        const roles = await resolveUserRoles();
        if (!requiredRoles) return roles.length > 0;
        const required = parseRoleList(requiredRoles);
        if (!required.length) return roles.length > 0;
        const normalized = new Set(roles.map(normalizeRole));
        return required.some((role) => normalized.has(role));
      }
    };
  }

  onReady(() => {
    ensureObserver();
    if (!ensureIdentityHooks()) {
      injectWidgetScript();
    }
    scheduleApply();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener?.('mind:identity', () => {
      applyGates().catch((error) => {
        console.warn('[identity-gate] aggiornamento gate su evento identity fallito:', error);
      });
    });
    const readyPromise = window.MIND_IDENTITY_READY;
    if (readyPromise?.then) {
      readyPromise.then(() => applyGates()).catch(() => {});
    }
  }

  exposeAPI();
})();
