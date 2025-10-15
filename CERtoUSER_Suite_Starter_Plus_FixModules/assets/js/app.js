import { requireSession, loadSession, isSessionValid, exposeSession } from './auth.js';

export const BRAND_NAME = 'MIND';

if (typeof window !== 'undefined') {
  const path = window.location.pathname || '/';
  const isLoginRoute = path === '/login' || path === '/login/' || path.startsWith('/login/');
  const rootEl = document.documentElement;

  if (!isLoginRoute && rootEl) {
    rootEl.dataset.authState = 'checking';
  }

  const session = isLoginRoute ? loadSession() : requireSession();

  if (isLoginRoute && session && isSessionValid(session)) {
    exposeSession(session);
  }

  if (isLoginRoute || session) {
    if (rootEl) {
      rootEl.dataset.authState = 'ready';
    }
    window.BRAND_NAME = BRAND_NAME;
    const safeModeFlag = (() => {
      if (window.__SAFE_MODE__ === true) return true;
      const raw = window.SAFE_MODE ?? window.__SAFE_MODE__;
      return String(raw).toLowerCase() === 'true';
    })();
    window.__SAFE_MODE__ = safeModeFlag;
    let toastContainer;
    const SIMULATORI_MODULE = 'simulatori';

    ['DEFAULT_VISIBLE_MODULES', 'VISIBLE_MODULES'].forEach((prop) => {
      const list = window[prop];
      if (Array.isArray(list)) {
        if (!list.includes(SIMULATORI_MODULE)) {
          list.push(SIMULATORI_MODULE);
        }
      } else if (list instanceof Set) {
        list.add(SIMULATORI_MODULE);
      }
    });

    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-brand-name]').forEach((el) => {
        el.textContent = BRAND_NAME;
      });

      const navItems = document.querySelectorAll('.nav-item');
      if (navItems.length) {
        const featureFlags = window.FEATURE_FLAGS || {};
        const simulatoriNavItems = document.querySelectorAll(`[data-module="${SIMULATORI_MODULE}"]`);

        const simulatoriPermission = `${SIMULATORI_MODULE}:view`;
        let hasPermission = true;
        const permissions = window.USER_PERMISSIONS;
        if (Array.isArray(permissions)) {
          hasPermission = permissions.includes(simulatoriPermission);
        } else if (permissions instanceof Set) {
          hasPermission = permissions.has(simulatoriPermission);
        } else if (permissions && typeof permissions === 'object') {
          if (typeof permissions.can === 'function') {
            try {
              hasPermission = !!permissions.can(simulatoriPermission);
            } catch (error) {
              hasPermission = true;
            }
          } else if (permissions[simulatoriPermission] === true) {
            hasPermission = true;
          } else if (permissions.simulatori) {
            const simulatoriPerm = permissions.simulatori;
            if (Array.isArray(simulatoriPerm)) {
              hasPermission = simulatoriPerm.includes('view');
            } else if (simulatoriPerm instanceof Set) {
              hasPermission = simulatoriPerm.has('view');
            } else if (typeof simulatoriPerm === 'object') {
              hasPermission = simulatoriPerm.view !== false;
            }
          }
        }

        const simulatoriDisabled = featureFlags[SIMULATORI_MODULE] === false || !hasPermission;
        if (simulatoriDisabled) {
          simulatoriNavItems.forEach((el) => el.remove());
        }

        const currentPath = window.location.pathname;
        navItems.forEach((link) => {
          const moduleName = link.getAttribute('data-module');
          if (!moduleName) return;
          const modulePath = `/modules/${moduleName}`;
          if (currentPath.includes(`${modulePath}/`) || currentPath.endsWith(modulePath)) {
            link.classList.add('active');
          }
        });
      }
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
  }
}
