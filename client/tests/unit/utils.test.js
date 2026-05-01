import { test, expect } from 'vitest';
import { generateUUID } from '../../src/modules/utils.js';

test('generateUUID returns a string', () => {
  expect(typeof generateUUID()).toBe('string');
});

test('generateUUID matches UUID v4 format', () => {
  const uuid = generateUUID();
  expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('generateUUID produces unique values', () => {
  const a = generateUUID();
  const b = generateUUID();
  expect(a).not.toBe(b);
});

test('generateUUID has version digit 4 at correct position', () => {
  const uuid = generateUUID();
  expect(uuid.charAt(14)).toBe('4');
});
