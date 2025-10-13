export const BRAND_NAME = 'MIND';

if (typeof window !== 'undefined') {
  window.BRAND_NAME = BRAND_NAME;
  let toastContainer;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-brand-name]').forEach((el) => {
      el.textContent = BRAND_NAME;
    });

    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      const { pathname } = window.location;
      toolbar.querySelectorAll('a.btn').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (href === '/' || href.startsWith('#')) return;
        if (pathname.startsWith(href)) {
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
