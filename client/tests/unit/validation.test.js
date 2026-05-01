import { test, expect } from 'vitest';
import { validateTaskTitle, validateColumnName } from '../../src/modules/validation.js';

// ── validateTaskTitle ───────────────────────────────────────────────

test('validateTaskTitle returns true for non-empty string', () => {
  expect(validateTaskTitle('My Task')).toBe(true);
});

test('validateTaskTitle returns true for whitespace-padded non-empty string', () => {
  expect(validateTaskTitle('  Task  ')).toBe(true);
});

test('validateTaskTitle returns false for empty string', () => {
  expect(validateTaskTitle('')).toBe(false);
});

test('validateTaskTitle returns false for whitespace-only string', () => {
  expect(validateTaskTitle('   ')).toBe(false);
});

test('validateTaskTitle returns false for null and undefined', () => {
  expect(validateTaskTitle(null)).toBe(false);
  expect(validateTaskTitle(undefined)).toBe(false);
});

// ── validateColumnName ──────────────────────────────────────────────

test('validateColumnName returns true for non-empty string', () => {
  expect(validateColumnName('To Do')).toBe(true);
});

test('validateColumnName returns false for empty/whitespace/null', () => {
  expect(validateColumnName('')).toBe(false);
  expect(validateColumnName('   ')).toBe(false);
  expect(validateColumnName(null)).toBe(false);
  expect(validateColumnName(undefined)).toBe(false);
});
