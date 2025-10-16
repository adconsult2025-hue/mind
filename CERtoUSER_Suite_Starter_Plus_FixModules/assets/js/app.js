export const BRAND_NAME = 'MIND';

if (typeof window !== 'undefined') {
  window.BRAND_NAME = BRAND_NAME;
  const safeModeFlag = (() => {
    if (window.__SAFE_MODE__ === true) return true;
    const raw = window.SAFE_MODE ?? window.__SAFE_MODE__;
    return String(raw).toLowerCase() === 'true';
  })();
  window.__SAFE_MODE__ = safeModeFlag;
  let toastContainer;
  const SIMULATORI_MODULE = 'simulatori';
  const PREVENTIVI_MODULE = 'preventivi';
  const CORE_NAV_MODULES = [SIMULATORI_MODULE, PREVENTIVI_MODULE];

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

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-brand-name]').forEach((el) => {
      el.textContent = BRAND_NAME;
    });

    const navItems = document.querySelectorAll('.nav-item');
    if (navItems.length) {
      const featureFlags = window.FEATURE_FLAGS || {};
      CORE_NAV_MODULES.forEach((moduleName) => {
        const navElements = document.querySelectorAll(`[data-module="${moduleName}"]`);
        if (!navElements.length) return;
        const permissionName = `${moduleName}:view`;
        const allowed = hasModuleAccess(permissionName, moduleName);
        const disabled = featureFlags[moduleName] === false || !allowed;
        if (disabled) {
          navElements.forEach((el) => el.remove());
        }
      });

      const path = window.location.pathname;
      navItems.forEach((link) => {
        const moduleName = link.getAttribute('data-module');
        if (!moduleName) return;
        const modulePath = `/modules/${moduleName}`;
        if (path.includes(`${modulePath}/`) || path.endsWith(modulePath)) {
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

  function hasModuleAccess(permissionName, moduleName) {
    const permissions = window.USER_PERMISSIONS;
    if (Array.isArray(permissions)) {
      return permissions.includes(permissionName) || permissions.includes(moduleName);
    }
    if (permissions instanceof Set) {
      return permissions.has(permissionName) || permissions.has(moduleName);
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
      let modulePermissions = moduleName ? permissions[moduleName] : undefined;
      if (!modulePermissions && permissions.modules && typeof permissions.modules === 'object') {
        modulePermissions = permissions.modules[moduleName];
      }
      if (Array.isArray(modulePermissions)) {
        return modulePermissions.includes('view') || modulePermissions.includes(permissionName);
      }
      if (modulePermissions instanceof Set) {
        return modulePermissions.has('view') || modulePermissions.has(permissionName);
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
      }
    }
    return true;
  }
}
