// PROTOTYPE — Variant C: "Command line + calendar" — one smart input line, month calendar heat-grid beside the entry list; reports as hero total + customer cards + cumulative line.
import {
  state, notify, visibleEntries, monthSummary, monthLabel, shiftMonth, monthKey, fmtTime, fmtDur, fmtYMD, fmtDayHeading, durationOf,
  dayKey, addEntry, parseTime, parseDuration, parseDate, fromZoned, zoned, activeProjects, projectLabel, daysInMonth
} from './store.js';
import { esc, projectDatalist, filterControls, wireFilters, projectsPanel, wireProjectsPanel, settingsPanel, wireSettingsPanel, projectById, customerById, toast, openEditor } from './shared.js';

let cmdText = '';
let pickedDay = null;

const slug = (p) => `#${p.name.replace(/\s+/g, '-')}`;
function matchProjects(q) {
  const s = q.toLowerCase().replace(/-/g, ' ');
  return activeProjects().filter((p) => projectLabel(p).toLowerCase().includes(s) || p.name.toLowerCase().includes(s));
}

// "9-1030 #web Fix login bug @y" | "1h30 #seo audit" | "@07.10 13-1715 #mobile"
function parseCommand(text) {
  const out = { desc: [], project: projectById(state.settings.defaultProjectId), projectGuessed: true };
  let range = null; let dur = null; let date = parseDate('');
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    let m;
    if (tok.startsWith('#') && tok.length > 1) { const p = matchProjects(tok.slice(1))[0]; if (p) { out.project = p; out.projectGuessed = false; } continue; }
    if (tok.startsWith('@')) { const d = parseDate(tok.slice(1)); if (d) date = d; continue; }
    if ((m = tok.match(/^([^-]+)-([^-]+)$/)) && parseTime(m[1]) != null && parseTime(m[2]) != null) { range = [parseTime(m[1]), parseTime(m[2])]; continue; }
    if (/^(\d+:\d{2}|\d+[.,]\d+h?|\d+h(\d+m?)?|\d+m(in)?)$/i.test(tok) && parseDuration(tok) != null) { dur = parseDuration(tok); continue; }
    out.desc.push(tok);
  }
  const now = zoned(Date.now());
  const startMin = range ? range[0] : now.h * 60 + now.mi;
  let minutes = range ? range[1] - range[0] : dur ?? 0;
  if (minutes < 0) minutes += 1440;
  const start = fromZoned(date.y, date.m, date.d, 0, startMin);
  return { ...out, description: out.desc.join(' '), date, start, end: start + minutes * 60000, minutes };
}

function preview() {
  const r = parseCommand(cmdText);
  const token = cmdText.split(/\s+/).pop();
  const sugg = token.startsWith('#') ? matchProjects(token.slice(1)).slice(0, 5) : [];
  const chip = (label, val, warn) => `<span class="c-chip ${warn ? 'warn' : ''}"><em>${label}</em>${val}</span>`;
  return `<div class="c-preview">
    ${chip('project', r.project ? `<span class="tt-dot" style="background:${r.project.color}"></span>${esc(projectLabel(r.project))}${r.projectGuessed ? ' <small>(default)</small>' : ''}` : 'none', !r.project)}
    ${chip('date', fmtYMD(r.date))}
    ${chip('time', `${fmtTime(r.start)} – ${fmtTime(r.end)}${r.minutes && zoned(r.end - 1).d !== r.date.d ? ' +1' : ''}`)}
    ${chip('duration', fmtDur(r.minutes * 60000), !r.minutes)}
    ${chip('description', esc(r.description) || '<small>none</small>')}
  </div>
  ${sugg.length ? `<div class="c-sugg">${sugg.map((p, i) => `<span class="${i === 0 ? 'first' : ''}"><span class="tt-dot" style="background:${p.color}"></span>${esc(projectLabel(p))}</span>`).join('')}<small><kbd>Tab</kbd> complete</small></div>` : ''}`;
}

function calendar() {
  const s = monthSummary();
  const [y, m] = s.key.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const max = Math.max(1, ...s.days.map((d) => Object.values(d).reduce((a, b) => a + b, 0)));
  const today = dayKey(Date.now());
  const cells = Array.from({ length: lead }, () => '<div class="c-cal-cell empty"></div>').concat(s.days.map((d, i) => {
    const key = `${s.key}-${String(i + 1).padStart(2, '0')}`;
    const tot = Object.values(d).reduce((a, b) => a + b, 0);
    const stripes = Object.entries(d).map(([pid, ms]) => `<div style="flex:${ms};background:${projectById(pid).color}"></div>`).join('');
    return `<button class="c-cal-cell ${key === today ? 'today' : ''} ${key === pickedDay ? 'picked' : ''}" data-day="${key}" style="--heat:${tot / max}">
      <span class="c-cal-num">${i + 1}</span>${tot ? `<span class="c-cal-tot">${fmtDur(tot)}</span><div class="c-cal-stripes">${stripes}</div>` : ''}</button>`;
  })).join('');
  return `<div class="c-cal">
    <div class="c-cal-head"><button class="tt-icon" id="c-prev">‹</button><strong>${monthLabel(s.key)}</strong><button class="tt-icon" id="c-next">›</button><span class="tt-spacer"></span><strong>${fmtDur(s.total)}</strong></div>
    <div class="c-cal-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<div class="c-cal-wd">${d}</div>`).join('')}${cells}</div>
    <div class="c-filters">${filterControls()}</div>
  </div>`;
}

function listEntries() {
  return visibleEntries().filter((e) => (pickedDay ? dayKey(e.start) === pickedDay : monthKey(e.start) === state.month));
}

function trackerView() {
  let last = null;
  const list = listEntries().map((e) => {
    const p = projectById(e.projectId);
    const k = dayKey(e.start);
    const head = k !== last ? `<div class="c-list-day">${esc(fmtDayHeading(e.start))}</div>` : '';
    last = k;
    return `${head}<div class="c-item ${state.selectedId === e.id ? 'is-selected' : ''}" data-id="${e.id}" style="--pc:${p?.color}">
      <div class="c-item-main"><div>${esc(e.description || '(no description)')}</div><small>${esc(customerById(p?.customerId)?.name)} / ${esc(p?.name)}</small></div>
      <div class="c-item-time">${fmtTime(e.start)}–${fmtTime(e.end)}</div><div class="c-item-dur">${fmtDur(durationOf(e))}</div></div>`;
  }).join('');
  return `<div class="c-cmd-wrap">
      <div class="c-cmd"><span class="c-prompt">›</span><input id="c-cmd" value="${esc(cmdText)}" placeholder="9-1030 #website Fix login bug @y   ·   1h30 #seo audit   ·   press n" autocomplete="off" spellcheck="false"></div>
      <div id="c-preview">${preview()}</div>
    </div>
    <div class="c-split">${calendar()}<div class="c-list"><div class="c-list-title">${pickedDay ? `Day ${esc(pickedDay)} <button class="tt-btn-link" id="c-clear-day">show month</button>` : `All of ${monthLabel(state.month)}`}</div>${list || '<div class="tt-muted c-empty">Nothing here.</div>'}</div></div>`;
}

function reportsView() {
  const s = monthSummary();
  const n = daysInMonth(s.key);
  let acc = 0;
  const cum = s.days.map((d) => (acc += Object.values(d).reduce((a, b) => a + b, 0)));
  const W = 600; const H = 120; const max = Math.max(1, acc);
  const pts = cum.map((v, i) => `${(i / (n - 1)) * W},${H - (v / max) * H}`).join(' ');
  return `<div class="c-rep-head"><button class="tt-icon" id="c-prev">‹</button><h2>${monthLabel(s.key)}</h2><button class="tt-icon" id="c-next">›</button><span class="tt-spacer"></span>${filterControls()}</div>
    <div class="c-hero"><div><div class="c-hero-num">${fmtDur(s.total)}</div><div class="tt-muted">${s.count} entries · ${s.projectIds.length} projects · ${s.groups.length} customers</div></div>
      <svg viewBox="0 0 ${W} ${H}" class="c-cum" preserveAspectRatio="none"><polyline points="0,${H} ${pts} ${W},${H}" class="c-cum-fill"/><polyline points="${pts}" class="c-cum-line"/></svg></div>
    <div class="c-cards">${s.groups.map((g) => `<div class="c-card"><div class="c-card-head"><strong>${esc(g.customer.name)}</strong><span>${fmtDur(g.total)}</span></div>
      <div class="c-card-bar">${g.projects.map((p) => `<div style="flex:${p.total};background:${p.project.color}" title="${esc(p.project.name)}"></div>`).join('')}</div>
      ${g.projects.map((p) => `<div class="c-card-row"><span class="tt-dot" style="background:${p.project.color}"></span>${esc(p.project.name)}<span class="tt-spacer"></span>${fmtDur(p.total)}</div>`).join('')}
    </div>`).join('') || '<p class="tt-muted">No time tracked this month</p>'}</div>`;
}

const VIEWS = [['tracker', 'Track', 'g t'], ['reports', 'Month', 'g r'], ['projects', 'Projects', 'g p'], ['settings', 'Settings', 'g s']];

export default {
  name: 'Command line + calendar',
  listIds: () => listEntries().map((e) => e.id),
  focusNew: () => document.getElementById('c-cmd')?.focus(),
  edit: (id) => openEditor(id),
  render(root) {
    const body = { tracker: trackerView, reports: reportsView, projects: projectsPanel, settings: settingsPanel }[state.view]();
    root.innerHTML = `<div class="c-shell">
      <header class="c-top"><span class="c-logo">kanvana<b>/time</b></span>
        ${VIEWS.map(([id, label, k]) => `<button class="c-tab ${state.view === id ? 'active' : ''}" data-view="${id}">${label}<kbd>${k}</kbd></button>`).join('')}
        <span class="tt-spacer"></span><a href="./index.html" class="c-back">Board</a></header>
      <main class="c-main">${body}</main></div>${projectDatalist()}`;
    root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; notify(); }));
    root.querySelector('#c-prev')?.addEventListener('click', () => { state.month = shiftMonth(state.month, -1); pickedDay = null; notify(); });
    root.querySelector('#c-next')?.addEventListener('click', () => { state.month = shiftMonth(state.month, 1); pickedDay = null; notify(); });
    wireFilters(root);
    if (state.view === 'tracker') {
      const input = root.querySelector('#c-cmd');
      input.addEventListener('input', () => { cmdText = input.value; root.querySelector('#c-preview').innerHTML = preview(); });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Tab') {
          const parts = input.value.split(/(\s+)/);
          const last = parts[parts.length - 1];
          const p = last.startsWith('#') && matchProjects(last.slice(1))[0];
          if (p) { ev.preventDefault(); parts[parts.length - 1] = `${slug(p)} `; input.value = cmdText = parts.join(''); root.querySelector('#c-preview').innerHTML = preview(); }
        }
        if (ev.key === 'Enter') {
          const r = parseCommand(input.value);
          if (!r.project) return toast('No project — use #name');
          if (!r.minutes) return toast('No time — add 9-1030 or a duration like 1h30');
          cmdText = '';
          addEntry({ projectId: r.project.id, description: r.description, start: r.start, end: r.end });
          toast('Entry added');
          this.focusNew();
        }
        if (ev.key === 'Escape') { cmdText = ''; input.value = ''; input.blur(); root.querySelector('#c-preview').innerHTML = preview(); }
      });
      root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { pickedDay = pickedDay === b.dataset.day ? null : b.dataset.day; notify(); }));
      root.querySelector('#c-clear-day')?.addEventListener('click', () => { pickedDay = null; notify(); });
      root.querySelectorAll('.c-item').forEach((r) => {
        r.addEventListener('click', () => { state.selectedId = r.dataset.id; notify(); });
        r.addEventListener('dblclick', () => openEditor(r.dataset.id));
      });
    }
    if (state.view === 'projects') wireProjectsPanel(root);
    if (state.view === 'settings') wireSettingsPanel(root);
  }
};
