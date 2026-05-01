import { test, expect } from 'vitest';
import {
  DONE_COLUMN_ID,
  PRIORITIES,
  PRIORITY_SET,
  PRIORITY_ORDER,
  DEFAULT_PRIORITY,
  DEFAULT_COLUMN_COLOR,
  MAX_LABEL_NAME_LENGTH
} from '../../src/modules/constants.js';

test('PRIORITIES contains 5 values in correct order', () => {
  expect(PRIORITIES).toEqual(['urgent', 'high', 'medium', 'low', 'none']);
});

test('PRIORITY_SET contains all expected priorities and rejects unknown values', () => {
  expect(PRIORITY_SET.has('urgent')).toBe(true);
  expect(PRIORITY_SET.has('high')).toBe(true);
  expect(PRIORITY_SET.has('medium')).toBe(true);
  expect(PRIORITY_SET.has('low')).toBe(true);
  expect(PRIORITY_SET.has('none')).toBe(true);
  expect(PRIORITY_SET.has('invalid')).toBe(false);
  expect(PRIORITY_SET.has('')).toBe(false);
});

test('PRIORITY_ORDER maps priorities to ascending numeric rank', () => {
  expect(PRIORITY_ORDER.urgent).toBe(0);
  expect(PRIORITY_ORDER.high).toBe(1);
  expect(PRIORITY_ORDER.medium).toBe(2);
  expect(PRIORITY_ORDER.low).toBe(3);
  expect(PRIORITY_ORDER.none).toBe(4);
});

test('DEFAULT_PRIORITY is none', () => {
  expect(DEFAULT_PRIORITY).toBe('none');
});

test('DONE_COLUMN_ID is done', () => {
  expect(DONE_COLUMN_ID).toBe('done');
});

test('DEFAULT_COLUMN_COLOR is a valid hex color', () => {
  expect(DEFAULT_COLUMN_COLOR).toMatch(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i);
});

test('MAX_LABEL_NAME_LENGTH is a positive integer', () => {
  expect(Number.isInteger(MAX_LABEL_NAME_LENGTH)).toBe(true);
  expect(MAX_LABEL_NAME_LENGTH).toBeGreaterThan(0);
});
