// PROTOTYPE — Variant A: "Clockify classic" — sidebar nav, entry bar on top, entries grouped by day, summary report with stacked bars.
import { state, notify, visibleEntries, groupByDay, monthSummary, monthLabel, shiftMonth, fmtTime, fmtDur, durationOf, dayKey, addEntry, duplicateEntry, fmtDayHeading } from './store.js';
import {
  esc, field, newEntryDefaults, projectDatalist, wireEntryFields, filterControls, wireFilters, projectsPanel, wireProjectsPanel,
  settingsPanel, wireSettingsPanel, projectById, customerById, toast, openEditor
} from './shared.js';

const NAV = [['tracker', 'clock', 'Time Tracker', 'g t'], ['reports', 'bar-chart-3', 'Reports', 'g r'], ['projects', 'folder', 'Projects', 'g p'], ['settings', 'settings', 'Settings', 'g s']];

function entryBar() {
  const v = newEntryDefaults();
  return `<div class="a-entrybar" id="a-entrybar">
    ${field('desc', v.desc)}
    ${field('project', v.project)}
    <span class="a-sep"></span>
    ${field('date', v.date)}
    ${field('start', v.start)}<span class="a-dash">–</span>${field('end', v.end)}
    ${field('dur', v.dur)}
    <span class="tt-overnight">+1 day</span>
    <button class="a-add" id="a-add">ADD</button>
  </div>`;
}

function entryRow(e) {
  const p = projectById(e.projectId);
  const c = customerById(p?.customerId);
  const overnight = dayKey(e.end - 1) !== dayKey(e.start);
  return `<div class="a-row ${state.selectedId === e.id ? 'is-selected' : ''}" data-id="${e.id}">
    <div class="a-desc ${e.description ? '' : 'tt-muted'}">${esc(e.description || '(no description)')}</div>
    <div class="a-proj" style="color:${p?.color}"><span class="tt-dot" style="background:${p?.color}"></span>${esc(p?.name)}<span class="a-cust"> · ${esc(c?.name)}</span></div>
    <div class="a-range">${fmtTime(e.start)} – ${fmtTime(e.end)}${overnight ? '<sup class="tt-plus1">+1</sup>' : ''}</div>
    <div class="a-dur">${fmtDur(durationOf(e))}</div>
    <div class="a-actions">
      <button class="tt-icon" data-act="edit" title="Edit (e)">✎</button>
      <button class="tt-icon" data-act="dup" title="Duplicate (d)">⧉</button>
      <button class="tt-icon" data-act="del" title="Delete (Del)">🗑</button>
    </div>
  </div>`;
}

function trackerView() {
  const groups = groupByDay(visibleEntries());
  return `${entryBar()}
    <div class="a-filters"><span class="tt-muted">Filter</span>${filterControls()}<span class="tt-spacer"></span><span class="tt-muted">${visibleEntries().length} entries</span></div>
    ${groups.map((g) => `<section class="a-day">
      <header class="a-day-head"><span>${esc(fmtDayHeading(g.ms))}</span><span class="tt-spacer"></span><span class="tt-muted">Total:</span><strong>${fmtDur(g.total)}</strong></header>
      ${g.entries.map(entryRow).join('')}
    </section>`).join('') || '<div class="a-empty">No entries yet — press <kbd>n</kbd></div>'}`;
}

function reportsView() {
  const s = monthSummary();
  const maxDay = Math.max(1, ...s.days.map((d) => Object.values(d).reduce((a, b) => a + b, 0)));
  const bars = s.days.map((d, i) => {
    const tot = Object.values(d).reduce((a, b) => a + b, 0);
    const segs = Object.entries(d).map(([pid, ms]) => `<div class="a-seg" style="height:${(ms / maxDay) * 100}%;background:${projectById(pid)?.color}" title="${esc(projectById(pid)?.name)}: ${fmtDur(ms)}"></div>`).join('');
    return `<div class="a-bar" title="${i + 1}: ${fmtDur(tot)}"><div class="a-bar-stack">${segs}</div><div class="a-bar-label">${i + 1}</div></div>`;
  }).join('');
  return `<div class="a-report-head">
      <div class="a-month"><button class="tt-icon" id="a-prev" title="Previous month ([)">‹</button><strong>${monthLabel(s.key)}</strong><button class="tt-icon" id="a-next" title="Next month (])">›</button></div>
      <div class="a-filters">${filterControls()}</div>
    </div>
    <div class="a-card">
      <div class="a-kpis">
        <div><span class="tt-muted">Total</span><strong class="a-kpi">${fmtDur(s.total)}</strong></div>
        <div><span class="tt-muted">Entries</span><strong class="a-kpi">${s.count}</strong></div>
        <div><span class="tt-muted">Projects</span><strong class="a-kpi">${s.projectIds.length}</strong></div>
      </div>
      <div class="a-chart">${bars}</div>
      <div class="a-legend">${s.projectIds.map((pid) => `<span><span class="tt-dot" style="background:${projectById(pid).color}"></span>${esc(projectById(pid).name)}</span>`).join('')}</div>
    </div>
    <div class="a-card">
      <table class="a-table">
        <thead><tr><th>Customer / Project</th><th class="num">Duration</th><th class="num">Share</th></tr></thead>
        <tbody>${s.groups.map((g) => `
          <tr class="a-group"><td>${esc(g.customer.name)}</td><td class="num">${fmtDur(g.total)}</td><td class="num">${pct(g.total, s.total)}</td></tr>
          ${g.projects.map((p) => `<tr><td class="a-indent"><span class="tt-dot" style="background:${p.project.color}"></span>${esc(p.project.name)}</td><td class="num">${fmtDur(p.total)}</td><td class="num"><div class="a-share"><div style="width:${pct(p.total, s.total)};background:${p.project.color}"></div></div></td></tr>`).join('')}`).join('')
        || '<tr><td colspan="3" class="tt-muted">No time tracked this month</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${fmtDur(s.total)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

export default {
  name: 'Clockify classic',
  listIds: () => visibleEntries().map((e) => e.id),
  focusNew: () => document.querySelector('#a-entrybar [data-f="desc"]')?.focus(),
  render(root) {
    const title = NAV.find((n) => n[0] === state.view)[2];
    const body = { tracker: trackerView, reports: reportsView, projects: projectsPanel, settings: settingsPanel }[state.view]();
    root.innerHTML = `<div class="a-shell">
      <header class="a-top"><span class="a-logo">kanvana</span><span class="a-logo-sub">time</span><span class="tt-spacer"></span><a class="a-back" href="./index.html">Back to Board</a><kbd>?</kbd></header>
      <nav class="a-side">${NAV.map(([id, , label, k]) => `<button class="a-nav ${state.view === id ? 'active' : ''}" data-view="${id}">${label}<kbd>${k}</kbd></button>`).join('')}</nav>
      <main class="a-main"><h1 class="a-h1">${title}</h1>${body}</main>
    </div>${projectDatalist()}`;
    root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; notify(); }));
    wireFilters(root);
    if (state.view === 'tracker') {
      const bar = root.querySelector('#a-entrybar');
      const submit = (data) => { addEntry(data); toast('Entry added'); this.focusNew(); };
      wireEntryFields(bar, submit, () => document.activeElement.blur());
      root.querySelector('#a-add').addEventListener('click', () => bar.querySelector('[data-f="desc"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      root.querySelectorAll('.a-row').forEach((r) => {
        r.addEventListener('click', (ev) => {
          state.selectedId = r.dataset.id;
          const act = ev.target.closest('[data-act]')?.dataset.act;
          if (act === 'edit') return openEditor(r.dataset.id);
          if (act === 'dup') { duplicateEntry(r.dataset.id); return toast('Duplicated — starts now'); }
          if (act === 'del') { state.pendingDeleteId = r.dataset.id; notify(); return; }
          notify();
        });
        r.addEventListener('dblclick', () => openEditor(r.dataset.id));
      });
    }
    if (state.view === 'reports') {
      root.querySelector('#a-prev').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); notify(); });
      root.querySelector('#a-next').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); notify(); });
    }
    if (state.view === 'projects') wireProjectsPanel(root);
    if (state.view === 'settings') wireSettingsPanel(root);
  }
};
