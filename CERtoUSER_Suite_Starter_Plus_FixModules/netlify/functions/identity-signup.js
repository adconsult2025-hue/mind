// Assegna/aggiorna RUOLI Identity al momento del SIGN-UP (trigger automatico Netlify Identity).
// Funziona anche per utenti esistenti se attivi la gemella identity-login.js con la stessa logica.
// Output atteso da Netlify: { app_metadata: { roles: [...] } }

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function computeRoles(email, current = []) {
  const e = (email || '').toLowerCase().trim();
  const roles = new Set(current);

  // --- REGOLA 1: superadmin per l'owner ---
  if (e === 'adv.bg.david@gmail.com') roles.add('superadmin');

  // --- REGOLA 2: staff CERtoUSER --- (dominio aziendale = admin + admin_cer)
  if (e.endsWith('@certouser.it')) {
    roles.add('admin');
    roles.add('admin_cer');
  }

  // --- REGOLA 3: agenti/commerciali ---
  // (Esempio: dominio partner; adatta se necessario)
  if (e.endsWith('@partner.it')) roles.add('agente');

  // --- REGOLA 4: default ruolo "consumer" se nessun ruolo "alto" assegnato ---
  const high = ['superadmin', 'admin', 'admin_cer', 'agente', 'produttore', 'prosumer'];
  const hasHigh = [...roles].some((r) => high.includes(r));
  if (!hasHigh) roles.add('consumer');

  // Ordine opzionale e deduplica
  const ordered = ['superadmin', 'admin', 'admin_cer', 'agente', 'produttore', 'prosumer', 'consumer'];
  const final = uniq([
    ...ordered.filter((r) => roles.has(r)),
    ...[...roles].filter((r) => !ordered.includes(r))
  ]);

  return final;
}

exports.handler = async (event) => {
  try {
    const payload = JSON.parse(event.body || '{}'); // { user: {...} }
    const user = payload.user || {};
    const email = user.email || '';
    const currentRoles = (user.app_metadata && user.app_metadata.roles) || [];

    const roles = computeRoles(email, currentRoles);

    // IMPORTANTE: Netlify aggiorna l'utente con quanto ritorni in app_metadata
    return {
      statusCode: 200,
      body: JSON.stringify({
        app_metadata: {
          ...(user.app_metadata || {}),
          roles
        }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
