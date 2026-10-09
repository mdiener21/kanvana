import { describe, test, expect } from 'vitest';
import { resolveLinkedFields, adjustLinkedField } from '../../../src/modules/timetracking-time.js';

const prefs = { tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.parse('2026-10-08T10:00:00Z') };
const iso = (ms) => new Date(ms).toISOString();
const fields = (overrides = {}) => ({ date: '08.10.2026', start: '09:00', end: '09:00', duration: '0:00', ...overrides });

describe('resolveLinkedFields', () => {
  test('editing End recomputes Duration', () => {
    const r = resolveLinkedFields(fields({ end: '10:30' }), 'end', prefs);
    expect(r.values).toEqual({ date: '08.10.2026', start: '09:00', end: '10:30', duration: '1:30' });
    expect(iso(r.startMs)).toBe('2026-10-08T07:00:00.000Z');
    expect(iso(r.endMs)).toBe('2026-10-08T08:30:00.000Z');
    expect(r.plusDays).toBe(0);
  });

  test('editing Start recomputes Duration and keeps End', () => {
    const r = resolveLinkedFields(fields({ start: '8', end: '10:30', duration: '1:30' }), 'start', prefs);
    expect(r.values).toMatchObject({ start: '08:00', end: '10:30', duration: '2:30' });
  });

  test('editing Duration recomputes End = Start + Duration', () => {
    const r = resolveLinkedFields(fields({ end: '10:30', duration: '2h' }), 'duration', prefs);
    expect(r.values).toMatchObject({ start: '09:00', end: '11:00', duration: '2:00' });
  });

  test('an End earlier than Start means the next day', () => {
    const r = resolveLinkedFields(fields({ start: '22:00', end: '1' }), 'end', prefs);
    expect(r.values).toMatchObject({ start: '22:00', end: '01:00', duration: '3:00' });
    expect(r.plusDays).toBe(1);
    expect(iso(r.endMs)).toBe('2026-10-08T23:00:00.000Z');
  });

  test('a Duration that crosses midnight rolls End over to the next day', () => {
    const r = resolveLinkedFields(fields({ start: '22:00', duration: '3h' }), 'duration', prefs);
    expect(r.values).toMatchObject({ end: '01:00', duration: '3:00' });
    expect(r.plusDays).toBe(1);
  });

  test('End equal to Start is a zero duration, not a full day', () => {
    const r = resolveLinkedFields(fields(), 'end', prefs);
    expect(r.endMs - r.startMs).toBe(0);
    expect(r.values.duration).toBe('0:00');
  });

  test('changing the Date keeps the Duration and moves End with it', () => {
    const r = resolveLinkedFields(fields({ date: '7.10', end: '10:30', duration: '1:30' }), 'date', prefs);
    expect(r.values).toEqual({ date: '07.10.2026', start: '09:00', end: '10:30', duration: '1:30' });
    expect(iso(r.startMs)).toBe('2026-10-07T07:00:00.000Z');
  });

  test('normalises shorthand to the display format', () => {
    const r = resolveLinkedFields(fields({ date: 'y', start: '930', end: '2:30pm' }), 'end', prefs);
    expect(r.values).toEqual({ date: '07.10.2026', start: '09:30', end: '14:30', duration: '5:00' });
  });

  test.each([
    ['date', { date: '31.02' }],
    ['start', { start: 'soon' }],
    ['end', { end: '25:00' }],
    ['duration', { duration: 'long' }]
  ])('invalid %s → null', (changed, overrides) => {
    expect(resolveLinkedFields(fields(overrides), changed, prefs)).toBeNull();
  });

  describe('across DST changes (durations come from absolute instants)', () => {
    test('spring forward: 01:00 → 04:00 on 29.03.2026 is 2 hours', () => {
      const r = resolveLinkedFields(fields({ date: '29.03.2026', start: '01:00', end: '04:00' }), 'end', prefs);
      expect(r.endMs - r.startMs).toBe(2 * 3600000);
      expect(r.values.duration).toBe('2:00');
    });

    test('fall back: 01:00 → 04:00 on 25.10.2026 is 4 hours', () => {
      const r = resolveLinkedFields(fields({ date: '25.10.2026', start: '01:00', end: '04:00' }), 'end', prefs);
      expect(r.endMs - r.startMs).toBe(4 * 3600000);
      expect(r.values.duration).toBe('4:00');
    });

    test('a 3 h Duration from 01:00 on the spring-forward day ends at 05:00', () => {
      const r = resolveLinkedFields(fields({ date: '29.03.2026', start: '01:00', duration: '3h' }), 'duration', prefs);
      expect(r.values.end).toBe('05:00');
    });

    test('an overnight entry into the fall-back night counts the extra hour', () => {
      const r = resolveLinkedFields(fields({ date: '24.10.2026', start: '22:00', end: '06:00' }), 'end', prefs);
      expect(r.plusDays).toBe(1);
      expect(r.values.duration).toBe('9:00');
    });
  });
});

describe('adjustLinkedField (Alt+↑ / Alt+↓, ±15 min)', () => {
  const base = fields({ end: '10:00', duration: '1:00' });

  test('Start moves and Duration recomputes, End stays', () => {
    expect(adjustLinkedField(base, 'start', 15, prefs).values).toMatchObject({ start: '09:15', end: '10:00', duration: '0:45' });
    expect(adjustLinkedField(base, 'start', -15, prefs).values).toMatchObject({ start: '08:45', end: '10:00', duration: '1:15' });
  });

  test('End moves and Duration recomputes', () => {
    expect(adjustLinkedField(base, 'end', 15, prefs).values).toMatchObject({ end: '10:15', duration: '1:15' });
  });

  test('Duration moves and End recomputes', () => {
    expect(adjustLinkedField(base, 'duration', -15, prefs).values).toMatchObject({ end: '09:45', duration: '0:45' });
  });

  test('Duration never goes below zero', () => {
    expect(adjustLinkedField(fields(), 'duration', -15, prefs).values).toMatchObject({ end: '09:00', duration: '0:00' });
  });

  test('Start moved past midnight carries the Date along', () => {
    const r = adjustLinkedField(fields({ start: '00:00', end: '01:00', duration: '1:00' }), 'start', -15, prefs);
    expect(r.values).toMatchObject({ date: '07.10.2026', start: '23:45', end: '01:00', duration: '1:15' });
  });

  test('returns null when the current values do not parse', () => {
    expect(adjustLinkedField(fields({ start: 'x' }), 'start', 15, prefs)).toBeNull();
  });
});
