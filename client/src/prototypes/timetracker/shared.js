// PROTOTYPE — throwaway. Shared controls; each variant owns its own layout.
import {
  state, notify, resolveTimes, parseTime, parseDuration, parseDate, fmtMinutes, fmtYMD, fmtDur, fmtDate, fmtTime,
  zoned, projectLabel, activeProjects, findProjectByLabel, projectById, customerById, addEntry, updateEntry,
  deleteEntry, duplicateEntry, addCustomer, addProject, setArchived, isReferenced, hardDelete, updateSettings,
  durationOf, shiftMonth
} from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mirrors the real app's DEFAULT_APP_KEYBINDINGS registry idea — no hardcoded keys elsewhere.
export const TT_KEYBINDINGS = {
  newEntry: 'n', focusFilter: '/', down: 'j', up: 'k', edit: 'e', duplicate: 'd', delete: 'Delete',
  gotoTracker: 'g t', gotoReports: 'g r', gotoProjects: 'g p', gotoSettings: 'g s',
  prevMonth: '[', nextMonth: ']', help: '?'
};
const KEY_HELP = [
  ['n', 'New entry (focus entry bar)'], ['/', 'Focus filter'], ['j / k', 'Select next / previous entry'],
  ['e', 'Edit selected'], ['d', 'Duplicate selected (starts now)'], ['Del', 'Delete selected → y to confirm'],
  ['g t · g r · g p · g s', 'Tracker · Reports · Projects · Settings'], ['[ / ]', 'Previous / next month'],
  ['?', 'This cheat-sheet'], ['Enter', 'Save (in entry fields)'], ['Esc', 'Cancel / leave field'],
  ['Alt + ↑/↓', '±15 min on start / end / duration'], ['← / →', 'Prototype: switch variant']
];

// ---------- entry fields with linked Start / End / Duration ----------
export function newEntryDefaults() {
  const z = zoned(Date.now());
  const startMin = z.h * 60 + z.mi;
  return {
    desc: '', project: projectLabel(projectById(state.settings.defaultProjectId)),
    date: fmtYMD(z), start: fmtMinutes(startMin), end: fmtMinutes(startMin), dur: fmtDur(0)
  };
}
export function entryValues(e) {
  const z = zoned(e.start);
  return {
    desc: e.description, project: projectLabel(projectById(e.projectId)), date: fmtYMD(z),
    start: fmtTime(e.start), end: fmtTime(e.end), dur: fmtDur(durationOf(e))
  };
}
export function projectDatalist() {
  return `<datalist id="tt-projects">${activeProjects().map((p) => `<option value="${esc(projectLabel(p))}"></option>`).join('')}</datalist>`;
}
export function field(name, value, attrs = '') {
  const ph = { desc: 'What are you working on?', project: 'Customer / Project', date: 'Date', start: 'Start', end: 'End', dur: 'Duration' }[name];
  const extra = name === 'project' ? 'list="tt-projects"' : '';
  return `<input class="tt-f tt-f-${name}" data-f="${name}" value="${esc(value)}" placeholder="${ph}" aria-label="${ph}" autocomplete="off" ${extra} ${attrs}>`;
}

const read = (root) => Object.fromEntries([...root.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.value]));
const set = (root, f, v) => { const i = root.querySelector(`[data-f="${f}"]`); if (i && document.activeElement !== i) i.value = v; };

// Wires linked fields inside `root`. onSubmit receives {projectId, description, start, end}.
export function wireEntryFields(root, onSubmit, onCancel) {
  const recompute = (changed) => {
    const r = resolveTimes(read(root), changed);
    if (!r) return;
    if (changed === 'dur') set(root, 'end', fmtMinutes(r.endMin));
    else set(root, 'dur', fmtDur(r.minutes * 60000));
    root.querySelector('.tt-overnight')?.classList.toggle('show', r.startMin + r.minutes >= 1440);
  };
  root.addEventListener('input', (ev) => {
    const f = ev.target.dataset?.f;
    if (['start', 'end', 'dur', 'date'].includes(f)) recompute(f === 'date' ? 'start' : f);
  });
  root.addEventListener('focusout', (ev) => {
    const i = ev.target; const f = i.dataset?.f;
    if (f === 'start' || f === 'end') { const m = parseTime(i.value); if (m != null) i.value = fmtMinutes(m); }
    if (f === 'dur') { const m = parseDuration(i.value); if (m != null) i.value = fmtDur(m * 60000); }
    if (f === 'date') { const d = parseDate(i.value); if (d) i.value = fmtYMD(d); }
  });
  root.addEventListener('keydown', (ev) => {
    const f = ev.target.dataset?.f;
    if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && ['start', 'end', 'dur'].includes(f)) {
      ev.preventDefault();
      const delta = ev.key === 'ArrowUp' ? 15 : -15;
      if (f === 'dur') { const m = Math.max(0, (parseDuration(ev.target.value) ?? 0) + delta); ev.target.value = fmtDur(m * 60000); }
      else { const m = ((parseTime(ev.target.value) ?? 0) + delta + 1440) % 1440; ev.target.value = fmtMinutes(m); }
      recompute(f);
      return;
    }
    if (ev.key === 'Enter' && f) {
      ev.preventDefault();
      const v = read(root);
      const p = findProjectByLabel(v.project);
      if (!p) return toast('Pick a project (type to search "Customer / Project")');
      if (p.archived) return toast('That project is archived');
      const r = resolveTimes(v, ev.target.dataset.f === 'dur' ? 'dur' : 'end');
      if (!r) return toast('Could not read date / start time');
      if (r.minutes <= 0) return toast('Duration is 0 — type an end time or a duration like 1:30, 1.5, 90m');
      onSubmit({ projectId: p.id, description: v.desc.trim(), start: r.startMs, end: r.endMs });
    }
    if (ev.key === 'Escape') { ev.preventDefault(); onCancel?.(); }
  });
}

// ---------- modal editor (used by variants that don't edit inline) ----------
export function openEditor(entryId) {
  const e = state.entries.find((x) => x.id === entryId);
  const v = e ? entryValues(e) : newEntryDefaults();
  const dlg = document.createElement('div');
  dlg.className = 'tt-modal-backdrop';
  dlg.innerHTML = `<div class="tt-modal" role="dialog" aria-label="${e ? 'Edit' : 'New'} time entry">
    <h3>${e ? 'Edit' : 'New'} time entry</h3>
    <div class="tt-modal-grid">
      <label>Description ${field('desc', v.desc)}</label>
      <label>Project ${field('project', v.project)}</label>
      <label>Date ${field('date', v.date)}</label>
      <div class="tt-modal-times"><label>Start ${field('start', v.start)}</label><label>End ${field('end', v.end)}</label><label>Duration ${field('dur', v.dur)}</label></div>
      <div class="tt-overnight">ends next day</div>
    </div>
    <p class="tt-hint">Enter = save · Esc = cancel · Alt+↑/↓ = ±15 min</p>
  </div>`;
  document.body.appendChild(dlg);
  const close = () => { dlg.remove(); state.editingId = null; };
  wireEntryFields(dlg, (data) => { close(); if (e) updateEntry(e.id, data); else addEntry(data); toast(e ? 'Entry updated' : 'Entry added'); }, close);
  dlg.addEventListener('mousedown', (ev) => { if (ev.target === dlg) close(); });
  dlg.querySelector('[data-f="desc"]').focus();
}

// ---------- filter controls ----------
export function filterControls() {
  const custOpts = state.customers.map((c) => `<option value="${c.id}" ${state.filter.customerId === c.id ? 'selected' : ''}>${esc(c.name)}${c.archived ? ' (archived)' : ''}</option>`).join('');
  const projOpts = state.projects.filter((p) => !state.filter.customerId || p.customerId === state.filter.customerId)
    .map((p) => `<option value="${p.id}" ${state.filter.projectId === p.id ? 'selected' : ''}>${esc(p.name)}${p.archived ? ' (archived)' : ''}</option>`).join('');
  return `<select id="flt-customer" class="tt-select" aria-label="Filter by customer"><option value="">All customers</option>${custOpts}</select>
    <select id="flt-project" class="tt-select" aria-label="Filter by project"><option value="">All projects</option>${projOpts}</select>`;
}
export function wireFilters(root) {
  root.querySelector('#flt-customer')?.addEventListener('change', (ev) => { state.filter = { customerId: ev.target.value, projectId: '' }; notify(); });
  root.querySelector('#flt-project')?.addEventListener('change', (ev) => { state.filter.projectId = ev.target.value; notify(); });
}

// ---------- Projects & Customers panel ----------
export function projectsPanel() {
  const rows = state.customers.map((c) => {
    const projects = state.projects.filter((p) => p.customerId === c.id);
    const btns = (kind, x) => `<button class="tt-btn-link" data-arch="${kind}:${x.id}">${x.archived ? 'Unarchive' : 'Archive'}</button>
      <button class="tt-btn-link danger" data-del="${kind}:${x.id}" ${isReferenced(kind, x.id) ? `disabled title="In use — archive instead"` : ''}>Delete</button>`;
    return `<div class="tt-pc-customer ${c.archived ? 'archived' : ''}">
      <div class="tt-pc-row tt-pc-head"><strong>${esc(c.name)}</strong>${c.archived ? '<span class="tt-tag">archived</span>' : ''}<span class="tt-spacer"></span>${btns('customer', c)}</div>
      ${projects.map((p) => `<div class="tt-pc-row ${p.archived ? 'archived' : ''}"><span class="tt-dot" style="background:${p.color}"></span>${esc(p.name)}${p.archived ? '<span class="tt-tag">archived</span>' : ''}
        <span class="tt-muted">${state.entries.filter((e) => e.projectId === p.id).length} entries</span><span class="tt-spacer"></span>${btns('project', p)}</div>`).join('')}
    </div>`;
  }).join('');
  return `<div class="tt-pc">
    <div class="tt-pc-add">
      <input id="pc-new-customer" class="tt-f" placeholder="New customer name — Enter">
      <select id="pc-new-project-customer" class="tt-select">${state.customers.filter((c) => !c.archived).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <input id="pc-new-project" class="tt-f" placeholder="New project name — Enter">
    </div>
    ${rows}
    <p class="tt-hint">Archived = hidden from the entry picker, still in list/filters/reports. Delete only when nothing references it.</p>
  </div>`;
}
export function wireProjectsPanel(root) {
  root.querySelector('#pc-new-customer')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.value.trim()) { addCustomer(ev.target.value.trim()); toast('Customer added'); }
  });
  root.querySelector('#pc-new-project')?.addEventListener('keydown', (ev) => {
    const cid = root.querySelector('#pc-new-project-customer').value;
    if (ev.key === 'Enter' && ev.target.value.trim() && cid) { addProject(cid, ev.target.value.trim()); toast('Project added'); }
  });
  root.querySelectorAll('[data-arch]').forEach((b) => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.arch.split(':');
    const x = (kind === 'customer' ? state.customers : state.projects).find((i) => i.id === id);
    setArchived(kind, id, !x.archived);
  }));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.del.split(':');
    if (!hardDelete(kind, id)) toast('In use — archive instead');
  }));
}

// ---------- Settings panel ----------
const ZONES = (Intl.supportedValuesOf?.('timeZone') ?? ['Europe/Berlin', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'UTC']);
export function settingsPanel() {
  const s = state.settings;
  const opt = (v, cur, label = v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const defCust = s.defaultCustomerId;
  return `<div class="tt-settings">
    <label>Default customer<select id="st-customer" class="tt-select">${state.customers.filter((c) => !c.archived).map((c) => opt(c.id, defCust, c.name)).join('')}</select></label>
    <label>Default project<select id="st-project" class="tt-select">${activeProjects().filter((p) => p.customerId === defCust).map((p) => opt(p.id, s.defaultProjectId, p.name)).join('')}</select></label>
    <label>Date format<select id="st-date" class="tt-select">${['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => opt(f, s.dateFormat)).join('')}</select></label>
    <label>Time format<select id="st-time" class="tt-select">${opt('24h', s.timeFormat, '24-hour (14:30)')}${opt('12h', s.timeFormat, '12-hour (2:30 PM)')}</select></label>
    <label>Timezone<select id="st-tz" class="tt-select">${ZONES.map((z) => opt(z, s.timeZone)).join('')}</select></label>
    <label>Duration format<select id="st-dur" class="tt-select">${opt('hmm', s.durationFormat, 'h:mm (7:30)')}${opt('decimal', s.durationFormat, 'Decimal (7.50 h)')}</select></label>
    <div class="tt-settings-preview">Preview: <strong>${fmtDate(Date.now())} ${fmtTime(Date.now())}</strong> · duration <strong>${fmtDur(450 * 60000)}</strong></div>
  </div>`;
}
export function wireSettingsPanel(root) {
  const on = (id, fn) => root.querySelector(id)?.addEventListener('change', (ev) => fn(ev.target.value));
  on('#st-customer', (v) => updateSettings({ defaultCustomerId: v, defaultProjectId: activeProjects().find((p) => p.customerId === v)?.id ?? null }));
  on('#st-project', (v) => updateSettings({ defaultProjectId: v }));
  on('#st-date', (v) => updateSettings({ dateFormat: v }));
  on('#st-time', (v) => updateSettings({ timeFormat: v }));
  on('#st-tz', (v) => updateSettings({ timeZone: v }));
  on('#st-dur', (v) => updateSettings({ durationFormat: v }));
}

// ---------- toast / delete confirm / cheat-sheet ----------
let toastTimer;
export function toast(msg) {
  let t = document.getElementById('tt-toast');
  if (!t) { t = document.createElement('div'); t.id = 'tt-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
export function renderConfirm() {
  let bar = document.getElementById('tt-confirm');
  const e = state.entries.find((x) => x.id === state.pendingDeleteId);
  if (!e) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'tt-confirm'; document.body.appendChild(bar); }
  bar.innerHTML = `Delete <strong>${esc(e.description || '(no description)')}</strong> · ${esc(projectLabel(projectById(e.projectId)))} · ${fmtDur(durationOf(e))}? <kbd>y</kbd> delete · <kbd>Esc</kbd> cancel`;
}
function toggleHelp() {
  const existing = document.getElementById('tt-help');
  if (existing) return existing.remove();
  const d = document.createElement('div');
  d.id = 'tt-help';
  d.className = 'tt-modal-backdrop';
  d.innerHTML = `<div class="tt-modal"><h3>Keyboard shortcuts</h3><table class="tt-help-table">${KEY_HELP.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table><p class="tt-hint">Press ? or Esc to close</p></div>`;
  d.addEventListener('mousedown', (ev) => { if (ev.target === d) d.remove(); });
  document.body.appendChild(d);
}

// ---------- keyboard dispatcher ----------
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function installKeyboard(getVariant) {
  const byKey = Object.fromEntries(Object.entries(TT_KEYBINDINGS).map(([a, k]) => [k, a]));
  let chord = null; let chordAt = 0;
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'Escape') {
      if (state.pendingDeleteId) { state.pendingDeleteId = null; renderConfirm(); return; }
      document.getElementById('tt-help')?.remove();
      if (isTyping(document.activeElement) && !document.activeElement.closest('.tt-modal')) document.activeElement.blur();
      return;
    }
    if (isTyping(ev.target) || ev.altKey) return;
    if (document.querySelector('.tt-modal-backdrop:not(#tt-help)')) return;
    if (state.pendingDeleteId) {
      if (ev.key === 'y') { const id = state.pendingDeleteId; state.pendingDeleteId = null; renderConfirm(); deleteEntry(id); toast('Entry deleted'); }
      ev.preventDefault();
      return;
    }
    let key = ev.key === 'Backspace' ? 'Delete' : ev.key;
    if (chord && Date.now() - chordAt < 900) { key = `${chord} ${key}`; chord = null; }
    else if (key === 'g') { chord = 'g'; chordAt = Date.now(); return; }
    const action = byKey[key];
    if (!action) return;
    ev.preventDefault();
    runAction(action, getVariant());
  });
}

function moveSelection(variant, dir) {
  const ids = variant.listIds?.() ?? [];
  if (!ids.length) return;
  const i = ids.indexOf(state.selectedId);
  state.selectedId = ids[Math.max(0, Math.min(ids.length - 1, i === -1 ? 0 : i + dir))];
  notify();
  document.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
}

function runAction(action, variant) {
  const go = (view) => { state.view = view; notify(); };
  switch (action) {
    case 'newEntry': if (state.view !== 'tracker') go('tracker'); return variant.focusNew ? variant.focusNew() : openEditor(null);
    case 'focusFilter': return document.getElementById('flt-customer')?.focus();
    case 'down': return moveSelection(variant, 1);
    case 'up': return moveSelection(variant, -1);
    case 'edit': if (state.selectedId) return variant.edit ? variant.edit(state.selectedId) : openEditor(state.selectedId); return;
    case 'duplicate': if (state.selectedId) { duplicateEntry(state.selectedId); toast('Duplicated — starts now'); } return;
    case 'delete': if (state.selectedId) { state.pendingDeleteId = state.selectedId; renderConfirm(); } return;
    case 'gotoTracker': return go('tracker');
    case 'gotoReports': return go('reports');
    case 'gotoProjects': return go('projects');
    case 'gotoSettings': return go('settings');
    case 'prevMonth': state.month = shiftMonth(state.month, -1); return notify();
    case 'nextMonth': state.month = shiftMonth(state.month, 1); return notify();
    case 'help': return toggleHelp();
  }
}

export { customerById, projectById, projectLabel };
