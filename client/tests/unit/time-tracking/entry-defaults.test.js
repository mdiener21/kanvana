import { describe, test, expect } from 'vitest';
import { newEntryTimes } from '../../../src/modules/timetracking-time.js';

const TZ = 'Europe/Berlin';
const at = (iso) => Date.parse(iso);
const entry = (start, end) => ({ id: start, projectId: 'p1', description: '', start, end });

// 15:20:40 Berlin on 2026-10-08 (UTC+2).
const NOW = at('2026-10-08T13:20:40.000Z');
const NOW_MINUTE = at('2026-10-08T13:20:00.000Z');

describe('newEntryTimes (Start continues from the last entry)', () => {
  test('Start = latest End today when it is earlier than now; End = now (floored to the minute)', () => {
    const times = newEntryTimes([
      entry('2026-10-08T07:00:00.000Z', '2026-10-08T09:00:00.000Z'),
      entry('2026-10-08T11:00:00.000Z', '2026-10-08T12:45:00.000Z'),
      entry('2026-10-08T09:30:00.000Z', '2026-10-08T10:00:00.000Z')
    ], NOW, TZ);
    expect(times).toEqual({ startMs: at('2026-10-08T12:45:00.000Z'), endMs: NOW_MINUTE });
  });

  test('no entry today → Start = End = now', () => {
    expect(newEntryTimes([], NOW, TZ)).toEqual({ startMs: NOW_MINUTE, endMs: NOW_MINUTE });
  });

  test('entries on other days are ignored', () => {
    const times = newEntryTimes([entry('2026-10-07T08:00:00.000Z', '2026-10-07T09:00:00.000Z')], NOW, TZ);
    expect(times).toEqual({ startMs: NOW_MINUTE, endMs: NOW_MINUTE });
  });

  test('today is the user timezone day of the entry start (Attribution), not the UTC day', () => {
    // 00:30 Berlin on the 8th is still the 7th in UTC.
    const times = newEntryTimes([entry('2026-10-07T22:30:00.000Z', '2026-10-07T23:15:00.000Z')], NOW, TZ);
    expect(times.startMs).toBe(at('2026-10-07T23:15:00.000Z'));
  });

  test('latest End today later than now → Start = End = now', () => {
    const times = newEntryTimes([
      entry('2026-10-08T08:00:00.000Z', '2026-10-08T09:00:00.000Z'),
      entry('2026-10-08T13:00:00.000Z', '2026-10-08T14:00:00.000Z')
    ], NOW, TZ);
    expect(times).toEqual({ startMs: NOW_MINUTE, endMs: NOW_MINUTE });
  });

  test('latest End equal to now (same minute) → Start = End = now', () => {
    const times = newEntryTimes([entry('2026-10-08T12:00:00.000Z', '2026-10-08T13:20:00.000Z')], NOW, TZ);
    expect(times).toEqual({ startMs: NOW_MINUTE, endMs: NOW_MINUTE });
  });
});
