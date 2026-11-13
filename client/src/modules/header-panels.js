import { $, $id } from './dom.js';
import { isAuthenticated } from './sync.js';
import { on, SYNC_INDICATOR_CHANGED } from './events.js';
import { getSyncStateLabel } from './event-sourcing/sync-indicator.js';

const HEADER_PANELS = {
  search: { buttonId: 'search-quick-btn', openClass: 'search-open', panelSelector: '.board-search' },
  session: { buttonId: 'sync-quick-btn', openClass: 'session-open', panelSelector: '.session-status' },
};

// Setting `input.value` from code fires no `input` event, but the CSS filter dot still follows it.
function onValueSet(input, callback) {
  const { get, set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return get.call(this); },
    set(value) { set.call(this, value); callback(); },
  });
}

// No module owns backend reachability; authsync.js disables sign-in when the health probe fails.
function isSignInReachable() {
  const loginBtn = $id('login-btn');
  return Boolean(loginBtn) && !loginBtn.disabled;
}

function opensSignIn() {
  return !isAuthenticated() && isSignInReachable();
}

export function initializeHeaderPanels() {
  const controls = $('.controls');
  const searchInput = $id('board-search-input');

  const isOpen = (name) => Boolean(controls?.classList.contains(HEADER_PANELS[name].openClass));

  const setOpen = (name, open) => {
    const { buttonId, openClass } = HEADER_PANELS[name];
    controls?.classList.toggle(openClass, open);
    $id(buttonId)?.setAttribute('aria-expanded', String(open));
  };

  const closeAll = () => Object.keys(HEADER_PANELS).forEach((name) => setOpen(name, false));

  const describeQuickActions = () => {
    const searchBtn = $id(HEADER_PANELS.search.buttonId);
    searchBtn?.setAttribute('aria-label', searchInput?.value ? 'Search tasks, filter applied' : 'Search tasks');

    const syncBtn = $id(HEADER_PANELS.session.buttonId);
    if (!syncBtn) return;
    const signIn = opensSignIn();
    syncBtn.setAttribute('aria-label', `${signIn ? 'Sign in to sync' : 'Sync session'}, ${getSyncStateLabel()}`);
    if (signIn) syncBtn.setAttribute('aria-haspopup', 'dialog');
    else syncBtn.removeAttribute('aria-haspopup');
  };

  $id(HEADER_PANELS.search.buttonId)?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !isOpen('search');
    setOpen('session', false);
    setOpen('search', open);
    if (open) searchInput?.focus();
  });

  $id(HEADER_PANELS.session.buttonId)?.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen('search', false);
    if (opensSignIn()) {
      setOpen('session', false);
      $id('login-btn').click();
      return;
    }
    setOpen('session', !isOpen('session'));
  });

  document.addEventListener('click', (e) => {
    const inside = Object.values(HEADER_PANELS)
      .some(({ buttonId, panelSelector }) => e.target.closest(`${panelSelector}, #${buttonId}`));
    if (!inside) closeAll();
  });

  window.addEventListener('auth-changed', () => {
    if (!isAuthenticated()) setOpen('session', false);
    describeQuickActions();
  });

  on(SYNC_INDICATOR_CHANGED, describeQuickActions);
  searchInput?.addEventListener('input', describeQuickActions);
  if (searchInput) onValueSet(searchInput, describeQuickActions);
  const loginBtn = $id('login-btn');
  if (loginBtn) new MutationObserver(describeQuickActions).observe(loginBtn, { attributeFilter: ['disabled'] });
  describeQuickActions();

  const dismissSearch = () => {
    if (!isOpen('search')) return false;
    setOpen('search', false);
    $id(HEADER_PANELS.search.buttonId)?.focus();
    return true;
  };

  return { closeAll, dismissSearch };
}
