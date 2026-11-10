import { describe, test, expect } from 'vitest';
import { summarizeWeekStrip } from '../../../src/modules/timetracking-week-strip.js';

const TZ = 'Europe/Berlin';
const H = 3600000;
const M = 60000;
const entry = (id, start, end) => ({ id, projectId: 'p1', description: '', start, end });
const at = (iso) => Date.parse(iso);

// Thursday 12 Nov 2026, 12:00 Berlin
const NOW = at('2026-11-12T11:00:00.000Z');

describe('week strip summary', () => {
  test('labels the ISO week with its spaced date range', () => {
    expect(summarizeWeekStrip([], NOW, { tz: TZ }).label).toBe('Week 46 · 9 – 15 Nov 2026');
  });

  test('labels a week spanning two months or two years with both', () => {
    expect(summarizeWeekStrip([], at('2026-10-01T10:00:00Z'), { tz: TZ }).label).toBe('Week 40 · 28 Sep – 4 Oct 2026');
    expect(summarizeWeekStrip([], at('2026-01-01T10:00:00Z'), { tz: TZ }).label).toBe('Week 1 · 29 Dec 2025 – 4 Jan 2026');
  });

  test('gives seven days Monday to Sunday with weekday, date, today and future flags', () => {
    const { days } = summarizeWeekStrip([], NOW, { tz: TZ });
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
    const strip = summarizeWeekStrip(entries, NOW, { tz: TZ });
    expect(strip.days.map((d) => d.loggedMs)).toEqual([2 * H, 3 * H, 0, 0, 0, 0, 0]);
    expect(strip.loggedMs).toBe(5 * H);
  });

  test('has no Target or Balance while Weekly hours is unset', () => {
    const strip = summarizeWeekStrip([entry('mon', '2026-11-09T08:00:00Z', '2026-11-09T10:00:00Z')], NOW, { tz: TZ });
    expect(strip.balanceMs).toBeNull();
    expect(strip.days.every((d) => d.targetMs === null)).toBe(true);
  });

  test('gives each counted day its Target and the week its Balance at 40h over Mon–Fri', () => {
    const entries = [
      entry('mon', '2026-11-09T07:00:00Z', '2026-11-09T15:15:00Z'),
      entry('tue', '2026-11-10T07:00:00Z', '2026-11-10T11:00:00Z')
    ];
    const strip = summarizeWeekStrip(entries, NOW, { tz: TZ, weeklyHours: 40 });
    expect(strip.days.map((d) => d.targetMs)).toEqual([8 * H, 8 * H, 8 * H, 8 * H, null, null, null]);
    expect(strip.balanceMs).toBe(12 * H + 15 * M - 32 * H);
  });
});
