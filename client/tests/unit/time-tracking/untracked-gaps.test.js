import { describe, test, expect } from 'vitest';
import { untrackedGaps } from '../../../src/modules/timetracking-gaps.js';

// 2026-11-02 is CET (UTC+1): 08:00Z is 09:00 in Berlin.
const TZ = 'Europe/Berlin';
const entry = (start, end) => ({ id: start, projectId: 'p1', description: '', start, end });
const gap = (dayKey, start, end) => ({ dayKey, startMs: Date.parse(start), endMs: Date.parse(end) });

describe('untrackedGaps', () => {
  test('finds the one span between two entries that no entry covers', () => {
    const gaps = untrackedGaps([
      entry('2026-11-02T08:00:00Z', '2026-11-02T09:30:00Z'),
      entry('2026-11-02T09:45:00Z', '2026-11-02T11:45:00Z')
    ], TZ);
    expect(gaps).toEqual([gap('2026-11-02', '2026-11-02T09:30:00Z', '2026-11-02T09:45:00Z')]);
  });

  test('overlapping entries merge, leaving no gap between them', () => {
    expect(untrackedGaps([
      entry('2026-11-02T08:00:00Z', '2026-11-02T10:00:00Z'),
      entry('2026-11-02T09:00:00Z', '2026-11-02T11:00:00Z')
    ], TZ)).toEqual([]);
  });

  test('an entry inside a longer one does not end the covered span early', () => {
    expect(untrackedGaps([
      entry('2026-11-02T08:00:00Z', '2026-11-02T12:00:00Z'),
      entry('2026-11-02T09:00:00Z', '2026-11-02T09:30:00Z'),
      entry('2026-11-02T11:00:00Z', '2026-11-02T13:00:00Z')
    ], TZ)).toEqual([]);
  });

  test('a 4-minute gap is dropped; a 5-minute gap is kept', () => {
    const gaps = untrackedGaps([
      entry('2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z'),
      entry('2026-11-02T09:04:00Z', '2026-11-02T10:00:00Z'),
      entry('2026-11-02T10:05:00Z', '2026-11-02T11:00:00Z')
    ], TZ);
    expect(gaps).toEqual([gap('2026-11-02', '2026-11-02T10:00:00Z', '2026-11-02T10:05:00Z')]);
  });

  test('an entry crossing midnight covers its start day up to midnight and adds nothing to the next day', () => {
    // 22:00 → 02:00 Berlin, then 23:30 is already covered; next day starts 08:00 Berlin.
    const gaps = untrackedGaps([
      entry('2026-11-02T18:00:00Z', '2026-11-02T20:00:00Z'), // 19:00–21:00
      entry('2026-11-02T21:00:00Z', '2026-11-03T01:00:00Z'), // 22:00–02:00 (+1)
      entry('2026-11-03T07:00:00Z', '2026-11-03T08:00:00Z'), // 08:00–09:00
      entry('2026-11-03T09:00:00Z', '2026-11-03T10:00:00Z') // 10:00–11:00
    ], TZ);
    expect(gaps).toEqual([
      gap('2026-11-02', '2026-11-02T20:00:00Z', '2026-11-02T21:00:00Z'),
      gap('2026-11-03', '2026-11-03T08:00:00Z', '2026-11-03T09:00:00Z')
    ]);
  });

  test('the next day gets no gap from midnight to its first entry', () => {
    const gaps = untrackedGaps([
      entry('2026-11-02T21:00:00Z', '2026-11-03T01:00:00Z'),
      entry('2026-11-03T07:00:00Z', '2026-11-03T08:00:00Z')
    ], TZ);
    expect(gaps).toEqual([]);
  });

  test('a single-entry day and an empty day have no gaps', () => {
    expect(untrackedGaps([entry('2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z')], TZ)).toEqual([]);
    expect(untrackedGaps([], TZ)).toEqual([]);
  });

  test('gaps never span from one day into another', () => {
    const gaps = untrackedGaps([
      entry('2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z'),
      entry('2026-11-03T08:00:00Z', '2026-11-03T09:00:00Z')
    ], TZ);
    expect(gaps).toEqual([]);
  });
});
