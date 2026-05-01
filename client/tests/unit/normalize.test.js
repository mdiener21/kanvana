import { test, expect } from 'vitest';
import {
  normalizePriority,
  isHexColor,
  normalizeHexColor,
  boardDisplayName,
  normalizeDueDate,
  normalizeActivityLog,
  normalizeStringKeys,
  normalizeSubTasks
} from '../../src/modules/normalize.js';
import { DEFAULT_COLUMN_COLOR } from '../../src/modules/constants.js';

// ── normalizePriority ───────────────────────────────────────────────

test('normalizePriority returns valid priorities unchanged', () => {
  expect(normalizePriority('urgent')).toBe('urgent');
  expect(normalizePriority('high')).toBe('high');
  expect(normalizePriority('medium')).toBe('medium');
  expect(normalizePriority('low')).toBe('low');
  expect(normalizePriority('none')).toBe('none');
});

test('normalizePriority is case-insensitive', () => {
  expect(normalizePriority('HIGH')).toBe('high');
  expect(normalizePriority('Urgent')).toBe('urgent');
  expect(normalizePriority('MEDIUM')).toBe('medium');
});

test('normalizePriority returns none for invalid input', () => {
  expect(normalizePriority('invalid')).toBe('none');
  expect(normalizePriority('')).toBe('none');
  expect(normalizePriority(null)).toBe('none');
  expect(normalizePriority(undefined)).toBe('none');
  expect(normalizePriority(42)).toBe('none');
});

test('normalizePriority trims whitespace', () => {
  expect(normalizePriority('  medium  ')).toBe('medium');
});

// ── isHexColor ──────────────────────────────────────────────────────

test('isHexColor accepts valid 6-digit hex colors', () => {
  expect(isHexColor('#aabbcc')).toBe(true);
  expect(isHexColor('#AABBCC')).toBe(true);
  expect(isHexColor('#3b82f6')).toBe(true);
});

test('isHexColor accepts valid 3-digit hex colors', () => {
  expect(isHexColor('#abc')).toBe(true);
  expect(isHexColor('#ABC')).toBe(true);
});

test('isHexColor rejects invalid values', () => {
  expect(isHexColor('aabbcc')).toBe(false);
  expect(isHexColor('#abcde')).toBe(false);
  expect(isHexColor('#abcdefg')).toBe(false);
  expect(isHexColor('')).toBe(false);
  expect(isHexColor(null)).toBe(false);
  expect(isHexColor(undefined)).toBe(false);
  expect(isHexColor(123)).toBe(false);
});

// ── normalizeHexColor ───────────────────────────────────────────────

test('normalizeHexColor returns valid color unchanged', () => {
  expect(normalizeHexColor('#3b82f6')).toBe('#3b82f6');
});

test('normalizeHexColor trims whitespace from valid color', () => {
  expect(normalizeHexColor('  #abc  ')).toBe('#abc');
});

test('normalizeHexColor returns default fallback for invalid color', () => {
  expect(normalizeHexColor('invalid')).toBe(DEFAULT_COLUMN_COLOR);
  expect(normalizeHexColor(null)).toBe(DEFAULT_COLUMN_COLOR);
});

test('normalizeHexColor uses custom fallback', () => {
  expect(normalizeHexColor('invalid', '#ff0000')).toBe('#ff0000');
});

// ── boardDisplayName ────────────────────────────────────────────────

test('boardDisplayName returns trimmed name', () => {
  expect(boardDisplayName({ name: '  My Board  ' })).toBe('My Board');
});

test('boardDisplayName returns Untitled board for missing/empty name', () => {
  expect(boardDisplayName({ name: '' })).toBe('Untitled board');
  expect(boardDisplayName({ name: '   ' })).toBe('Untitled board');
  expect(boardDisplayName(null)).toBe('Untitled board');
  expect(boardDisplayName(undefined)).toBe('Untitled board');
  expect(boardDisplayName({})).toBe('Untitled board');
});

// ── normalizeDueDate ────────────────────────────────────────────────

test('normalizeDueDate returns plain date unchanged', () => {
  expect(normalizeDueDate('2024-01-15')).toBe('2024-01-15');
});

test('normalizeDueDate strips ISO time portion', () => {
  expect(normalizeDueDate('2024-01-15T10:30:00Z')).toBe('2024-01-15');
  expect(normalizeDueDate('2024-01-15T00:00:00.000Z')).toBe('2024-01-15');
});

test('normalizeDueDate returns empty string for empty/null input', () => {
  expect(normalizeDueDate('')).toBe('');
  expect(normalizeDueDate(null)).toBe('');
  expect(normalizeDueDate(undefined)).toBe('');
});

// ── normalizeActivityLog ────────────────────────────────────────────

test('normalizeActivityLog drops malformed entries and preserves valid entries', () => {
  const validEvent = {
    type: 'task.created',
    at: '2026-05-01T00:00:00.000Z',
    actor: { type: 'human', id: null },
    details: { taskId: 'task-1' }
  };

  expect(normalizeActivityLog(null)).toEqual([]);
  expect(normalizeActivityLog('not-an-array')).toEqual([]);
  expect(normalizeActivityLog([
    validEvent,
    { at: validEvent.at, actor: validEvent.actor, details: validEvent.details },
    { type: 'task.created', actor: validEvent.actor, details: validEvent.details },
    { type: 'task.created', at: validEvent.at, details: validEvent.details },
    { type: 'task.created', at: validEvent.at, actor: validEvent.actor },
    { type: 'task.created', at: validEvent.at, actor: null, details: validEvent.details },
    { type: 'task.created', at: validEvent.at, actor: validEvent.actor, details: null }
  ])).toEqual([validEvent]);
});

test('normalizeActivityLog drops entries with empty type, non-parseable timestamp, or invalid actor', () => {
  const validEvent = {
    type: 'task.created',
    at: '2026-05-01T00:00:00.000Z',
    actor: { type: 'human', id: null },
    details: { taskId: 'task-1' }
  };

  expect(normalizeActivityLog([
    validEvent,
    { ...validEvent, type: '' },
    { ...validEvent, type: '   ' },
    { ...validEvent, at: 'not-a-date' },
    { ...validEvent, actor: { type: 'bot', id: 'bot-1' } },
    { ...validEvent, actor: { type: 'human', id: 'human-1' } },
    { ...validEvent, actor: { type: 'agent', id: '' } }
  ])).toEqual([validEvent]);
});

test('normalizeActivityLog accepts ISO timestamps with UTC offset and microsecond precision', () => {
  const base = {
    type: 'task.created',
    actor: { type: 'human', id: null },
    details: { taskId: 'task-1' }
  };
  // +00:00 offset form (valid ISO 8601)
  const withOffset = { ...base, at: '2026-05-01T00:00:00.000+00:00' };
  // microsecond precision (6 fractional digits)
  const withMicros = { ...base, at: '2026-05-01T00:00:00.000000Z' };

  expect(normalizeActivityLog([withOffset])).toEqual([withOffset]);
  expect(normalizeActivityLog([withMicros])).toEqual([withMicros]);
});

// ── normalizeStringKeys ─────────────────────────────────────────────

test('normalizeStringKeys deduplicates and trims', () => {
  expect(normalizeStringKeys(['a', ' b ', 'a', 'c'])).toEqual(['a', 'b', 'c']);
});

test('normalizeStringKeys filters empty strings and non-strings', () => {
  expect(normalizeStringKeys(['a', '', 42, null, 'b'])).toEqual(['a', 'b']);
});

test('normalizeStringKeys returns empty array for non-array input', () => {
  expect(normalizeStringKeys(null)).toEqual([]);
  expect(normalizeStringKeys('string')).toEqual([]);
  expect(normalizeStringKeys(undefined)).toEqual([]);
});

// ── normalizeSubTasks ───────────────────────────────────────────────

test('normalizeSubTasks returns empty array for non-array input', () => {
  expect(normalizeSubTasks(null)).toEqual([]);
  expect(normalizeSubTasks(undefined)).toEqual([]);
  expect(normalizeSubTasks('string')).toEqual([]);
  expect(normalizeSubTasks(42)).toEqual([]);
});

test('normalizeSubTasks returns empty array for empty array input', () => {
  expect(normalizeSubTasks([])).toEqual([]);
});

test('normalizeSubTasks filters entries with missing id or title', () => {
  const input = [
    { id: 'abc', title: 'Valid', completed: false, order: 1 },
    { id: '', title: 'No id', completed: false, order: 2 },
    { id: 'xyz', title: '', completed: false, order: 3 },
    { id: 'def', title: '   ', completed: false, order: 4 }
  ];
  const result = normalizeSubTasks(input);
  expect(result.length).toBe(1);
  expect(result[0].id).toBe('abc');
});

test('normalizeSubTasks coerces completed to boolean', () => {
  const result = normalizeSubTasks([
    { id: 'a', title: 'Done', completed: true, order: 1 },
    { id: 'b', title: 'Not done', completed: false, order: 2 },
    { id: 'c', title: 'Truthy', completed: 1, order: 3 },
    { id: 'd', title: 'Falsy', completed: 0, order: 4 }
  ]);
  expect(result[0].completed).toBe(true);
  expect(result[1].completed).toBe(false);
  expect(result[2].completed).toBe(false); // only strict true passes
  expect(result[3].completed).toBe(false);
});

test('normalizeSubTasks preserves order when valid', () => {
  const result = normalizeSubTasks([
    { id: 'a', title: 'First', completed: false, order: 3 },
    { id: 'b', title: 'Second', completed: false, order: 1 }
  ]);
  expect(result[0].order).toBe(3);
  expect(result[1].order).toBe(1);
});

test('normalizeSubTasks assigns index-based order when order is missing or non-finite', () => {
  const result = normalizeSubTasks([
    { id: 'a', title: 'First', completed: false },
    { id: 'b', title: 'Second', completed: false, order: null },
    { id: 'c', title: 'Third', completed: false, order: 'x' }
  ]);
  expect(result[0].order).toBe(1);
  expect(result[1].order).toBe(2);
  expect(result[2].order).toBe(3);
});

test('normalizeSubTasks trims id and title', () => {
  const result = normalizeSubTasks([
    { id: '  abc  ', title: '  My task  ', completed: false, order: 1 }
  ]);
  expect(result[0].id).toBe('abc');
  expect(result[0].title).toBe('My task');
});

test('normalizeSubTasks ignores non-object entries', () => {
  const result = normalizeSubTasks([null, undefined, 'string', 42, { id: 'ok', title: 'Valid', completed: false, order: 1 }]);
  expect(result.length).toBe(1);
  expect(result[0].id).toBe('ok');
});
