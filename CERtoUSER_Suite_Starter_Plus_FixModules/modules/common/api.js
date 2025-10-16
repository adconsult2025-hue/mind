import { authFetch } from './identity-guard.js';

export async function apiCall(path, init) {
  const bases = ['/api2/', '/api/', '/.netlify/functions/'];
  let lastErr = 'no attempt';
  for (const base of bases) {
    try {
      const r = await authFetch(base + path, init);
      if (r.ok) return r;
      lastErr = `${base}${path} → ${r.status}`;
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(`API unreachable. Last: ${lastErr}`);
}
