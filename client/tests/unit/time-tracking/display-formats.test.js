import { describe, test, expect } from 'vitest';
import { formatDuration, resolveLinkedFields, describeEntryTimes } from '../../../src/modules/timetracking-time.js';

const prefs = { tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', durationFormat: 'h:mm', now: Date.parse('2026-10-08T10:00:00Z') };
const fields = (overrides = {}) => ({ date: '08.10.2026', start: '09:00', end: '09:00', duration: '0:00', ...overrides });

describe('duration format', () => {
  test('h:mm is the default', () => {
    expect(formatDuration(7.5 * 3600000)).toBe('7:30');
    expect(formatDuration(7.5 * 3600000, 'h:mm')).toBe('7:30');
  });

  test('decimal shows hours with two decimals and an h unit', () => {
    expect(formatDuration(7.5 * 3600000, 'decimal')).toBe('7.50 h');
    expect(formatDuration(0, 'decimal')).toBe('0.00 h');
    expect(formatDuration(20 * 60000, 'decimal')).toBe('0.33 h');
  });

  test('decimal still accepts h:mm input and displays it as decimal', () => {
    const decimal = { ...prefs, durationFormat: 'decimal' };
    const r = resolveLinkedFields(fields({ duration: '7:30' }), 'duration', decimal);
    expect(r.values.duration).toBe('7.50 h');
    expect(r.values.end).toBe('16:30');
  });

  test('a displayed decimal duration parses back to the same span', () => {
    const decimal = { ...prefs, durationFormat: 'decimal' };
    const r = resolveLinkedFields(fields({ duration: '1.25 h' }), 'duration', decimal);
    expect(r.values.end).toBe('10:15');
  });
});

describe('time format', () => {
  test('12-hour displays 2:30 PM and still accepts 24-hour shorthand', () => {
    const twelve = { ...prefs, timeFormat: '12h' };
    const r = resolveLinkedFields(fields({ start: '1430', end: '16:00' }), 'end', twelve);
    expect(r.values.start).toBe('2:30 PM');
    expect(r.values.end).toBe('4:00 PM');
    expect(r.values.duration).toBe('1:30');
  });

  test('a displayed 12-hour time parses back', () => {
    const twelve = { ...prefs, timeFormat: '12h' };
    const r = resolveLinkedFields(fields({ start: '2:30 PM', end: '4:00 PM' }), 'end', twelve);
    expect(r.values.duration).toBe('1:30');
  });
});

describe('describeEntryTimes follows every display setting', () => {
  test('date, time and duration', () => {
    const start = Date.parse('2026-10-08T12:30:00Z');
    const r = describeEntryTimes(start, start + 7.5 * 3600000, {
      ...prefs, dateFormat: 'YYYY-MM-DD', timeFormat: '12h', durationFormat: 'decimal'
    });
    expect(r.values).toEqual({ date: '2026-10-08', start: '2:30 PM', end: '10:00 PM', duration: '7.50 h' });
  });
});
