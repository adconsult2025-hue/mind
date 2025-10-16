// Dev No-Auth: utente finto superadmin per sbloccare TUTTO
(function(){
  if (!window.__DEV_NO_AUTH__) return;
  window.currentUser = {
    uid: 'dev-superadmin',
    email: 'dev@certouser.it',
    role: 'superadmin',
    territories: ['ALL'],
    cerIds: []
  };
  // Se avevi requireRoles/requireCerAccess, fai short-circuit
  window.requireRoles = async ()=> true;
  window.requireCerAccess = async ()=> true;
  console.warn('[DEV_NO_AUTH] Attivo: accesso libero come superadmin');
})();
