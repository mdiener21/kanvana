import { test, expect } from 'vitest';
import { createCustomer, createProject } from '../../../src/modules/schema.js';
import { TT_COLOR_PALETTE } from '../../../src/modules/constants.js';

test('createCustomer returns all required fields with defaults', () => {
  const c = createCustomer();
  expect(typeof c.id).toBe('string');
  expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(c.name).toBe('');
  expect(c.archived).toBe(false);
  expect(typeof c.color).toBe('string');
  expect(c.color).toBeTruthy();
});

test('createCustomer applies overrides', () => {
  const c = createCustomer({ name: 'Acme' });
  expect(c.name).toBe('Acme');
  expect(c.archived).toBe(false);
});

test('createCustomer auto-assigns color from palette using colorIndex', () => {
  const c0 = createCustomer({}, 0);
  const c1 = createCustomer({}, 1);
  expect(c0.color).toBe(TT_COLOR_PALETTE[0]);
  expect(c1.color).toBe(TT_COLOR_PALETTE[1]);
});

test('createCustomer wraps palette index', () => {
  const len = TT_COLOR_PALETTE.length;
  const c = createCustomer({}, len);
  expect(c.color).toBe(TT_COLOR_PALETTE[0]);
});

test('createCustomer generates unique ids', () => {
  const ids = Array.from({ length: 20 }, () => createCustomer().id);
  expect(new Set(ids).size).toBe(20);
});

test('createProject returns all required fields with defaults', () => {
  const p = createProject();
  expect(typeof p.id).toBe('string');
  expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(p.customerId).toBe('');
  expect(p.name).toBe('');
  expect(p.archived).toBe(false);
  expect(typeof p.color).toBe('string');
  expect(p.color).toBeTruthy();
});

test('createProject applies overrides', () => {
  const p = createProject({ customerId: 'cust-1', name: 'MVP' });
  expect(p.customerId).toBe('cust-1');
  expect(p.name).toBe('MVP');
});

test('createProject auto-assigns color from palette', () => {
  const p = createProject({}, 2);
  expect(p.color).toBe(TT_COLOR_PALETTE[2]);
});

test('createProject generates unique ids', () => {
  const ids = Array.from({ length: 20 }, () => createProject().id);
  expect(new Set(ids).size).toBe(20);
});
