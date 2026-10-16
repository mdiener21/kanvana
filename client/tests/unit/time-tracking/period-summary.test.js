import { describe, test, expect } from 'vitest';
import { formatDuration } from '../../../src/modules/timetracking-time.js';
import { summarizePeriod, periodOf, currentPeriod, shiftPeriod, periodLabel } from '../../../src/modules/timetracking-report.js';

const TZ = 'Europe/Berlin';
const H = 3600000;
const month = (y, m) => periodOf('month', { y, m, d: 1 });
const OCT = month(2026, 10);
const NOV = month(2026, 11);
const summarizeMonth = (tt, entries, period, tz) => summarizePeriod(tt, entries, period, { tz });

const tt = {
  customers: [
    { id: 'c1', name: 'Acme', color: '#000' },
    { id: 'c2', name: 'Globex', color: '#111' }
  ],
  projects: [
    { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4' },
    { id: 'p2', customerId: 'c1', name: 'Backend', color: '#e91e63' },
    { id: 'p3', customerId: 'c2', name: 'Support', color: '#8bc34a' }
  ]
};

const entry = (id, projectId, start, end) => ({ id, projectId, description: '', start, end });

describe('month period — Attribution', () => {
  // 31 Oct 22:00 → 1 Nov 02:00 Europe/Berlin (CET, UTC+1)
  const overnight = entry('overnight', 'p1', '2026-10-31T21:00:00.000Z', '2026-11-01T01:00:00.000Z');

  test('an entry from the last day of a month 22:00 to 02:00 next day counts entirely to the earlier month', () => {
    const october = summarizeMonth(tt, [overnight], OCT, TZ);
    expect(october.totalMs).toBe(4 * H);
    expect(october.entryCount).toBe(1);
    expect(october.buckets[30]).toMatchObject({ start: { y: 2026, m: 10, d: 31 }, totalMs: 4 * H });

    const november = summarizeMonth(tt, [overnight], NOV, TZ);
    expect(november.totalMs).toBe(0);
    expect(november.entryCount).toBe(0);
    expect(november.buckets[0].totalMs).toBe(0);
  });

  test('the month is taken from the start in the user timezone, not UTC', () => {
    const late = entry('late', 'p1', '2026-10-31T23:30:00.000Z', '2026-11-01T00:30:00.000Z');
    expect(summarizeMonth(tt, [late], NOV, TZ)).toMatchObject({ totalMs: H, entryCount: 1 });
    expect(summarizeMonth(tt, [late], OCT, TZ).entryCount).toBe(0);
    expect(summarizeMonth(tt, [late], OCT, 'UTC').entryCount).toBe(1);
  });
});

describe('month period — totals and grouping', () => {
  const entries = [
    entry('a', 'p1', '2026-10-01T07:00:00.000Z', '2026-10-01T08:00:00.000Z'),
    entry('b', 'p2', '2026-10-01T09:00:00.000Z', '2026-10-01T09:30:00.000Z'),
    entry('c', 'p3', '2026-10-02T07:00:00.000Z', '2026-10-02T09:00:00.000Z'),
    entry('d', 'p1', '2026-10-15T07:00:00.000Z', '2026-10-15T07:45:00.000Z'),
    entry('other-month', 'p3', '2026-09-30T07:00:00.000Z', '2026-09-30T17:00:00.000Z')
  ];
  const s = summarizeMonth(tt, entries, OCT, TZ);

  test('KPIs: total duration, number of entries, number of projects in the month', () => {
    expect(s.totalMs).toBe(4.25 * H);
    expect(s.entryCount).toBe(4);
    expect(s.projectCount).toBe(3);
  });

  test('one day bucket per calendar day of the month, with per-project durations', () => {
    expect(s.buckets).toHaveLength(31);
    expect(s.buckets.map((b) => b.start.d)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(s.buckets[0]).toEqual({ start: { y: 2026, m: 10, d: 1 }, totalMs: 1.5 * H, byProject: { p1: H, p2: 0.5 * H } });
    expect(s.buckets[1]).toEqual({ start: { y: 2026, m: 10, d: 2 }, totalMs: 2 * H, byProject: { p3: 2 * H } });
    expect(s.buckets[2]).toEqual({ start: { y: 2026, m: 10, d: 3 }, totalMs: 0, byProject: {} });
    expect(summarizeMonth(tt, [], month(2028, 2), TZ).buckets).toHaveLength(29);
  });

  test('customers sorted by total, projects sorted by total within, with share of the month', () => {
    expect(s.customers.map((c) => [c.name, c.totalMs])).toEqual([
      ['Acme', 2.25 * H],
      ['Globex', 2 * H]
    ]);
    expect(s.customers[0].projects.map((p) => [p.name, p.totalMs, p.color])).toEqual([
      ['Website', 1.75 * H, '#03a9f4'],
      ['Backend', 0.5 * H, '#e91e63']
    ]);
    expect(s.customers[1].projects[0].share).toBeCloseTo(2 / 4.25);
  });

  test('customer subtotals add up to the grand total, project totals to their customer', () => {
    const sum = (xs) => xs.reduce((acc, x) => acc + x.totalMs, 0);
    expect(sum(s.customers)).toBe(s.totalMs);
    for (const customer of s.customers) expect(sum(customer.projects)).toBe(customer.totalMs);
    expect(sum(s.buckets)).toBe(s.totalMs);
  });

  test('projects list every project tracked in the month, sorted by total, for the chart legend', () => {
    expect(s.projects.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
  });

  test('equal totals fall back to name order', () => {
    const tied = summarizeMonth(tt, [
      entry('x', 'p3', '2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z'),
      entry('y', 'p1', '2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z')
    ], OCT, TZ);
    expect(tied.customers.map((c) => c.name)).toEqual(['Acme', 'Globex']);
  });

  test('an entry whose project no longer exists is kept under an unknown customer / project', () => {
    const ghost = summarizeMonth(tt, [entry('g', 'gone', '2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z')], OCT, TZ);
    expect(ghost.totalMs).toBe(H);
    expect(ghost.customers).toMatchObject([{ name: 'Unknown customer', projects: [{ name: 'Unknown project' }] }]);
  });

  test('an empty month has zero totals and no rows', () => {
    const empty = summarizeMonth(tt, entries, month(2026, 12), TZ);
    expect(empty).toMatchObject({ totalMs: 0, entryCount: 0, projectCount: 0, customers: [], projects: [] });
  });
});

describe('month navigation', () => {
  test('the current month is the month of now in the user timezone', () => {
    expect(currentPeriod('month', Date.parse('2026-10-31T23:30:00.000Z'), TZ)).toEqual(NOV);
    expect(currentPeriod('month', Date.parse('2026-10-31T23:30:00.000Z'), 'UTC')).toEqual(OCT);
  });

  test('a month runs from its first to its last calendar day', () => {
    expect(OCT).toEqual({ kind: 'month', start: { y: 2026, m: 10, d: 1 }, end: { y: 2026, m: 10, d: 31 } });
    expect(periodOf('month', { y: 2026, m: 10, d: 17 })).toEqual(OCT);
    expect(month(2028, 2).end).toEqual({ y: 2028, m: 2, d: 29 });
  });

  test('shifting a month steps across year boundaries', () => {
    expect(shiftPeriod(month(2026, 12), 1)).toEqual(month(2027, 1));
    expect(shiftPeriod(month(2026, 1), -1)).toEqual(month(2025, 12));
    expect(shiftPeriod(OCT, 0)).toEqual(OCT);
    expect(shiftPeriod(OCT, -14)).toEqual(month(2025, 8));
  });

  test('a month is labelled with its name and year', () => {
    expect(periodLabel(OCT)).toBe('October 2026');
    expect(periodLabel(month(2027, 1))).toBe('January 2027');
    expect(summarizeMonth(tt, [], OCT, TZ).label).toBe('October 2026');
  });
});

describe('week period', () => {
  const week = (y, m, d) => periodOf('week', { y, m, d });

  test('a week runs Monday to Sunday around the anchor day', () => {
    const w42 = { kind: 'week', start: { y: 2026, m: 10, d: 12 }, end: { y: 2026, m: 10, d: 18 } };
    expect(week(2026, 10, 12)).toEqual(w42); // Monday
    expect(week(2026, 10, 15)).toEqual(w42); // Thursday
    expect(week(2026, 10, 18)).toEqual(w42); // Sunday
    expect(week(2026, 10, 19).start).toEqual({ y: 2026, m: 10, d: 19 });
  });

  test('the current week is the week of now in the user timezone', () => {
    // Sunday 18 Oct 23:30 UTC is already Monday 19 Oct in Berlin
    const now = Date.parse('2026-10-18T23:30:00.000Z');
    expect(currentPeriod('week', now, TZ)).toEqual(week(2026, 10, 19));
    expect(currentPeriod('week', now, 'UTC')).toEqual(week(2026, 10, 12));
  });

  test('a week is labelled with its ISO week number and date range', () => {
    expect(periodLabel(week(2026, 10, 12))).toBe('W42 · 12–18 Oct 2026');
    expect(periodLabel(week(2026, 10, 26))).toBe('W44 · 26 Oct – 1 Nov 2026');
    expect(periodLabel(week(2025, 12, 22))).toBe('W52 · 22–28 Dec 2025');
    expect(periodLabel(week(2025, 12, 31))).toBe('W1 · 29 Dec 2025 – 4 Jan 2026');
    expect(periodLabel(week(2027, 1, 1))).toBe('W53 · 28 Dec 2026 – 3 Jan 2027');
    expect(periodLabel(week(2027, 1, 4))).toBe('W1 · 4–10 Jan 2027');
  });

  test('shifting a week steps seven days, across month and year boundaries', () => {
    expect(shiftPeriod(week(2026, 10, 12), 1)).toEqual(week(2026, 10, 19));
    expect(shiftPeriod(week(2026, 10, 12), -1)).toEqual(week(2026, 10, 5));
    expect(shiftPeriod(week(2025, 12, 22), 1)).toEqual(week(2025, 12, 29));
    expect(periodLabel(shiftPeriod(week(2026, 12, 21), 1))).toBe('W53 · 28 Dec 2026 – 3 Jan 2027');
    expect(periodLabel(shiftPeriod(week(2026, 12, 28), 1))).toBe('W1 · 4–10 Jan 2027');
    expect(periodLabel(shiftPeriod(week(2026, 1, 1), -1))).toBe('W52 · 22–28 Dec 2025');
    expect(shiftPeriod(week(2026, 10, 12), 0)).toEqual(week(2026, 10, 12));
  });

  test('one bucket per day Monday to Sunday, entries attributed by start in the user timezone', () => {
    const entries = [
      entry('mon', 'p1', '2026-10-12T07:00:00.000Z', '2026-10-12T08:00:00.000Z'),
      // Sunday 18 Oct 23:30 Berlin (21:30 UTC) → still this week, on Sunday
      entry('sun-late', 'p3', '2026-10-18T21:30:00.000Z', '2026-10-18T23:30:00.000Z'),
      // Monday 19 Oct 00:30 Berlin (22:30 UTC on Sunday) → next week
      entry('next-mon', 'p1', '2026-10-18T22:30:00.000Z', '2026-10-18T23:30:00.000Z'),
      // Sunday 11 Oct 23:30 Berlin → previous week
      entry('prev-sun', 'p1', '2026-10-11T21:30:00.000Z', '2026-10-11T22:00:00.000Z')
    ];
    const s = summarizePeriod(tt, entries, week(2026, 10, 12), { tz: TZ });
    expect(s.label).toBe('W42 · 12–18 Oct 2026');
    expect(s.buckets.map((b) => b.start)).toEqual(Array.from({ length: 7 }, (_, i) => ({ y: 2026, m: 10, d: 12 + i })));
    expect(s.buckets[0]).toEqual({ start: { y: 2026, m: 10, d: 12 }, totalMs: H, byProject: { p1: H } });
    expect(s.buckets[6]).toEqual({ start: { y: 2026, m: 10, d: 18 }, totalMs: 2 * H, byProject: { p3: 2 * H } });
    expect(s).toMatchObject({ totalMs: 3 * H, entryCount: 2, projectCount: 2 });
    expect(s.customers.map((c) => [c.name, c.totalMs])).toEqual([['Globex', 2 * H], ['Acme', H]]);
    expect(s.projects.map((p) => [p.id, p.share])).toEqual([['p3', 2 / 3], ['p1', 1 / 3]]);
  });

  test('around the DST change and across a month end, entries land on the calendar day of their start', () => {
    // Berlin falls back on Sun 25 Oct 2026; 23:30 CET that evening is 22:30 UTC
    const w43 = summarizePeriod(tt, [
      entry('dst', 'p1', '2026-10-25T22:30:00.000Z', '2026-10-25T23:00:00.000Z')
    ], week(2026, 10, 19), { tz: TZ });
    expect(w43.buckets).toHaveLength(7);
    expect(w43.buckets[6]).toMatchObject({ start: { y: 2026, m: 10, d: 25 }, totalMs: 0.5 * H });

    const w44 = summarizePeriod(tt, [
      entry('sat', 'p2', '2026-10-31T21:00:00.000Z', '2026-11-01T01:00:00.000Z'), // Sat 31 Oct 22:00 CET
      entry('sun', 'p2', '2026-11-01T09:00:00.000Z', '2026-11-01T10:00:00.000Z')
    ], week(2026, 10, 26), { tz: TZ });
    expect(w44.buckets.map((b) => b.start.d)).toEqual([26, 27, 28, 29, 30, 31, 1]);
    expect(w44.buckets[5].totalMs).toBe(4 * H);
    expect(w44.buckets[6].totalMs).toBe(H);
  });
});

describe('year period', () => {
  const year = (y) => periodOf('year', { y, m: 6, d: 15 });

  test('a year runs 1 January to 31 December and is labelled with its number', () => {
    expect(year(2026)).toEqual({ kind: 'year', start: { y: 2026, m: 1, d: 1 }, end: { y: 2026, m: 12, d: 31 } });
    expect(periodLabel(year(2026))).toBe('2026');
  });

  test('the current year is the year of now in the user timezone', () => {
    const now = Date.parse('2026-12-31T23:30:00.000Z'); // already 1 Jan 2027 in Berlin
    expect(currentPeriod('year', now, TZ)).toEqual(year(2027));
    expect(currentPeriod('year', now, 'UTC')).toEqual(year(2026));
  });

  test('shifting a year steps one calendar year', () => {
    expect(shiftPeriod(year(2026), 1)).toEqual(year(2027));
    expect(shiftPeriod(year(2026), -1)).toEqual(year(2025));
    expect(shiftPeriod(year(2028), 0)).toEqual(year(2028));
  });

  test('one bucket per month, entries attributed by start in the user timezone', () => {
    const s = summarizePeriod(tt, [
      entry('jan', 'p1', '2026-01-05T07:00:00.000Z', '2026-01-05T09:00:00.000Z'),
      entry('oct', 'p3', '2026-10-31T21:00:00.000Z', '2026-11-01T01:00:00.000Z'), // 31 Oct 22:00 CET → October
      entry('new-year', 'p1', '2026-12-31T23:30:00.000Z', '2027-01-01T00:30:00.000Z'), // 1 Jan 2027 00:30 CET
      entry('prev-year', 'p1', '2025-12-31T12:00:00.000Z', '2025-12-31T13:00:00.000Z')
    ], year(2026), { tz: TZ });
    expect(s.label).toBe('2026');
    expect(s.buckets.map((b) => b.start)).toEqual(Array.from({ length: 12 }, (_, i) => ({ y: 2026, m: i + 1, d: 1 })));
    expect(s.buckets[0]).toEqual({ start: { y: 2026, m: 1, d: 1 }, totalMs: 2 * H, byProject: { p1: 2 * H } });
    expect(s.buckets[9]).toEqual({ start: { y: 2026, m: 10, d: 1 }, totalMs: 4 * H, byProject: { p3: 4 * H } });
    expect(s.buckets[10].totalMs).toBe(0);
    expect(s.buckets[11].totalMs).toBe(0);
    expect(s).toMatchObject({ totalMs: 6 * H, entryCount: 2, projectCount: 2 });
    expect(s.customers.map((c) => [c.name, c.totalMs])).toEqual([['Globex', 4 * H], ['Acme', 2 * H]]);
  });
});

describe('Target and Balance', () => {
  const NOW = Date.parse('2026-11-16T10:00:00.000Z');
  const oct1 = entry('oct1', 'p1', '2026-10-01T07:00:00.000Z', '2026-10-01T15:00:00.000Z');
  const oct20 = entry('oct20', 'p3', '2026-10-20T07:00:00.000Z', '2026-10-20T09:00:00.000Z');
  const withEntries = { ...tt, timeEntries: [oct1, oct20] };

  test('stay null when Weekly hours are unset', () => {
    for (const kind of ['week', 'month', 'year']) {
      const s = summarizePeriod(withEntries, withEntries.timeEntries, periodOf(kind, { y: 2026, m: 10, d: 12 }), { tz: TZ, now: NOW });
      expect(s).toMatchObject({ target: null, balance: null });
    }
  });

  test('a finished month at 40h has the full Target and Balance = logged − Target', () => {
    const s = summarizePeriod(withEntries, withEntries.timeEntries, OCT, { tz: TZ, now: NOW, weeklyHours: 40 });
    expect(s.target).toBe(Math.round((40 * H * 31) / 7));
    expect(s.balance).toBe(10 * H - s.target);
  });

  test.each([
    ['28-day February 2026', 2026, 2, '160:00'],
    ['29-day February 2028', 2028, 2, '165:43'],
    ['30-day November 2026', 2026, 11, '171:26'],
    ['31-day October 2026', 2026, 10, '177:09']
  ])('a finished %s at 40h has a Target of %s', (_, y, m, expected) => {
    const data = { ...tt, timeEntries: [entry('first', 'p1', `${y - 1}-06-01T08:00:00.000Z`, `${y - 1}-06-01T09:00:00.000Z`)] };
    const s = summarizePeriod(data, [], month(y, m), { tz: TZ, now: Date.parse(`${y + 1}-01-15T10:00:00Z`), weeklyHours: 40 });
    expect(formatDuration(s.target, 'hm')).toBe(expected);
    expect(s.balance).toBe(-s.target);
  });

  test('a finished week at 40h has a Target of exactly 40h', () => {
    const week = periodOf('week', { y: 2026, m: 10, d: 20 });
    const s = summarizePeriod(withEntries, withEntries.timeEntries, week, { tz: TZ, now: NOW, weeklyHours: 40 });
    expect(s).toMatchObject({ target: 40 * H, balance: 2 * H - 40 * H });
  });

  test('the Target starts at the first-ever Time Entry even when only some entries are summarised', () => {
    const s = summarizePeriod(withEntries, [oct20], OCT, { tz: TZ, now: NOW, weeklyHours: 40 });
    expect(s.target).toBe(Math.round((40 * H * 31) / 7));
    expect(s.totalMs).toBe(2 * H);
  });

  test('future periods and periods before the first entry have no Target', () => {
    const options = { tz: TZ, now: NOW, weeklyHours: 40 };
    expect(summarizePeriod(withEntries, withEntries.timeEntries, month(2026, 12), options)).toMatchObject({ target: null, balance: null });
    expect(summarizePeriod(withEntries, withEntries.timeEntries, month(2026, 9), options)).toMatchObject({ target: null, balance: null });
  });

  describe('year Target', () => {
    const allYear = (y) => ({ ...tt, timeEntries: [entry('first', 'p1', `${y - 1}-06-01T08:00:00.000Z`, `${y - 1}-06-01T09:00:00.000Z`)] });
    const yearOf = (y) => periodOf('year', { y, m: 1, d: 1 });

    test('a finished 2026 at 40h is 2085h 43m', () => {
      const data = allYear(2026);
      const s = summarizePeriod(data, [], yearOf(2026), { tz: TZ, now: Date.parse('2027-02-01T10:00:00Z'), weeklyHours: 40 });
      expect(formatDuration(s.target, 'hm')).toBe('2085:43');
      expect(s.balance).toBe(-s.target);
    });

    test.each([
      ['non-leap 2026', 2026, 40],
      ['leap 2028', 2028, 40],
      ['non-leap 2027 with decimal hours', 2027, 38.5],
      ['leap 2024 with odd hours', 2024, 37.3]
    ])('the month Targets of %s add up exactly to the year Target', (_, y, weeklyHours) => {
      const data = allYear(y);
      const options = { tz: TZ, now: Date.parse(`${y + 1}-03-01T10:00:00Z`), weeklyHours };
      const yearTarget = summarizePeriod(data, [], yearOf(y), options).target;
      const monthTargets = Array.from({ length: 12 }, (_, i) => summarizePeriod(data, [], month(y, i + 1), options).target);
      expect(monthTargets.reduce((a, b) => a + b, 0)).toBe(yearTarget);
      expect(Math.abs(yearTarget - (weeklyHours * H * (y % 4 === 0 ? 366 : 365)) / 7)).toBeLessThanOrEqual(1);
    });

    test('the current year counts "so far", including today', () => {
      const data = allYear(2026);
      // Thu 12 Nov 2026 in Berlin: 1 Jan – 12 Nov = 316 days
      const s = summarizePeriod(data, [], yearOf(2026), { tz: TZ, now: Date.parse('2026-11-12T10:00:00Z'), weeklyHours: 35 });
      expect(s.target).toBe(316 * 5 * H);
    });

    test('a year counts from the first-ever entry when that falls mid-year', () => {
      const data = { ...tt, timeEntries: [entry('first', 'p1', '2026-11-01T23:30:00.000Z', '2026-11-02T01:00:00.000Z')] }; // Mon 2 Nov 00:30 CET
      const s = summarizePeriod(data, data.timeEntries, yearOf(2026), { tz: TZ, now: Date.parse('2027-01-05T10:00:00Z'), weeklyHours: 35 });
      expect(s.target).toBe(60 * 5 * H); // 2 Nov – 31 Dec
      expect(s.balance).toBe(1.5 * H - 60 * 5 * H);
    });

    test('the Balance resets on 1 January: a new year counts only its own days and entries', () => {
      const data = { ...tt, timeEntries: [entry('old', 'p1', '2026-03-02T08:00:00.000Z', '2026-03-02T18:00:00.000Z')] };
      const s = summarizePeriod(data, data.timeEntries, yearOf(2027), { tz: TZ, now: Date.parse('2027-01-02T10:00:00Z'), weeklyHours: 35 });
      expect(s).toMatchObject({ totalMs: 0, target: 2 * 5 * H, balance: -2 * 5 * H });
    });

    test('future years and years before the first entry have no Target', () => {
      const data = allYear(2026);
      const options = { tz: TZ, now: Date.parse('2026-11-12T10:00:00Z'), weeklyHours: 40 };
      expect(summarizePeriod(data, [], yearOf(2027), options)).toMatchObject({ target: null, balance: null });
      expect(summarizePeriod(data, [], yearOf(2024), options)).toMatchObject({ target: null, balance: null });
    });
  });
});
