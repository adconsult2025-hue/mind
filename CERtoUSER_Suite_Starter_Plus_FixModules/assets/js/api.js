export async function apiFetch(url, opts = {}) {
  const safe = window.__SAFE_MODE__ === true;
  const { __safeFallback, headers: customHeaders, ...fetchOptions } = opts;
  // Se in SAFE_MODE e viene passato un fallback, restituisci sempre dryRun:true
  if (safe && '__safeFallback' in opts) {
    const fb = __safeFallback ?? null;
    return Promise.resolve({ ok: true, dryRun: true, data: fb });
  }
  // fetch JSON “robusto”
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...(customHeaders || {}) },
    ...fetchOptions,
  });
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!ct.includes('application/json')) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — non-JSON @ ${url} :: ${text.slice(0,120)}`);
  }
  const json = JSON.parse(text);
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error?.message || `Errore HTTP ${res.status}`);
  }
  return json;
}
