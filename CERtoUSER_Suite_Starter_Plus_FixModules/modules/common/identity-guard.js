import {
  waitIdentity as waitIdentityPromise,
  identityReady,
  authFetch,
  loadSession,
  saveSession,
  isSessionValid,
  logout,
  fetchIdentityUser
} from '../../assets/js/identity.js';

export const waitIdentity = waitIdentityPromise;

export async function ensureIdentity(options = {}) {
  const {
    allowAnonymous = false,
    onMissing,
    missingMessage = 'Sessione Identity mancante.',
    throwOnMissing = true
  } = options;

  const user = await waitIdentityPromise;
  if (user || allowAnonymous) {
    return user;
  }

  if (typeof onMissing === 'function') {
    try {
      await onMissing();
    } catch (hookError) {
      console.warn('[identity-guard] onMissing handler failed:', hookError);
    }
  }

  if (throwOnMissing) {
    const error = new Error(missingMessage);
    error.code = 'IDENTITY_MISSING';
    throw error;
  }

  return null;
}

export {
  identityReady,
  authFetch,
  loadSession,
  saveSession,
  isSessionValid,
  logout,
  fetchIdentityUser
};

export default {
  waitIdentity: waitIdentityPromise,
  ensureIdentity,
  identityReady,
  authFetch,
  loadSession,
  saveSession,
  isSessionValid,
  logout,
  fetchIdentityUser
};
