import { beforeEach, test, expect, vi } from 'vitest';
import { resetLocalStorage } from '../setup.js';

// Mock scheduleDomainEvent so tests don't need a real DB
vi.mock('../../../src/modules/event-sourcing/emitter.js', () => ({
  scheduleDomainEvent: vi.fn(() => Promise.resolve())
}));

// loadTimeTracking drives validation — we control it via mock
vi.mock('../../../src/modules/storage.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    loadTimeTracking: vi.fn(() => ({ customers: [], projects: [], timeEntries: [] }))
  };
});

// Import the pure CRUD module — no DOM/icons dependency
const { addCustomer, addProject, CRUD_ERROR } = await import('../../../src/modules/timetracking-crud.js');
const { loadTimeTracking } = await import('../../../src/modules/storage.js');

beforeEach(() => {
  resetLocalStorage();
  vi.mocked(loadTimeTracking).mockReturnValue({ customers: [], projects: [], timeEntries: [] });
});

// ── addCustomer ────────────────────────────────────────────────────────────────

test('addCustomer succeeds with a valid name', () => {
  const result = addCustomer('Acme');
  expect(result.ok).toBe(true);
  expect(result.customer.name).toBe('Acme');
});

test('addCustomer trims whitespace from name', () => {
  const result = addCustomer('  Acme  ');
  expect(result.ok).toBe(true);
  expect(result.customer.name).toBe('Acme');
});

test('addCustomer rejects empty name', () => {
  expect(addCustomer('').ok).toBe(false);
  expect(addCustomer('   ').ok).toBe(false);
  expect(addCustomer('').reason).toBe(CRUD_ERROR.EMPTY_NAME);
});

test('addCustomer rejects duplicate name (case-insensitive)', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = addCustomer('acme');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.DUPLICATE_NAME);
});

test('addCustomer allows different customer names', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = addCustomer('Globex');
  expect(result.ok).toBe(true);
});

test('addCustomer assigns a color from the palette', () => {
  const result = addCustomer('Acme');
  expect(typeof result.customer.color).toBe('string');
  expect(result.customer.color).toMatch(/^#/);
});

// ── addProject ─────────────────────────────────────────────────────────────────

test('addProject succeeds with valid customerId and name', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = addProject('c1', 'Website');
  expect(result.ok).toBe(true);
  expect(result.project.name).toBe('Website');
  expect(result.project.customerId).toBe('c1');
});

test('addProject trims whitespace from name', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = addProject('c1', '  MVP  ');
  expect(result.ok).toBe(true);
  expect(result.project.name).toBe('MVP');
});

test('addProject rejects empty name', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = addProject('c1', '');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.EMPTY_NAME);
});

test('addProject rejects missing customerId', () => {
  const result = addProject('', 'MVP');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.NO_CUSTOMER);
});

test('addProject rejects duplicate project name within same customer (case-insensitive)', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', archived: false }],
    timeEntries: []
  });
  const result = addProject('c1', 'website');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(CRUD_ERROR.DUPLICATE_NAME);
});

test('addProject allows same project name under different customers', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [
      { id: 'c1', name: 'Acme', archived: false },
      { id: 'c2', name: 'Globex', archived: false }
    ],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', archived: false }],
    timeEntries: []
  });
  const result = addProject('c2', 'Website');
  expect(result.ok).toBe(true);
});

test('addProject assigns a color from the palette', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  const result = addProject('c1', 'MVP');
  expect(result.project.color).toMatch(/^#/);
});
