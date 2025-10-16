// assets/js/identity-gate.js (safe gate)
(function () {
  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  async function getUserRoles() {
    const u = window.netlifyIdentity?.currentUser?.();
    if (!u) return [];
    try {
      await u.jwt();
    } catch {}
    return u?.app_metadata?.roles || [];
  }
  function hasAny(roles, allowed) {
    return roles.some((r) => allowed.includes(r));
  }

  function ensureBanner() {
    let b = document.querySelector("[data-gate-banner]");
    if (!b) {
      b = document.createElement("div");
      b.setAttribute("data-gate-banner", "1");
      b.className = "gate-banner hidden";
      b.innerHTML = "Sezione non abilitata per il tuo profilo.";
      document.body.appendChild(b);
    }
    return b;
  }

  async function applyGates() {
    const roles = await getUserRoles();
    document.body.dataset.userRoles = roles.join(",");
    document.body.classList.toggle("is-auth", roles.length > 0);

    let anyLocked = false;

    document.querySelectorAll("[data-requires-any-role]").forEach((el) => {
      const allowed = el
        .getAttribute("data-requires-any-role")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ok = hasAny(roles, allowed);
      el.classList.toggle("gate-locked", !ok);
      el.setAttribute("aria-disabled", (!ok).toString());

      const mode = (el.getAttribute("data-gate-mode") || "dim").toLowerCase();
      if (!ok) {
        anyLocked = true;
        if (mode === "hide") {
          el.classList.add("gate-hidden");
          el.classList.remove("gate-dim");
        } else {
          el.classList.add("gate-dim");
          el.classList.remove("gate-hidden");
        }
      } else {
        el.classList.remove("gate-hidden", "gate-dim");
      }
    });

    const banner = ensureBanner();
    banner.classList.toggle("hidden", !anyLocked);
  }

  function boot() {
    if (!window.netlifyIdentity) {
      const s = document.createElement("script");
      s.src = "https://identity.netlify.com/v1/netlify-identity-widget.js";
      s.onload = () => {
        netlifyIdentity.init?.();
        wire();
      };
      document.head.appendChild(s);
    } else {
      netlifyIdentity.init?.();
      wire();
    }
  }
  function wire() {
    netlifyIdentity.off?.("init");
    netlifyIdentity.off?.("login");
    netlifyIdentity.off?.("logout");
    netlifyIdentity.on?.("init", () => applyGates());
    netlifyIdentity.on?.("login", () => location.reload());
    netlifyIdentity.on?.("logout", () => location.reload());
    applyGates();
  }

  window.IdentityGate = {
    apply: applyGates,
    getRoles: getUserRoles,
    hasAny: async (list) => hasAny(await getUserRoles(), list),
  };

  onReady(boot);
})();
