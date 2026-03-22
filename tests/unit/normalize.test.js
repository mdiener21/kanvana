import { test, expect } from 'vitest';
import {
  normalizePriority,
  isHexColor,
  normalizeHexColor,
  boardDisplayName,
  normalizeDueDate,
  normalizeStringKeys
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
