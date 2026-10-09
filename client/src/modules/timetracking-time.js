const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

// ── Timezone ───────────────────────────────────────────────────────────────────

const partsFormatters = new Map();

function partsFormatter(tz) {
  if (!partsFormatters.has(tz)) {
    partsFormatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }));
  }
  return partsFormatters.get(tz);
}

export function zonedParts(ms, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, minutes: (+p.hour % 24) * 60 + +p.minute };
}

function offsetAt(ms, tz) {
  const z = zonedParts(ms, tz);
  const wallAsUtc = Date.UTC(z.y, z.m - 1, z.d) + z.minutes * MS_PER_MINUTE;
  return wallAsUtc - Math.floor(ms / MS_PER_MINUTE) * MS_PER_MINUTE;
}

// Skipped wall times (spring forward) move forward by the gap; repeated wall
// times (fall back) resolve to the first occurrence — same as Temporal's 'compatible'.
export function fromZoned({ y, m, d }, minutes, tz) {
  const wallAsUtc = Date.UTC(y, m - 1, d) + minutes * MS_PER_MINUTE;
  const before = wallAsUtc - offsetAt(wallAsUtc - MS_PER_DAY, tz);
  const after = wallAsUtc - offsetAt(wallAsUtc + MS_PER_DAY, tz);
  const isExact = (ms) => ms + offsetAt(ms, tz) === wallAsUtc;
  const exact = [before, after].filter(isExact);
  return exact.length > 0 ? Math.min(...exact) : before;
}

const ymdOf = ({ y, m, d }) => ({ y, m, d });

function addDays({ y, m, d }, days) {
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

// ── Parsing (shorthand) ────────────────────────────────────────────────────────

export function parseTime(input) {
  let s = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let meridiem = null;
  const suffix = s.match(/(am|pm|a|p)$/);
  if (suffix) {
    meridiem = suffix[1][0];
    s = s.slice(0, -suffix[1].length);
  }
  let h;
  let mi;
  let m;
  if ((m = s.match(/^(\d{1,2})[:.](\d{2})$/))) { h = +m[1]; mi = +m[2]; }
  else if (/^\d{1,2}$/.test(s)) { h = +s; mi = 0; }
  else if (/^\d{3,4}$/.test(s)) { h = +s.slice(0, -2); mi = +s.slice(-2); }
  else return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem === 'p' ? 12 : 0);
  }
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function parseDuration(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  let m;
  if ((m = s.match(/^(\d+):(\d{2})$/))) return +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  if ((m = s.match(/^(\d+)h(\d+)m?$/))) return +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  if ((m = s.match(/^(\d+)m(in)?$/))) return +m[1];
  if ((m = s.match(/^(\d+(?:\.\d+)?|\.\d+)h?$/))) return Math.round(+m[1] * 60);
  return null;
}

const DATE_FIELD_ORDER = {
  'DD.MM.YYYY': ['d', 'm', 'y'],
  'MM/DD/YYYY': ['m', 'd', 'y'],
  'YYYY-MM-DD': ['y', 'm', 'd']
};

export function parseDate(input, { dateFormat, tz, now }) {
  const s = String(input ?? '').trim().toLowerCase();
  const today = ymdOf(zonedParts(now, tz));
  if (s === 't' || s === 'today') return today;
  if (s === 'y' || s === 'yesterday') return addDays(today, -1);

  const numbers = s.split(/\D+/).filter(Boolean).map(Number);
  if (numbers.length < 2 || numbers.length > 3 || !/^[\d\s./-]+$/.test(s)) return null;
  const order = DATE_FIELD_ORDER[dateFormat] ?? DATE_FIELD_ORDER['DD.MM.YYYY'];
  const fields = numbers.length === 3 ? order : order.filter((f) => f !== 'y');
  const parsed = { y: today.y };
  fields.forEach((field, i) => { parsed[field] = numbers[i]; });
  if (parsed.y < 100) parsed.y += 2000;

  const check = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  if (check.getUTCFullYear() !== parsed.y || check.getUTCMonth() + 1 !== parsed.m || check.getUTCDate() !== parsed.d) {
    return null;
  }
  return { y: parsed.y, m: parsed.m, d: parsed.d };
}

// ── Formatting ─────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');

export function formatYmd({ y, m, d }, dateFormat) {
  if (dateFormat === 'MM/DD/YYYY') return `${pad2(m)}/${pad2(d)}/${y}`;
  if (dateFormat === 'YYYY-MM-DD') return `${y}-${pad2(m)}-${pad2(d)}`;
  return `${pad2(d)}.${pad2(m)}.${y}`;
}

export function formatMinutes(minutes, timeFormat) {
  const h = Math.floor(minutes / 60) % 24;
  const mi = minutes % 60;
  if (timeFormat === '12h') return `${h % 12 || 12}:${pad2(mi)} ${h < 12 ? 'AM' : 'PM'}`;
  return `${pad2(h)}:${pad2(mi)}`;
}

export const formatDate = (ms, { tz, dateFormat }) => formatYmd(zonedParts(ms, tz), dateFormat);

export const formatTime = (ms, { tz, timeFormat }) => formatMinutes(zonedParts(ms, tz).minutes, timeFormat);

export function formatDuration(ms) {
  const minutes = Math.round(ms / MS_PER_MINUTE);
  return `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}`;
}

// ── Linked Start / End / Duration ──────────────────────────────────────────────

const ymdToUtcMs = ({ y, m, d }) => Date.UTC(y, m - 1, d);

export function plusDaysBetween(startMs, endMs, tz) {
  return Math.round((ymdToUtcMs(zonedParts(endMs, tz)) - ymdToUtcMs(zonedParts(startMs, tz))) / MS_PER_DAY);
}

export function describeEntryTimes(startMs, endMs, prefs) {
  return {
    startMs,
    endMs,
    plusDays: plusDaysBetween(startMs, endMs, prefs.tz),
    values: {
      date: formatDate(startMs, prefs),
      start: formatTime(startMs, prefs),
      end: formatTime(endMs, prefs),
      duration: formatDuration(endMs - startMs)
    }
  };
}

export function resolveLinkedFields(values, changed, prefs) {
  const ymd = parseDate(values.date, prefs);
  const startMinutes = parseTime(values.start);
  if (!ymd || startMinutes === null) return null;
  const startMs = fromZoned(ymd, startMinutes, prefs.tz);

  let endMs;
  if (changed === 'start' || changed === 'end') {
    const endMinutes = parseTime(values.end);
    if (endMinutes === null) return null;
    const endYmd = endMinutes < startMinutes ? addDays(ymd, 1) : ymd;
    endMs = fromZoned(endYmd, endMinutes, prefs.tz);
  } else {
    const durationMinutes = parseDuration(values.duration);
    if (durationMinutes === null) return null;
    endMs = startMs + durationMinutes * MS_PER_MINUTE;
  }
  return describeEntryTimes(startMs, endMs, prefs);
}

// ── Day grouping (Attribution: an entry belongs wholly to the day of its start) ──

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayKeyOf = ({ y, m, d }) => `${y}-${pad2(m)}-${pad2(d)}`;

export const dayKey = (ms, tz) => dayKeyOf(zonedParts(ms, tz));

function dayHeading(ymd, prefs) {
  const today = ymdOf(zonedParts(prefs.now, prefs.tz));
  const key = dayKeyOf(ymd);
  if (key === dayKeyOf(today)) return 'Today';
  if (key === dayKeyOf(addDays(today, -1))) return 'Yesterday';
  return `${WEEKDAYS[new Date(ymdToUtcMs(ymd)).getUTCDay()]}, ${formatYmd(ymd, prefs.dateFormat)}`;
}

export function groupEntriesByDay(entries, prefs) {
  const sorted = [...entries].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const groups = new Map();
  for (const entry of sorted) {
    const startMs = Date.parse(entry.start);
    const ymd = ymdOf(zonedParts(startMs, prefs.tz));
    const key = dayKeyOf(ymd);
    if (!groups.has(key)) groups.set(key, { key, heading: dayHeading(ymd, prefs), totalMs: 0, entries: [] });
    const group = groups.get(key);
    group.entries.push(entry);
    group.totalMs += Date.parse(entry.end) - startMs;
  }
  return [...groups.values()];
}

export function adjustLinkedField(values, field, deltaMinutes, prefs) {
  const current = resolveLinkedFields(values, field, prefs);
  if (!current) return null;
  const delta = deltaMinutes * MS_PER_MINUTE;
  const next = { ...current.values };
  if (field === 'start') {
    const startMs = current.startMs + delta;
    next.date = formatDate(startMs, prefs);
    next.start = formatTime(startMs, prefs);
  } else if (field === 'end') {
    next.end = formatTime(current.endMs + delta, prefs);
  } else {
    next.duration = formatDuration(Math.max(0, current.endMs - current.startMs + delta));
  }
  return resolveLinkedFields(next, field, prefs);
}
