import { describe, test, expect } from 'vitest';
import { summarizeWeekStrip } from '../../../src/modules/timetracking-week-strip.js';

const TZ = 'Europe/Berlin';
const H = 3600000;
const M = 60000;
const entry = (id, start, end, projectId = 'p1') => ({ id, projectId, description: '', start, end });
const at = (iso) => Date.parse(iso);
const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false, weeklyHours: 40, workdays: [1, 2, 3, 4, 5] };
const GLOBEX = { id: 'c2', name: 'Globex', color: '#111111', archived: false, weeklyHours: null, workdays: [1, 2, 3, 4, 5] };
const PROJECTS = [
  { id: 'p1', customerId: 'c1', name: 'Website', color: '#000000', archived: false },
  { id: 'p2', customerId: 'c2', name: 'Support', color: '#000000', archived: false }
];
const ttOf = (timeEntries, customers = [ACME, GLOBEX]) => ({ customers, projects: PROJECTS, timeEntries });

// Thursday 12 Nov 2026, 12:00 Berlin
const NOW = at('2026-11-12T11:00:00.000Z');

describe('week strip summary', () => {
  test('labels the ISO week with its spaced date range', () => {
    expect(summarizeWeekStrip(ttOf([]), NOW, { tz: TZ }).label).toBe('Week 46 · 9 – 15 Nov 2026');
  });

  test('labels a week spanning two months or two years with both', () => {
    expect(summarizeWeekStrip(ttOf([]), at('2026-10-01T10:00:00Z'), { tz: TZ }).label).toBe('Week 40 · 28 Sep – 4 Oct 2026');
    expect(summarizeWeekStrip(ttOf([]), at('2026-01-01T10:00:00Z'), { tz: TZ }).label).toBe('Week 1 · 29 Dec 2025 – 4 Jan 2026');
  });

  test('gives seven days Monday to Sunday with weekday, date, today and future flags', () => {
    const { days } = summarizeWeekStrip(ttOf([]), NOW, { tz: TZ });
    expect(days.map((d) => `${d.weekday} ${d.date}`)).toEqual(['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13', 'Sat 14', 'Sun 15']);
    expect(days.map((d) => d.isToday)).toEqual([false, false, false, true, false, false, false]);
    expect(days.map((d) => d.isFuture)).toEqual([false, false, false, false, true, true, true]);
    expect(days[0].key).toBe('2026-11-09');
  });

  test('attributes each entry wholly to the day of its start and totals the week', () => {
    const entries = [
      entry('mon', '2026-11-09T08:00:00Z', '2026-11-09T10:00:00Z'),
      entry('late-tue', '2026-11-10T22:00:00Z', '2026-11-11T01:00:00Z'), // 23:00 Tue → 02:00 Wed Berlin
      entry('last-week', '2026-11-06T08:00:00Z', '2026-11-06T09:00:00Z')
    ];
    const strip = summarizeWeekStrip(ttOf(entries), NOW, { tz: TZ });
    expect(strip.days.map((d) => d.loggedMs)).toEqual([2 * H, 3 * H, 0, 0, 0, 0, 0]);
    expect(strip.loggedMs).toBe(5 * H);
  });

  test('has no Target or Balance without a Default customer', () => {
    const strip = summarizeWeekStrip(ttOf([entry('mon', '2026-11-09T08:00:00Z', '2026-11-09T10:00:00Z')]), NOW, { tz: TZ });
    expect(strip.hasTarget).toBe(false);
    expect(strip.balanceMs).toBeNull();
    expect(strip.days.every((d) => d.targetMs === null)).toBe(true);
  });

  test('has no Target or Balance when the Default customer has no Weekly hours', () => {
    const strip = summarizeWeekStrip(ttOf([entry('mon', '2026-11-09T08:00:00Z', '2026-11-09T10:00:00Z', 'p2')]), NOW, { tz: TZ, customerId: 'c2' });
    expect(strip.hasTarget).toBe(false);
    expect(strip.balanceMs).toBeNull();
  });

  test("gives each counted day the Default customer's Target and the week its Balance at 40h over Mon–Fri", () => {
    const entries = [
      entry('mon', '2026-11-09T07:00:00Z', '2026-11-09T15:15:00Z'),
      entry('tue', '2026-11-10T07:00:00Z', '2026-11-10T11:00:00Z')
    ];
    const strip = summarizeWeekStrip(ttOf(entries), NOW, { tz: TZ, customerId: 'c1' });
    expect(strip.hasTarget).toBe(true);
    expect(strip.days.map((d) => d.targetMs)).toEqual([8 * H, 8 * H, 8 * H, 8 * H, null, null, null]);
    expect(strip.balanceMs).toBe(12 * H + 15 * M - 32 * H);
  });

  test("day totals count every Customer, while meters and Balance count only the Default customer's entries", () => {
    const entries = [
      entry('globex-mon', '2026-11-09T06:00:00Z', '2026-11-09T07:00:00Z', 'p2'),
      entry('acme-tue', '2026-11-10T07:00:00Z', '2026-11-10T11:00:00Z'),
      entry('globex-tue', '2026-11-10T12:00:00Z', '2026-11-10T14:00:00Z', 'p2')
    ];
    const strip = summarizeWeekStrip(ttOf(entries), NOW, { tz: TZ, customerId: 'c1' });
    expect(strip.days.map((d) => d.loggedMs).slice(0, 4)).toEqual([1 * H, 6 * H, 0, 0]);
    expect(strip.loggedMs).toBe(7 * H);
    expect(strip.days.map((d) => d.balanceLoggedMs).slice(0, 4)).toEqual([0, 4 * H, 0, 0]);
    // Acme's first entry is Tuesday: Tue–Thu = 24h Target, 4h logged.
    expect(strip.days.map((d) => d.targetMs).slice(0, 4)).toEqual([null, 8 * H, 8 * H, 8 * H]);
    expect(strip.balanceMs).toBe(4 * H - 24 * H);
  });

  test('a Default customer without a Work week has no Target, meters or Balance', () => {
    const entries = [entry('mon', '2026-11-09T08:00:00Z', '2026-11-09T10:00:00Z', 'p2')];
    const strip = summarizeWeekStrip(ttOf(entries), NOW, { tz: TZ, customerId: 'c2' });
    expect(strip.hasTarget).toBe(false);
    expect(strip.balanceMs).toBeNull();
    expect(strip.days.every((d) => d.targetMs === null)).toBe(true);
  });
});
