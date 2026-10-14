import { describe, test, expect } from 'vitest';
import { parseTime, parseDuration, parseDate } from '../../../src/modules/timetracking-time.js';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-10-08T10:00:00Z');

describe('parseTime (spec shorthand table)', () => {
  test.each([
    ['9', 9 * 60],
    ['930', 9 * 60 + 30],
    ['1430', 14 * 60 + 30],
    ['14:30', 14 * 60 + 30],
    ['2:30pm', 14 * 60 + 30],
    ['2p', 14 * 60]
  ])('%s → minutes after midnight %i', (input, minutes) => {
    expect(parseTime(input)).toBe(minutes);
  });

  test.each([
    ['12a', 0],
    ['12p', 12 * 60],
    ['2:30 PM', 14 * 60 + 30],
    ['0', 0],
    ['23:59', 23 * 60 + 59]
  ])('also accepts %s', (input, minutes) => {
    expect(parseTime(input)).toBe(minutes);
  });

  test.each(['', 'abc', '24', '2460', '9:75', '13pm', '0am', '12345'])('rejects %j', (input) => {
    expect(parseTime(input)).toBeNull();
  });
});

describe('parseDuration (spec shorthand table)', () => {
  test.each([
    ['1:30', 90],
    ['1.5', 90],
    ['1,5', 90],
    ['90m', 90],
    ['1h30', 90],
    ['2h', 120]
  ])('%s → %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  test.each([
    ['0:00', 0],
    ['2', 120],
    ['1h30m', 90],
    ['45 min', 45],
    ['0.25', 15]
  ])('also accepts %s (bare number = hours)', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  test.each(['', 'abc', '1:75', '-1', 'h'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe('parseDate (per date format, year optional, t / y)', () => {
  const opts = { dateFormat: 'DD.MM.YYYY', tz: TZ, now: NOW };

  test.each([
    ['08.10.2026', { y: 2026, m: 10, d: 8 }],
    ['8.10.26', { y: 2026, m: 10, d: 8 }],
    ['8.10', { y: 2026, m: 10, d: 8 }],
    ['31.12', { y: 2026, m: 12, d: 31 }]
  ])('DD.MM.YYYY: %s', (input, ymd) => {
    expect(parseDate(input, opts)).toEqual(ymd);
  });

  test.each([
    ['t', { y: 2026, m: 10, d: 8 }],
    ['today', { y: 2026, m: 10, d: 8 }],
    ['y', { y: 2026, m: 10, d: 7 }],
    ['Yesterday', { y: 2026, m: 10, d: 7 }]
  ])('relative: %s', (input, ymd) => {
    expect(parseDate(input, opts)).toEqual(ymd);
  });

  test('today is the calendar day in the user timezone, not UTC', () => {
    const lateEvening = Date.parse('2026-10-08T22:30:00Z');
    expect(parseDate('t', { ...opts, now: lateEvening })).toEqual({ y: 2026, m: 10, d: 9 });
    expect(parseDate('y', { ...opts, now: lateEvening })).toEqual({ y: 2026, m: 10, d: 8 });
  });

  test('yesterday crosses month and year boundaries', () => {
    expect(parseDate('y', { ...opts, now: Date.parse('2027-01-01T10:00:00Z') })).toEqual({ y: 2026, m: 12, d: 31 });
  });

  test('MM/DD/YYYY and YYYY-MM-DD follow the configured format', () => {
    expect(parseDate('10/08/2026', { ...opts, dateFormat: 'MM/DD/YYYY' })).toEqual({ y: 2026, m: 10, d: 8 });
    expect(parseDate('10/8', { ...opts, dateFormat: 'MM/DD/YYYY' })).toEqual({ y: 2026, m: 10, d: 8 });
    expect(parseDate('2026-10-08', { ...opts, dateFormat: 'YYYY-MM-DD' })).toEqual({ y: 2026, m: 10, d: 8 });
    expect(parseDate('10-08', { ...opts, dateFormat: 'YYYY-MM-DD' })).toEqual({ y: 2026, m: 10, d: 8 });
  });

  test.each(['', 'x', '8', '31.02.2026', '0.10.2026', '8.13.2026'])('rejects %j', (input) => {
    expect(parseDate(input, opts)).toBeNull();
  });
});
