import { $, $id } from './dom.js';

// The phone search field opens from the Search tab in the bottom bar (responsive.css places it).
// Sign-in and sync state sit in the Controls sheet on phones, so they need no panel here.
const SEARCH = { buttonId: 'search-quick-btn', openClass: 'search-open', panelSelector: '.board-search' };

// Setting `input.value` from code fires no `input` event, but the CSS filter dot still follows it.
function onValueSet(input, callback) {
  const { get, set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return get.call(this); },
    set(value) { set.call(this, value); callback(); },
  });
}

export function initializeHeaderPanels() {
  const controls = $('.controls');
  const searchInput = $id('board-search-input');
  const searchBtn = $id(SEARCH.buttonId);

  const isOpen = () => Boolean(controls?.classList.contains(SEARCH.openClass));

  const setOpen = (open) => {
    controls?.classList.toggle(SEARCH.openClass, open);
    searchBtn?.setAttribute('aria-expanded', String(open));
  };

  const closeAll = () => setOpen(false);

  const describeSearch = () => {
    searchBtn?.setAttribute('aria-label', searchInput?.value ? 'Search tasks, filter applied' : 'Search tasks');
  };

  searchBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !isOpen();
    setOpen(open);
    if (open) searchInput?.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest(`${SEARCH.panelSelector}, #${SEARCH.buttonId}`)) closeAll();
  });

  searchInput?.addEventListener('input', describeSearch);
  if (searchInput) onValueSet(searchInput, describeSearch);
  describeSearch();

  const dismissSearch = () => {
    if (!isOpen()) return false;
    setOpen(false);
    searchBtn?.focus();
    return true;
  };

  return { closeAll, dismissSearch };
}
