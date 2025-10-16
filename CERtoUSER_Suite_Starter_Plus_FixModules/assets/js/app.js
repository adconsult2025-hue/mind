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
  const NAV_MODULE_CONFIG = {
    simulatori: {
      label: 'SIMULATORI',
      href: '/modules/simulatori/index.html'
    },
    preventivi: {
      label: 'PREVENTIVI',
      href: '/modules/preventivi/index.html'
    }
  };
  const CORE_NAV_MODULES = Object.keys(NAV_MODULE_CONFIG);

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

    const navRoot = document.querySelector('.main-nav');
    if (navRoot) {
      CORE_NAV_MODULES.forEach((moduleName) => ensureNavItem(navRoot, moduleName));
    }

    const navItems = (navRoot || document).querySelectorAll('.nav-item');
    if (navItems.length) {
      const featureFlags = window.FEATURE_FLAGS || {};
      navItems.forEach((link) => {
        const moduleName = link.getAttribute('data-module');
        if (!moduleName) return;
        const permissionName = `${moduleName}:view`;
        const allowed = hasModuleAccess(permissionName, moduleName);
        const featureDisabled = featureFlags[moduleName] === false;
        const isCoreModule = CORE_NAV_MODULES.includes(moduleName);
        const shouldDisable = !allowed || (featureDisabled && !isCoreModule);
        const reason = !allowed
          ? 'Sezione non abilitata per il tuo profilo.'
          : (featureDisabled && !isCoreModule)
            ? 'Modulo disattivato per questa istanza.'
            : '';
        setNavItemDisabled(link, shouldDisable, reason);
      });

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
