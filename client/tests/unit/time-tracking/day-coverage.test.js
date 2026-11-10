import { describe, test, expect } from 'vitest';
import { dayCoverage } from '../../../src/modules/timetracking-coverage.js';

// 2026-11-03 is CET (UTC+1): 10:00Z is 11:00 in Berlin.
const prefs = { tz: 'Europe/Berlin', now: Date.parse('2026-11-03T10:00:00Z') };
const COLORS = { p1: '#03a9f4', p2: '#8bc34a' };
const colorOf = (entry) => COLORS[entry.projectId];
const entry = (start, end, projectId = 'p1') => ({ id: start, projectId, description: '', start, end });
const at = (hh, mm = 0) => hh * 60 + mm;

describe('dayCoverage', () => {
  test('spans 07:00–19:00 with one block per entry in its project colour', () => {
    const coverage = dayCoverage([
      entry('2026-11-02T08:00:00Z', '2026-11-02T09:30:00Z', 'p2'),
      entry('2026-11-02T13:15:00Z', '2026-11-02T14:00:00Z')
    ], prefs, colorOf);
    expect(coverage.startMinutes).toBe(at(7));
    expect(coverage.endMinutes).toBe(at(19));
    expect(coverage.blocks).toEqual([
      { startMinutes: at(9), endMinutes: at(10, 30), color: '#8bc34a' },
      { startMinutes: at(14, 15), endMinutes: at(15), color: '#03a9f4' }
    ]);
  });

  test('widens to the hour before an entry that starts before 07:00', () => {
    const coverage = dayCoverage([entry('2026-11-02T04:30:00Z', '2026-11-02T06:30:00Z')], prefs, colorOf);
    expect(coverage.startMinutes).toBe(at(5));
    expect(coverage.endMinutes).toBe(at(19));
  });

  test('widens to the hour after an entry that ends after 19:00', () => {
    const coverage = dayCoverage([entry('2026-11-02T17:00:00Z', '2026-11-02T19:10:00Z')], prefs, colorOf);
    expect(coverage.startMinutes).toBe(at(7));
    expect(coverage.endMinutes).toBe(at(21));
  });

  test('an overnight entry widens the bar to midnight and its block stops there', () => {
    const coverage = dayCoverage([entry('2026-11-02T21:00:00Z', '2026-11-03T01:00:00Z')], prefs, colorOf);
    expect(coverage.endMinutes).toBe(at(24));
    expect(coverage.blocks[0]).toMatchObject({ startMinutes: at(22), endMinutes: at(24) });
  });

  test('has no now-marker on a past day', () => {
    const coverage = dayCoverage([entry('2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z')], prefs, colorOf);
    expect(coverage.nowMinutes).toBeNull();
  });

  test('marks now on today, widening the range to include it', () => {
    const morning = dayCoverage([entry('2026-11-03T07:00:00Z', '2026-11-03T08:00:00Z')], prefs, colorOf);
    expect(morning.nowMinutes).toBe(at(11));

    const lateNow = { ...prefs, now: Date.parse('2026-11-03T20:20:00Z') };
    const evening = dayCoverage([entry('2026-11-03T07:00:00Z', '2026-11-03T08:00:00Z')], lateNow, colorOf);
    expect(evening.nowMinutes).toBe(at(21, 20));
    expect(evening.endMinutes).toBe(at(22));
  });
});
