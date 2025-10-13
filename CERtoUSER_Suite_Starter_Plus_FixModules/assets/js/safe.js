export function safeGuardAction(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('safeGuardAction requires a function');
  }
  if (window.__SAFE_MODE__) {
    const name = fn.name || 'action';
    console.warn('SAFE_MODE: DRY-RUN', name);
    const dryRunPayload = { ok: true, dryRun: true, data: { dryRun: true } };
    const dryRunResponse = {
      ok: true,
      dryRun: true,
      status: 200,
      statusText: 'SAFE_MODE_DRY_RUN',
      json: async () => dryRunPayload,
      text: async () => JSON.stringify(dryRunPayload)
    };
    return Promise.resolve(dryRunResponse);
  }
  return fn();
}
