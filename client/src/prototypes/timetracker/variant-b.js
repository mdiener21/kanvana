// PROTOTYPE — Variant B: "Ledger" — top tabs, one dense spreadsheet table (input row = first row, inline edit), month rail; reports as a project × day heatmap.
import { state, notify, visibleEntries, monthSummary, monthLabel, shiftMonth, fmtDate, fmtTime, fmtDur, durationOf, dayKey, addEntry, updateEntry, zoned, daysInMonth } from './store.js';
import {
  esc, field, newEntryDefaults, entryValues, projectDatalist, wireEntryFields, filterControls, wireFilters,
  projectsPanel, wireProjectsPanel, settingsPanel, wireSettingsPanel, projectById, customerById, toast
} from './shared.js';

const TABS = [['tracker', 'Ledger', 'g t'], ['reports', 'Month matrix', 'g r'], ['projects', 'Customers & projects', 'g p'], ['settings', 'Settings', 'g s']];

const inputCells = (v, id) => `<tr class="b-input ${id ? 'b-editing' : ''}" data-edit="${id ?? ''}">
  <td>${field('date', v.date)}</td><td>${field('start', v.start)}</td><td>${field('end', v.end)}<span class="tt-overnight">+1</span></td>
  <td>${field('dur', v.dur)}</td><td>${field('project', v.project)}</td><td>${field('desc', v.desc)}</td>
  <td class="b-hint">${id ? '⏎ save · esc' : '⏎ add'}</td></tr>`;

function row(e) {
  if (state.editingId === e.id) return inputCells(entryValues(e), e.id);
  const p = projectById(e.projectId);
  const overnight = dayKey(e.end - 1) !== dayKey(e.start);
  return `<tr class="b-row ${state.selectedId === e.id ? 'is-selected' : ''}" data-id="${e.id}">
    <td class="b-date">${fmtDate(e.start)}</td><td>${fmtTime(e.start)}</td><td>${fmtTime(e.end)}${overnight ? '<sup class="tt-plus1">+1</sup>' : ''}</td>
    <td class="num"><strong>${fmtDur(durationOf(e))}</strong></td>
    <td><span class="tt-dot" style="background:${p?.color}"></span>${esc(customerById(p?.customerId)?.name)} / ${esc(p?.name)}</td>
    <td class="${e.description ? '' : 'tt-muted'}">${esc(e.description || '—')}</td><td></td></tr>`;
}

function rail() {
  const s = monthSummary();
  const max = Math.max(1, ...s.groups.flatMap((g) => g.projects.map((p) => p.total)));
  return `<aside class="b-rail">
    <div class="b-month"><button class="tt-icon" id="b-prev">‹</button><span>${monthLabel(s.key)}</span><button class="tt-icon" id="b-next">›</button></div>
    <div class="b-total">${fmtDur(s.total)}</div><div class="tt-muted">${s.count} entries · <kbd>[</kbd> <kbd>]</kbd></div>
    ${s.groups.map((g) => `<div class="b-rail-group"><div class="b-rail-cust"><span>${esc(g.customer.name)}</span><span>${fmtDur(g.total)}</span></div>
      ${g.projects.map((p) => `<div class="b-rail-proj"><span>${esc(p.project.name)}</span><span>${fmtDur(p.total)}</span>
        <div class="b-rail-bar"><div style="width:${(p.total / max) * 100}%;background:${p.project.color}"></div></div></div>`).join('')}</div>`).join('')}
  </aside>`;
}

function ledgerView() {
  const entries = visibleEntries();
  let lastDay = null;
  const body = entries.map((e) => {
    const k = dayKey(e.start);
    const sep = k !== lastDay ? `<tr class="b-daysep"><td colspan="7">${zoned(e.start).wd} ${fmtDate(e.start)}</td></tr>` : '';
    lastDay = k;
    return sep + row(e);
  }).join('');
  return `<div class="b-ledger">
    <div class="b-tablewrap">
      <div class="b-toolbar">${filterControls()}<span class="tt-spacer"></span><span class="tt-muted"><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>e</kbd> edit · <kbd>d</kbd> dup · <kbd>Del</kbd> delete</span></div>
      <table class="b-table">
        <thead><tr><th>Date</th><th>Start</th><th>End</th><th class="num">Dur</th><th>Customer / Project</th><th>Description</th><th></th></tr></thead>
        <tbody>${inputCells(newEntryDefaults(), null)}${body}</tbody>
      </table>
    </div>
    ${rail()}
  </div>`;
}

function matrixView() {
  const s = monthSummary();
  const n = daysInMonth(s.key);
  const max = Math.max(1, ...s.days.flatMap((d) => Object.values(d)));
  const [y, m] = s.key.split('-').map(Number);
  const wd = (d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const head = Array.from({ length: n }, (_, i) => `<th class="${[0, 6].includes(wd(i + 1)) ? 'we' : ''}">${i + 1}</th>`).join('');
  const cells = (pid) => s.days.map((d, i) => {
    const ms = d[pid] ?? 0;
    const color = projectById(pid).color;
    return `<td class="b-cell ${[0, 6].includes(wd(i + 1)) ? 'we' : ''}" title="${i + 1}.: ${fmtDur(ms)}">${ms ? `<div style="background:${color};opacity:${0.25 + 0.75 * (ms / max)}">${fmtDur(ms)}</div>` : ''}</td>`;
  }).join('');
  const dayTotals = s.days.map((d) => { const t = Object.values(d).reduce((a, b) => a + b, 0); return `<td class="b-cell-total">${t ? fmtDur(t) : ''}</td>`; }).join('');
  return `<div class="b-matrix-head">
      <button class="tt-icon" id="b-prev">‹</button><h2>${monthLabel(s.key)}</h2><button class="tt-icon" id="b-next">›</button>
      <span class="b-total-inline">${fmtDur(s.total)}</span><span class="tt-spacer"></span>${filterControls()}
    </div>
    <div class="b-matrix-wrap"><table class="b-matrix">
      <thead><tr><th class="b-mx-name">Customer / Project</th>${head}<th class="num">Total</th></tr></thead>
      <tbody>${s.groups.map((g) => `<tr class="b-mx-cust"><td>${esc(g.customer.name)}</td><td colspan="${n}"></td><td class="num">${fmtDur(g.total)}</td></tr>
        ${g.projects.map((p) => `<tr><td class="b-mx-name"><span class="tt-dot" style="background:${p.project.color}"></span>${esc(p.project.name)}</td>${cells(p.project.id)}<td class="num"><strong>${fmtDur(p.total)}</strong></td></tr>`).join('')}`).join('')
        || `<tr><td colspan="${n + 2}" class="tt-muted">No time tracked this month</td></tr>`}</tbody>
      <tfoot><tr><td>Day total</td>${dayTotals}<td class="num"><strong>${fmtDur(s.total)}</strong></td></tr></tfoot>
    </table></div>`;
}

export default {
  name: 'Ledger',
  listIds: () => visibleEntries().map((e) => e.id),
  focusNew: () => document.querySelector('.b-input:not(.b-editing) [data-f="date"]')?.focus(),
  edit(id) { state.view = 'tracker'; state.editingId = id; notify(); },
  render(root) {
    const body = { tracker: ledgerView, reports: matrixView, projects: projectsPanel, settings: settingsPanel }[state.view]();
    root.innerHTML = `<div class="b-shell">
      <header class="b-top"><span class="b-logo">⏱ kanvana time</span>
        <nav class="b-tabs">${TABS.map(([id, label, k]) => `<button class="b-tab ${state.view === id ? 'active' : ''}" data-view="${id}">${label} <kbd>${k}</kbd></button>`).join('')}</nav>
        <span class="tt-spacer"></span><a class="b-back" href="./index.html">Board</a></header>
      <main class="b-main">${body}</main>
    </div>${projectDatalist()}`;
    root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; notify(); }));
    root.querySelector('#b-prev')?.addEventListener('click', () => { state.month = shiftMonth(state.month, -1); notify(); });
    root.querySelector('#b-next')?.addEventListener('click', () => { state.month = shiftMonth(state.month, 1); notify(); });
    wireFilters(root);
    if (state.view === 'tracker') {
      root.querySelectorAll('.b-input').forEach((tr) => {
        const id = tr.dataset.edit;
        wireEntryFields(tr, (data) => {
          if (id) { state.editingId = null; updateEntry(id, data); toast('Entry updated'); }
          else { addEntry(data); toast('Entry added'); this.focusNew(); }
        }, () => { if (id) { state.editingId = null; notify(); } else document.activeElement.blur(); });
      });
      root.querySelectorAll('.b-row').forEach((r) => {
        r.addEventListener('click', () => { state.selectedId = r.dataset.id; notify(); });
        r.addEventListener('dblclick', () => this.edit(r.dataset.id));
      });
      if (state.editingId) root.querySelector('.b-editing [data-f="desc"]')?.focus();
    }
    if (state.view === 'projects') wireProjectsPanel(root);
    if (state.view === 'settings') wireSettingsPanel(root);
  }
};
