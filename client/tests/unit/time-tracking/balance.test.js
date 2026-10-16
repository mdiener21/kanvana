import { describe, test, expect } from 'vitest';
import { periodBalance, currentWeekRange, formatBalance } from '../../../src/modules/timetracking-balance.js';

const TZ = 'Europe/Berlin';
const H = 3600000;
// Week 42 of 2026: Monday 12 Oct – Sunday 18 Oct
const W42 = { start: { y: 2026, m: 10, d: 12 }, end: { y: 2026, m: 10, d: 18 } };
const at = (iso) => Date.parse(iso);

const entry = (id, start, hours) => ({
  id, projectId: 'p1', description: '', start, end: new Date(Date.parse(start) + hours * H).toISOString()
});

describe('periodBalance — Target', () => {
  test('a finished week has a Target of exactly the Weekly hours', () => {
    const entries = [entry('a', '2026-10-01T08:00:00.000Z', 8)];
    const result = periodBalance(entries, W42, { now: at('2026-10-20T10:00:00Z'), tz: TZ, weeklyHours: 40 });
    expect(result.targetMs).toBe(40 * H);
  });

  test('the current week counts "so far", including today', () => {
    const entries = [entry('a', '2026-10-01T08:00:00.000Z', 8)];
    // Thursday 15 Oct, 23:30 Berlin (21:30 UTC): Mon–Thu = 4 days
    const result = periodBalance(entries, W42, { now: at('2026-10-15T21:30:00Z'), tz: TZ, weeklyHours: 35 });
    expect(result.targetMs).toBe(20 * H);
  });

  test('the Target starts on the day of the first-ever Time Entry when that falls mid-week', () => {
    // First entry Wednesday 14 Oct 00:30 Berlin (13 Oct 22:30 UTC): Wed–Sun = 5 days
    const entries = [entry('later', '2026-10-16T08:00:00.000Z', 2), entry('first', '2026-10-13T22:30:00.000Z', 1)];
    const result = periodBalance(entries, W42, { now: at('2026-11-01T10:00:00Z'), tz: TZ, weeklyHours: 35 });
    expect(result.targetMs).toBe(25 * H);
  });

  test('a future week has no Target or Balance', () => {
    const entries = [entry('a', '2026-10-01T08:00:00.000Z', 8)];
    const result = periodBalance(entries, W42, { now: at('2026-10-11T21:59:00Z'), tz: TZ, weeklyHours: 40 });
    expect(result).toMatchObject({ targetMs: null, balanceMs: null });
  });

  test('a week entirely before the first-ever Time Entry has no Target or Balance', () => {
    const entries = [entry('a', '2026-10-18T22:00:00.000Z', 8)]; // Mon 19 Oct 00:00 Berlin
    const result = periodBalance(entries, W42, { now: at('2026-10-20T10:00:00Z'), tz: TZ, weeklyHours: 40 });
    expect(result).toMatchObject({ targetMs: null, balanceMs: null });
  });

  test('without any Time Entry there is no Target or Balance', () => {
    const result = periodBalance([], W42, { now: at('2026-10-20T10:00:00Z'), tz: TZ, weeklyHours: 40 });
    expect(result).toMatchObject({ loggedMs: 0, targetMs: null, balanceMs: null });
  });

  test.each([null, undefined])('unset Weekly hours (%s) gives no Target or Balance', (weeklyHours) => {
    const entries = [entry('a', '2026-10-13T08:00:00.000Z', 8)];
    const result = periodBalance(entries, W42, { now: at('2026-10-20T10:00:00Z'), tz: TZ, weeklyHours });
    expect(result).toEqual({ loggedMs: 8 * H, targetMs: null, balanceMs: null });
  });

  test('decimal Weekly hours spread evenly over the counted days', () => {
    const entries = [entry('a', '2026-10-01T08:00:00.000Z', 8)];
    const full = periodBalance(entries, W42, { now: at('2026-10-20T10:00:00Z'), tz: TZ, weeklyHours: 38.5 });
    expect(full.targetMs).toBe(38.5 * H);
    // Mon–Tue so far: 38.5 / 7 × 2 = 11h
    const soFar = periodBalance(entries, W42, { now: at('2026-10-13T10:00:00Z'), tz: TZ, weeklyHours: 38.5 });
    expect(soFar.targetMs).toBe(11 * H);
  });
});

describe('periodBalance — Balance', () => {
  test('Balance is logged minus Target, positive for a surplus', () => {
    const entries = ['12', '13', '14', '15', '16'].map((d) => entry(d, `2026-10-${d}T07:00:00.000Z`, 8.5));
    const result = periodBalance(entries, W42, { now: at('2026-10-20T10:00:00Z'), tz: TZ, weeklyHours: 40 });
    expect(result).toEqual({ loggedMs: 42.5 * H, targetMs: 40 * H, balanceMs: 2.5 * H });
  });

  test('Balance is negative for a deficit', () => {
    const entries = [entry('a', '2026-10-12T07:00:00.000Z', 3)];
    // Monday so far: 28 / 7 = 4h target
    const result = periodBalance(entries, W42, { now: at('2026-10-12T15:00:00Z'), tz: TZ, weeklyHours: 28 });
    expect(result.balanceMs).toBe(-1 * H);
  });

  test('entries count toward the week containing their start in the Time Tracking timezone', () => {
    const entries = [
      entry('sun-late', '2026-10-11T21:30:00.000Z', 3), // Sun 11 Oct 23:30 Berlin → previous week
      entry('mon-early', '2026-10-11T22:30:00.000Z', 2), // Mon 12 Oct 00:30 Berlin → W42
      entry('sun-night', '2026-10-18T21:00:00.000Z', 4) // Sun 18 Oct 23:00 Berlin → W42, ends next week
    ];
    const result = periodBalance(entries, W42, { now: at('2026-10-20T10:00:00Z'), tz: TZ, weeklyHours: 40 });
    expect(result.loggedMs).toBe(6 * H);
  });
});

describe('currentWeekRange — weeks start Monday in the Time Tracking timezone', () => {
  test.each([
    ['Sun 11 Oct 23:30 Berlin', '2026-10-11T21:30:00Z', TZ, { y: 2026, m: 10, d: 5 }, { y: 2026, m: 10, d: 11 }],
    ['Mon 12 Oct 00:30 Berlin', '2026-10-11T22:30:00Z', TZ, { y: 2026, m: 10, d: 12 }, { y: 2026, m: 10, d: 18 }],
    ['Sun 25 Oct 23:30 Berlin, after DST ended', '2026-10-25T22:30:00Z', TZ, { y: 2026, m: 10, d: 19 }, { y: 2026, m: 10, d: 25 }],
    ['Mon 26 Oct 00:30 Berlin, after DST ended', '2026-10-25T23:30:00Z', TZ, { y: 2026, m: 10, d: 26 }, { y: 2026, m: 11, d: 1 }],
    ['Sun 11 Oct 20:30 New York (already Monday in UTC)', '2026-10-12T00:30:00Z', 'America/New_York', { y: 2026, m: 10, d: 5 }, { y: 2026, m: 10, d: 11 }],
    ['Mon 2 Nov 00:30 New York, after DST ended', '2026-11-02T05:30:00Z', 'America/New_York', { y: 2026, m: 11, d: 2 }, { y: 2026, m: 11, d: 8 }],
    ['Thu 31 Dec 2026 across the year boundary', '2026-12-31T12:00:00Z', TZ, { y: 2026, m: 12, d: 28 }, { y: 2027, m: 1, d: 3 }]
  ])('%s', (_name, now, tz, start, end) => {
    expect(currentWeekRange(at(now), tz)).toEqual({ start, end });
  });

  test('a finished week containing a DST change still has a Target of exactly the Weekly hours', () => {
    const entries = [entry('a', '2026-10-01T08:00:00.000Z', 8)];
    const dstWeek = currentWeekRange(at('2026-10-22T10:00:00Z'), TZ);
    const result = periodBalance(entries, dstWeek, { now: at('2026-11-02T10:00:00Z'), tz: TZ, weeklyHours: 40 });
    expect(result.targetMs).toBe(40 * H);
  });
});

describe('formatBalance — signed, in the duration format', () => {
  test.each([
    [2.5 * H, 'h:mm', '+2:30'],
    [-1.25 * H, 'h:mm', '−1:15'],
    [0, 'h:mm', '+0:00'],
    [2.5 * H, 'decimal', '+2.50 h'],
    [-1.25 * H, 'decimal', '−1.25 h'],
    [-20 * 1000, 'h:mm', '+0:00']
  ])('%d ms as %s → %s', (ms, format, expected) => {
    expect(formatBalance(ms, format)).toBe(expected);
  });
});
