import { describe, test, expect } from 'vitest';
import { groupEntriesByDay } from '../../../src/modules/timetracking-time.js';

const prefs = { tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.parse('2026-11-03T10:00:00Z') };
const H = 3600000;

function entry(id, start, end) {
  return { id, projectId: 'p1', description: '', start, end };
}

describe('groupEntriesByDay', () => {
  test('an entry 31st 22:00 → 1st 02:00 appears wholly under the 31st (Attribution)', () => {
    const groups = groupEntriesByDay([
      entry('overnight', '2026-10-31T21:00:00.000Z', '2026-11-01T01:00:00.000Z')
    ], prefs);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '2026-10-31', totalMs: 4 * H });
    expect(groups[0].entries.map((e) => e.id)).toEqual(['overnight']);
  });

  test('day is taken from the start in the user timezone, not UTC', () => {
    const groups = groupEntriesByDay([entry('late', '2026-10-28T23:30:00.000Z', '2026-10-29T00:30:00.000Z')], prefs);
    expect(groups[0].key).toBe('2026-10-29');
  });

  test('days are newest first, entries within a day newest first, totals per day', () => {
    const groups = groupEntriesByDay([
      entry('a', '2026-10-30T08:00:00.000Z', '2026-10-30T09:00:00.000Z'),
      entry('b', '2026-11-02T08:00:00.000Z', '2026-11-02T08:30:00.000Z'),
      entry('c', '2026-10-30T12:00:00.000Z', '2026-10-30T14:30:00.000Z')
    ], prefs);
    expect(groups.map((g) => g.key)).toEqual(['2026-11-02', '2026-10-30']);
    expect(groups[1].entries.map((e) => e.id)).toEqual(['c', 'a']);
    expect(groups.map((g) => g.totalMs)).toEqual([0.5 * H, 3.5 * H]);
  });

  test('headings are Today, Yesterday, then Ddd, <date>', () => {
    const groups = groupEntriesByDay([
      entry('today', '2026-11-03T08:00:00.000Z', '2026-11-03T09:00:00.000Z'),
      entry('yesterday', '2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z'),
      entry('older', '2026-10-31T08:00:00.000Z', '2026-10-31T09:00:00.000Z')
    ], prefs);
    expect(groups.map((g) => g.heading)).toEqual(['Today', 'Yesterday', 'Sat, 31.10.2026']);
  });

  test('Today follows the user timezone', () => {
    const lateUtc = { ...prefs, now: Date.parse('2026-11-02T23:30:00Z') };
    const groups = groupEntriesByDay([entry('x', '2026-11-02T23:10:00.000Z', '2026-11-02T23:20:00.000Z')], lateUtc);
    expect(groups[0].heading).toBe('Today');
  });

  test('no entries → no groups', () => {
    expect(groupEntriesByDay([], prefs)).toEqual([]);
  });
});
