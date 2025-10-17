(function () {
  if (window.safeGuardAction) return;
  window.safeGuardAction = async function (fn, opts = {}) {
    const { button, confirmMessage, onError, onFinally } = opts;
    try {
      if (confirmMessage && !window.confirm(confirmMessage)) return;
      if (button) { button.disabled = true; button.dataset.loading = '1'; }
      const res = await Promise.resolve(fn());
      return res;
    } catch (err) {
      console.error(err);
      alert('Errore: ' + (err?.message || String(err)));
      if (onError) onError(err);
    } finally {
      if (button) { button.disabled = false; delete button.dataset.loading; }
      if (onFinally) onFinally();
    }
  };
})();
