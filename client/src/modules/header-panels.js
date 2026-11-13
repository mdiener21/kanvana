import { $, $id } from './dom.js';
import { isAuthenticated } from './sync.js';

// Phone-only drop-ins below the header (responsive.css); on wider screens both sit inline and the buttons are hidden.
const HEADER_PANELS = {
  search: { buttonId: 'search-quick-btn', openClass: 'search-open', panelSelector: '.board-search' },
  session: { buttonId: 'sync-quick-btn', openClass: 'session-open', panelSelector: '.session-status' },
};

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
    // Signed out with a reachable backend goes straight to sign-in; otherwise the panel explains why not.
    const loginBtn = $id('login-btn');
    if (!isAuthenticated() && loginBtn && !loginBtn.disabled) {
      setOpen('session', false);
      loginBtn.click();
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
  });

  // Escape in the search panel closes it and returns focus to its button; false when it was not open.
  const dismissSearch = () => {
    if (!isOpen('search')) return false;
    setOpen('search', false);
    $id(HEADER_PANELS.search.buttonId)?.focus();
    return true;
  };

  return { closeAll, dismissSearch };
}
