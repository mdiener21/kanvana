// PROTOTYPE — Time Tracker UI variants, switchable via ?variant=A|B|C on /prototype-timetracker.html.
// Throwaway: in-memory seed data, no IndexedDB / PocketBase. Not part of the production build inputs.
import { state, subscribe, seed } from './store.js';
import { installKeyboard, renderConfirm } from './shared.js';
import A from './variant-a.js';
import B from './variant-b.js';
import C from './variant-c.js';

const VARIANTS = { A, B, C };
const keys = Object.keys(VARIANTS);
const params = new URLSearchParams(location.search);
let current = keys.includes(params.get('variant')) ? params.get('variant') : 'A';
let drawerOpen = params.get('state') === '1';

const root = document.getElementById('app');

function render() {
  const focusedId = document.activeElement?.id;
  root.className = `tt-root variant-${current}`;
  VARIANTS[current].render(root);
  if (focusedId) document.getElementById(focusedId)?.focus();
  renderConfirm();
  renderSwitcher();
}

function setVariant(k) {
  current = k;
  const p = new URLSearchParams(location.search);
  p.set('variant', k);
  history.replaceState(null, '', `?${p}`);
  render();
}

function renderSwitcher() {
  if (import.meta.env.PROD) return;
  let bar = document.getElementById('proto-switcher');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'proto-switcher';
    document.body.appendChild(bar);
    bar.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const i = keys.indexOf(current);
      if (b.dataset.dir) setVariant(keys[(i + +b.dataset.dir + keys.length) % keys.length]);
      if (b.dataset.state) { drawerOpen = !drawerOpen; renderSwitcher(); }
    });
  }
  bar.innerHTML = `<button data-dir="-1" title="Previous variant (←)">‹</button>
    <span><b>${current}</b> ${VARIANTS[current].name}</span>
    <button data-dir="1" title="Next variant (→)">›</button>
    <button data-state="1" class="${drawerOpen ? 'on' : ''}" title="Show state & emitted domain events">{ } state</button>`;

  let drawer = document.getElementById('proto-state');
  if (!drawerOpen) { drawer?.remove(); return; }
  if (!drawer) { drawer = document.createElement('pre'); drawer.id = 'proto-state'; document.body.appendChild(drawer); }
  drawer.textContent = JSON.stringify({
    variant: current, view: state.view, month: state.month, filter: state.filter,
    selectedId: state.selectedId, editingId: state.editingId, pendingDeleteId: state.pendingDeleteId,
    settings: state.settings,
    counts: { customers: state.customers.length, projects: state.projects.length, entries: state.entries.length },
    'events → PB (scope: timetracking), newest first': state.events
  }, null, 2);
}

document.addEventListener('keydown', (ev) => {
  const t = ev.target;
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  if (document.querySelector('.tt-modal-backdrop')) return;
  if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
    const i = keys.indexOf(current);
    setVariant(keys[(i + (ev.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length]);
  }
});

seed();
subscribe(render);
installKeyboard(() => VARIANTS[current]);
render();
