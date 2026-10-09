import { describe, test, expect, vi } from 'vitest';
import { fromZoned, zonedParts, formatTime, formatDate, formatDuration, timeTrackingPrefs } from '../../../src/modules/timetracking-time.js';

const BERLIN = 'Europe/Berlin';
const iso = (ms) => new Date(ms).toISOString();

describe('fromZoned: wall-clock date + time in a timezone → absolute instant', () => {
  test('winter (CET, UTC+1) and summer (CEST, UTC+2)', () => {
    expect(iso(fromZoned({ y: 2026, m: 1, d: 15 }, 9 * 60, BERLIN))).toBe('2026-01-15T08:00:00.000Z');
    expect(iso(fromZoned({ y: 2026, m: 7, d: 1 }, 9 * 60, BERLIN))).toBe('2026-07-01T07:00:00.000Z');
  });

  test('other zones resolve their own offsets', () => {
    expect(iso(fromZoned({ y: 2026, m: 7, d: 1 }, 9 * 60, 'America/New_York'))).toBe('2026-07-01T13:00:00.000Z');
    expect(iso(fromZoned({ y: 2026, m: 7, d: 1 }, 9 * 60, 'UTC'))).toBe('2026-07-01T09:00:00.000Z');
  });

  test('either side of the spring-forward change (Berlin 2026-03-29 02:00 → 03:00)', () => {
    expect(iso(fromZoned({ y: 2026, m: 3, d: 29 }, 1 * 60 + 59, BERLIN))).toBe('2026-03-29T00:59:00.000Z');
    expect(iso(fromZoned({ y: 2026, m: 3, d: 29 }, 3 * 60, BERLIN))).toBe('2026-03-29T01:00:00.000Z');
  });

  test('a skipped local time moves forward by the gap (02:30 → 03:30 CEST)', () => {
    expect(iso(fromZoned({ y: 2026, m: 3, d: 29 }, 2 * 60 + 30, BERLIN))).toBe('2026-03-29T01:30:00.000Z');
  });

  test('either side of the fall-back change (Berlin 2026-10-25 03:00 → 02:00)', () => {
    expect(iso(fromZoned({ y: 2026, m: 10, d: 25 }, 1 * 60 + 30, BERLIN))).toBe('2026-10-24T23:30:00.000Z');
    expect(iso(fromZoned({ y: 2026, m: 10, d: 25 }, 3 * 60 + 30, BERLIN))).toBe('2026-10-25T02:30:00.000Z');
  });

  test('a repeated local time resolves to its first occurrence (02:30 CEST)', () => {
    expect(iso(fromZoned({ y: 2026, m: 10, d: 25 }, 2 * 60 + 30, BERLIN))).toBe('2026-10-25T00:30:00.000Z');
  });

  test('round-trips through zonedParts', () => {
    const ms = fromZoned({ y: 2026, m: 10, d: 31 }, 22 * 60, BERLIN);
    expect(zonedParts(ms, BERLIN)).toEqual({ y: 2026, m: 10, d: 31, minutes: 22 * 60 });
  });
});

describe('timeTrackingPrefs (defaults until Settings exist)', () => {
  test('DD.MM.YYYY, 24-hour, browser timezone', () => {
    expect(timeTrackingPrefs(123)).toEqual({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      now: 123
    });
  });

  test('falls back to Europe/Berlin when the browser reports no timezone', () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: undefined });
    expect(timeTrackingPrefs().tz).toBe('Europe/Berlin');
    spy.mockRestore();
  });
});

describe('formatting with default display formats', () => {
  const prefs = { tz: BERLIN, dateFormat: 'DD.MM.YYYY', timeFormat: '24h' };
  const ms = Date.parse('2026-10-08T07:05:00Z');

  test('time is 24-hour HH:mm in the user timezone', () => {
    expect(formatTime(ms, prefs)).toBe('09:05');
  });

  test('time supports 12-hour format', () => {
    expect(formatTime(Date.parse('2026-10-08T12:30:00Z'), { ...prefs, timeFormat: '12h' })).toBe('2:30 PM');
    expect(formatTime(Date.parse('2026-10-07T22:00:00Z'), { ...prefs, timeFormat: '12h' })).toBe('12:00 AM');
  });

  test('date follows the configured date format in the user timezone', () => {
    expect(formatDate(ms, prefs)).toBe('08.10.2026');
    expect(formatDate(ms, { ...prefs, dateFormat: 'MM/DD/YYYY' })).toBe('10/08/2026');
    expect(formatDate(ms, { ...prefs, dateFormat: 'YYYY-MM-DD' })).toBe('2026-10-08');
    expect(formatDate(Date.parse('2026-10-08T22:30:00Z'), prefs)).toBe('09.10.2026');
  });

  test('duration is h:mm', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(90 * 60000)).toBe('1:30');
    expect(formatDuration(25 * 60 * 60000 + 5 * 60000)).toBe('25:05');
  });
});
