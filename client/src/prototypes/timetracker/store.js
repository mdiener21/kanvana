// PROTOTYPE — throwaway. In-memory only; no IndexedDB, no PocketBase.

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const notify = () => listeners.forEach((fn) => fn());

const uid = () => crypto.randomUUID();
const pad = (n) => String(n).padStart(2, '0');

export const state = {
  view: 'tracker',
  customers: [],
  projects: [],
  entries: [],
  settings: {
    defaultCustomerId: null,
    defaultProjectId: null,
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
    durationFormat: 'hmm'
  },
  filter: { customerId: '', projectId: '' },
  month: null,
  selectedId: null,
  editingId: null,
  pendingDeleteId: null,
  events: []
};

// ---------- timezone ----------
const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    }));
  }
  return dtfCache.get(tz);
}
export function zoned(ms, tz = state.settings.timeZone) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: p.weekday };
}
function offsetAt(ms, tz) {
  const z = zoned(ms, tz);
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi) - Math.floor(ms / 60000) * 60000;
}
export function fromZoned(y, m, d, h, mi, tz = state.settings.timeZone) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess, tz);
  t = guess - offsetAt(t, tz);
  return t;
}
export const dayKey = (ms) => { const z = zoned(ms); return `${z.y}-${pad(z.m)}-${pad(z.d)}`; };
export const monthKey = (ms) => { const z = zoned(ms); return `${z.y}-${pad(z.m)}`; };
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}
export const daysInMonth = (key) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

// ---------- formatting ----------
export function fmtYMD({ y, m, d }) {
  const f = state.settings.dateFormat;
  if (f === 'MM/DD/YYYY') return `${pad(m)}/${pad(d)}/${y}`;
  if (f === 'YYYY-MM-DD') return `${y}-${pad(m)}-${pad(d)}`;
  return `${pad(d)}.${pad(m)}.${y}`;
}
export const fmtDate = (ms) => fmtYMD(zoned(ms));
export function fmtHM(h, mi) {
  if (state.settings.timeFormat === '12h') {
    const ap = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:${pad(mi)} ${ap}`;
  }
  return `${pad(h)}:${pad(mi)}`;
}
export const fmtTime = (ms) => { const z = zoned(ms); return fmtHM(z.h, z.mi); };
export function fmtDur(ms) {
  const mins = Math.round(ms / 60000);
  if (state.settings.durationFormat === 'decimal') return `${(mins / 60).toFixed(2)} h`;
  return `${Math.floor(mins / 60)}:${pad(mins % 60)}`;
}
export function fmtDayHeading(ms) {
  const today = dayKey(Date.now());
  const yest = dayKey(Date.now() - 86400000);
  const k = dayKey(ms);
  if (k === today) return 'Today';
  if (k === yest) return 'Yesterday';
  return `${zoned(ms).wd}, ${fmtDate(ms)}`;
}

// ---------- parsing (shorthand) ----------
export function parseTime(str) {
  let s = String(str ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let ap = null;
  const apm = s.match(/(am|pm|a|p)$/);
  if (apm) { ap = apm[1][0]; s = s.slice(0, -apm[1].length); }
  let h, mi;
  if (/[:.]/.test(s)) { [h, mi] = s.split(/[:.]/).map(Number); }
  else if (/^\d{1,2}$/.test(s)) { h = +s; mi = 0; }
  else if (/^\d{3}$/.test(s)) { h = +s[0]; mi = +s.slice(1); }
  else if (/^\d{4}$/.test(s)) { h = +s.slice(0, 2); mi = +s.slice(2); }
  else return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (!(h >= 0 && h < 24 && mi >= 0 && mi < 60)) return null;
  return h * 60 + mi;
}
export function parseDuration(str) {
  const s = String(str ?? '').trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+)h(\d+)m?$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+)m(in)?$/))) return +m[1];
  if ((m = s.match(/^(\d+(?:\.\d+)?)h?$/))) return Math.round(+m[1] * 60);
  return null;
}
export function parseDate(str) {
  const s = String(str ?? '').trim().toLowerCase();
  const now = zoned(Date.now());
  if (!s || s === 't' || s === 'today') return { y: now.y, m: now.m, d: now.d };
  if (s === 'y' || s === 'yesterday') { const z = zoned(Date.now() - 86400000); return { y: z.y, m: z.m, d: z.d }; }
  const parts = s.split(/\D+/).filter(Boolean).map(Number);
  if (parts.length < 2) return null;
  let y, m, d;
  const f = state.settings.dateFormat;
  if (f === 'YYYY-MM-DD') { if (parts.length === 3) [y, m, d] = parts; else { [m, d] = parts; y = now.y; } }
  else if (f === 'MM/DD/YYYY') [m, d, y = now.y] = parts;
  else [d, m, y = now.y] = parts;
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return { y, m, d };
}
export const fmtMinutes = (min) => fmtHM(Math.floor(min / 60) % 24, min % 60);

// Linked Start/End/Duration. `changed` = which field the user just edited.
export function resolveTimes({ date, start, end, dur }, changed) {
  const d = parseDate(date);
  const s = parseTime(start);
  if (!d || s == null) return null;
  const e = parseTime(end);
  const du = parseDuration(dur);
  let minutes;
  if (changed === 'dur' && du != null) minutes = du;
  else if (e != null) { minutes = e - s; if (minutes < 0) minutes += 1440; }
  else if (du != null) minutes = du;
  else minutes = 0;
  const startMs = fromZoned(d.y, d.m, d.d, 0, s);
  return { startMs, endMs: startMs + minutes * 60000, startMin: s, endMin: (s + minutes) % 1440, minutes, ymd: d };
}

// ---------- lookups ----------
export const customerById = (id) => state.customers.find((c) => c.id === id);
export const projectById = (id) => state.projects.find((p) => p.id === id);
export const projectLabel = (p) => (p ? `${customerById(p.customerId)?.name ?? '?'} / ${p.name}` : '—');
export const activeProjects = () => state.projects.filter((p) => !p.archived && !customerById(p.customerId)?.archived);
export const findProjectByLabel = (label) => {
  const q = String(label ?? '').trim().toLowerCase();
  if (!q) return null;
  return state.projects.find((p) => projectLabel(p).toLowerCase() === q)
    ?? activeProjects().find((p) => projectLabel(p).toLowerCase().includes(q));
};
export const durationOf = (e) => e.end - e.start;

function passesFilter(e) {
  const p = projectById(e.projectId);
  if (state.filter.projectId && e.projectId !== state.filter.projectId) return false;
  if (state.filter.customerId && p?.customerId !== state.filter.customerId) return false;
  return true;
}
export const visibleEntries = () => state.entries.filter(passesFilter).sort((a, b) => b.start - a.start);

export function groupByDay(entries) {
  const groups = new Map();
  for (const e of entries) {
    const k = dayKey(e.start);
    if (!groups.has(k)) groups.set(k, { key: k, ms: e.start, entries: [], total: 0 });
    const g = groups.get(k);
    g.entries.push(e);
    g.total += durationOf(e);
  }
  return [...groups.values()];
}

// Attribution: whole duration counts toward the day/month of the entry's start.
export function monthSummary(key = state.month) {
  const entries = state.entries.filter((e) => passesFilter(e) && monthKey(e.start) === key);
  const n = daysInMonth(key);
  const days = Array.from({ length: n }, () => ({}));
  const byProject = new Map();
  let total = 0;
  for (const e of entries) {
    const dur = durationOf(e);
    const d = zoned(e.start).d - 1;
    days[d][e.projectId] = (days[d][e.projectId] ?? 0) + dur;
    byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + dur);
    total += dur;
  }
  const groups = new Map();
  for (const [pid, ms] of byProject) {
    const p = projectById(pid);
    if (!groups.has(p.customerId)) groups.set(p.customerId, { customer: customerById(p.customerId), total: 0, projects: [] });
    const g = groups.get(p.customerId);
    g.total += ms;
    g.projects.push({ project: p, total: ms });
  }
  const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
  sorted.forEach((g) => g.projects.sort((a, b) => b.total - a.total));
  return { key, total, days, groups: sorted, count: entries.length, projectIds: [...byProject.keys()] };
}

// ---------- mutations (each emits a simulated domain event) ----------
function emitEvent(type, entityId, payload) {
  state.events.unshift({ type, scope: 'timetracking', entity_id: entityId, at: new Date().toISOString(), payload });
  state.events.length = Math.min(state.events.length, 15);
}

export function addEntry({ projectId, description, start, end }) {
  const e = { id: uid(), projectId, description: description ?? '', start, end };
  state.entries.push(e);
  state.selectedId = e.id;
  emitEvent('time_entry.created', e.id, { ...e });
  notify();
  return e;
}
export function updateEntry(id, patch) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  const from = {};
  for (const k of Object.keys(patch)) from[k] = e[k];
  Object.assign(e, patch);
  emitEvent('time_entry.updated', id, { from, to: patch });
  notify();
}
export function deleteEntry(id) {
  state.entries = state.entries.filter((x) => x.id !== id);
  if (state.selectedId === id) state.selectedId = visibleEntries()[0]?.id ?? null;
  emitEvent('time_entry.deleted', id, {});
  notify();
}
export function duplicateEntry(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  const len = durationOf(e);
  const now = Math.floor(Date.now() / 60000) * 60000;
  return addEntry({ projectId: e.projectId, description: e.description, start: now, end: now + len });
}

export function addCustomer(name) {
  const c = { id: uid(), name, archived: false };
  state.customers.push(c);
  emitEvent('customer.created', c.id, { name });
  notify();
  return c;
}
export function addProject(customerId, name) {
  const p = { id: uid(), customerId, name, color: PALETTE[state.projects.length % PALETTE.length], archived: false };
  state.projects.push(p);
  emitEvent('project.created', p.id, { customerId, name });
  notify();
  return p;
}
export function setArchived(kind, id, archived) {
  const list = kind === 'customer' ? state.customers : state.projects;
  const x = list.find((i) => i.id === id);
  x.archived = archived;
  emitEvent(`${kind}.${archived ? 'archived' : 'unarchived'}`, id, {});
  notify();
}
export function isReferenced(kind, id) {
  if (kind === 'customer') return state.projects.some((p) => p.customerId === id);
  return state.entries.some((e) => e.projectId === id);
}
export function hardDelete(kind, id) {
  if (isReferenced(kind, id)) return false;
  if (kind === 'customer') state.customers = state.customers.filter((c) => c.id !== id);
  else state.projects = state.projects.filter((p) => p.id !== id);
  emitEvent(`${kind}.deleted`, id, {});
  notify();
  return true;
}
export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  emitEvent('settings.updated', 'timetracking', patch);
  notify();
}

// ---------- seed ----------
export const PALETTE = ['#03a9f4', '#e91e63', '#8bc34a', '#ff9800', '#9c27b0', '#009688', '#795548', '#3f51b5'];

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function seed() {
  const rnd = mulberry32(42);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const cust = ['Acme GmbH', 'Globex AG', 'Initech'].map((name) => ({ id: uid(), name, archived: false }));
  const projSpec = [[0, 'Website relaunch'], [0, 'SEO audit'], [1, 'Mobile app'], [1, 'Support retainer'], [2, 'Data migration'], [2, 'Old intranet']];
  state.customers = cust;
  state.projects = projSpec.map(([ci, name], i) => ({ id: uid(), customerId: cust[ci].id, name, color: PALETTE[i], archived: name === 'Old intranet' }));
  const descs = ['Standup', 'Fix login bug', 'Design review', 'Client call', 'Write specs', 'Code review', 'Deploy', 'Refactor API', 'Workshop prep', ''];
  const live = state.projects.filter((p) => !p.archived);
  const entries = [];
  const today = zoned(Date.now());
  for (let back = 75; back >= 0; back--) {
    const ms = Date.now() - back * 86400000;
    const z = zoned(ms);
    if (z.wd === 'Sat' || z.wd === 'Sun') continue;
    let t = 8 * 60 + Math.floor(rnd() * 4) * 15;
    const blocks = 2 + Math.floor(rnd() * 3);
    for (let b = 0; b < blocks; b++) {
      const len = (2 + Math.floor(rnd() * 8)) * 15;
      if (back === 0 && t + len > today.h * 60 + today.mi) break;
      const start = fromZoned(z.y, z.m, z.d, 0, t);
      entries.push({ id: uid(), projectId: pick(live).id, description: pick(descs), start, end: start + len * 60000 });
      t += len + Math.floor(rnd() * 3) * 15;
    }
  }
  // Overnight entry crossing the previous month boundary — attributed wholly to its start month.
  const prev = shiftMonth(monthKey(Date.now()), -1).split('-').map(Number);
  const lastDay = new Date(Date.UTC(prev[0], prev[1], 0)).getUTCDate();
  const ovStart = fromZoned(prev[0], prev[1], lastDay, 22, 0);
  entries.push({ id: uid(), projectId: live[2].id, description: 'Overnight release (crosses month)', start: ovStart, end: ovStart + 4 * 3600000 });
  state.entries = entries;
  state.settings.defaultCustomerId = cust[0].id;
  state.settings.defaultProjectId = state.projects[0].id;
  state.month = monthKey(Date.now());
  state.selectedId = visibleEntries()[0]?.id ?? null;
}
