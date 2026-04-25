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

test('PRIORITY_SET contains all priorities', () => {
  for (const p of PRIORITIES) {
    expect(PRIORITY_SET.has(p)).toBe(true);
  }
  expect(PRIORITY_SET.size).toBe(5);
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

test('DEFAULT_COLUMN_COLOR and MAX_LABEL_NAME_LENGTH have expected values', () => {
  expect(DEFAULT_COLUMN_COLOR).toBe('#3b82f6');
  expect(MAX_LABEL_NAME_LENGTH).toBe(40);
});
