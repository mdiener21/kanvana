import { beforeEach, describe, test, expect } from 'vitest';
import { createTestTimeTracking } from '../../fixtures/time-tracking.js';
import { CRUD_ERROR } from '../../../src/modules/timetracking-model.js';

let tt = null;
const seed = (state = {}) => { tt = createTestTimeTracking(state); };

beforeEach(() => {
  seed();
});

// ── addCustomer ────────────────────────────────────────────────────────────────

test('addCustomer succeeds with a valid name', () => {
  const result = tt.addCustomer('Acme');
  expect(result.ok).toBe(true);
  expect(result.customer.name).toBe('Acme');
});

test('addCustomer trims whitespace from name', () => {
  const result = tt.addCustomer('  Acme  ');
  expect(result.ok).toBe(true);
  expect(result.customer.name).toBe('Acme');
});

test('addCustomer rejects empty name', () => {
  expect(tt.addCustomer('').ok).toBe(false);
  expect(tt.addCustomer('   ').ok).toBe(false);
  expect(tt.addCustomer('').reason).toBe(CRUD_ERROR.EMPTY_NAME);
});

test('addCustomer rejects duplicate name (case-insensitive)', () => {
  seed({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = tt.addCustomer('acme');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.DUPLICATE_NAME);
});

test('addCustomer allows different customer names', () => {
  seed({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = tt.addCustomer('Globex');
  expect(result.ok).toBe(true);
});

test('addCustomer assigns a color from the palette', () => {
  const result = tt.addCustomer('Acme');
  expect(typeof result.customer.color).toBe('string');
  expect(result.customer.color).toMatch(/^#/);
});

// ── addProject ─────────────────────────────────────────────────────────────────

test('addProject succeeds with valid customerId and name', () => {
  seed({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = tt.addProject('c1', 'Website');
  expect(result.ok).toBe(true);
  expect(result.project.name).toBe('Website');
  expect(result.project.customerId).toBe('c1');
});

test('addProject trims whitespace from name', () => {
  seed({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = tt.addProject('c1', '  MVP  ');
  expect(result.ok).toBe(true);
  expect(result.project.name).toBe('MVP');
});

test('addProject rejects empty name', () => {
  seed({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = tt.addProject('c1', '');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.EMPTY_NAME);
});

test('addProject rejects missing customerId', () => {
  const result = tt.addProject('', 'MVP');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.NO_CUSTOMER);
});

test('addProject rejects duplicate project name within same customer (case-insensitive)', () => {
  seed({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', archived: false }],
    timeEntries: []
  });
  const result = tt.addProject('c1', 'website');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.DUPLICATE_NAME);
});

test('addProject allows same project name under different customers', () => {
  seed({
    customers: [
      { id: 'c1', name: 'Acme', archived: false },
      { id: 'c2', name: 'Globex', archived: false }
    ],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', archived: false }],
    timeEntries: []
  });
  const result = tt.addProject('c2', 'Website');
  expect(result.ok).toBe(true);
});

test('addProject assigns a color from the palette', () => {
  seed({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = tt.addProject('c1', 'MVP');
  expect(result.project.color).toMatch(/^#/);
});

// ── updateCustomerWorkWeek ─────────────────────────────────────────────────────

describe('updateCustomerWorkWeek', () => {
  const legacyCustomer = { id: 'c1', name: 'Acme', color: '#000000', archived: true };
  const events = () => tt.emitted;

  beforeEach(() => {
    seed({ customers: [legacyCustomer], projects: [], timeEntries: [] });
  });

  test('emits a customer.updated patch of only the changed fields, with their before values', () => {
    expect(tt.updateCustomerWorkWeek('c1', { weeklyHours: 24, workdays: [3, 1, 2, 2] })).toEqual({ ok: true, changed: true });
    expect(events()).toEqual([expect.objectContaining({
      type: 'customer.updated', scope: 'timetracking', entityId: 'c1',
      payload: { fields: { weeklyHours: 24, workdays: [1, 2, 3] }, before: { weeklyHours: null, workdays: [1, 2, 3, 4, 5] } }
    })]);
  });

  test('an unchanged value emits nothing', () => {
    expect(tt.updateCustomerWorkWeek('c1', { weeklyHours: null, workdays: [1, 2, 3, 4, 5] })).toEqual({ ok: true, changed: false });
    expect(events()).toEqual([]);
  });

  test.each([[0], [-1], [Number.NaN], [Infinity], ['40']])('rejects Weekly hours %s', (weeklyHours) => {
    expect(tt.updateCustomerWorkWeek('c1', { weeklyHours })).toEqual({ ok: false, reason: CRUD_ERROR.INVALID_WORK_WEEK });
    expect(events()).toEqual([]);
  });

  test.each([[[]], [[0]], [[8]], [[1.5]], [null]])('rejects Workdays %j', (workdays) => {
    expect(tt.updateCustomerWorkWeek('c1', { workdays })).toEqual({ ok: false, reason: CRUD_ERROR.INVALID_WORK_WEEK });
  });

  test('an unknown Customer is not found', () => {
    expect(tt.updateCustomerWorkWeek('nope', { weeklyHours: 8 })).toEqual({ ok: false, reason: CRUD_ERROR.NOT_FOUND });
  });
});
