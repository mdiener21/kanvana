import PocketBase from 'pocketbase';

const PB_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PB_URL) || '/';
const pb = new PocketBase(PB_URL);

pb.authStore.onChange(() => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-changed'));
  }
});

export function getPb() {
  return pb;
}

export function isAuthenticated() {
  return Boolean(pb.authStore.token && pb.authStore.record);
}

export async function ensureAuthenticated() {
  if (!pb.authStore.token || !pb.authStore.record) return false;
  if (pb.authStore.isValid) return true;
  try {
    await pb.collection('users').authRefresh();
    return Boolean(pb.authStore.token && pb.authStore.record);
  } catch {
    return false;
  }
}

export function getUser() {
  return pb.authStore.record;
}

export async function loginUser(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export async function registerUser(email, password, name) {
  return pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: name || '',
  });
}

export function logoutUser() {
  pb.authStore.clear();
}

export async function loginWithProvider(provider) {
  return pb.collection('users').authWithOAuth2({ provider });
}

const AUTH_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
let _authRefreshHandlers = null;

// PocketBase serves an expired token as a guest (empty pulls, rule-rejected pushes)
// rather than a 401, so an expired login must be cleared here or sync dies silently.
export async function refreshAuth() {
  if (!pb.authStore.token) return false;
  if (!pb.authStore.isValid) {
    pb.authStore.clear();
    return false;
  }
  try {
    await pb.collection('users').authRefresh({ requestKey: null });
  } catch (err) {
    if (err?.status >= 400 && err?.status < 500) pb.authStore.clear();
  }
  return isAuthenticated();
}

export function initAuthRefresh() {
  if (typeof window === 'undefined' || _authRefreshHandlers) return;
  const run = () => { refreshAuth().catch(() => {}); };
  _authRefreshHandlers = {
    run,
    visibility: () => { if (document.visibilityState === 'visible') run(); },
    interval: setInterval(run, AUTH_REFRESH_INTERVAL_MS),
  };
  document.addEventListener('visibilitychange', _authRefreshHandlers.visibility);
  window.addEventListener('online', run);
  run();
}

export function _resetAuthRefreshForTesting() {
  if (!_authRefreshHandlers) return;
  document.removeEventListener('visibilitychange', _authRefreshHandlers.visibility);
  window.removeEventListener('online', _authRefreshHandlers.run);
  clearInterval(_authRefreshHandlers.interval);
  _authRefreshHandlers = null;
}
