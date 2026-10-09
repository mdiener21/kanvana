import { test, expect } from 'vitest';
import { applyEvent, createProjectionState } from '../../../src/modules/reducer.js';

function event(overrides) {
  return {
    id: overrides.id || crypto.randomUUID(),
    type: overrides.type,
    hlc: { wallTime: 1000, counter: 0, nodeId: 'node-a' },
    at: '2026-01-01T10:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: overrides.scope ?? 'timetracking',
    board_id: null,
    entity_id: overrides.entity_id || 'entity-a',
    payload: overrides.payload || {}
  };
}

function baseState(overrides = {}) {
  return createProjectionState({
    timeTracking: {
      customers: overrides.customers || [],
      projects: overrides.projects || [],
      timeEntries: overrides.timeEntries || []
    }
  });
}

// ── Customer handlers ──────────────────────────────────────────────────────────

test('customer.created adds customer to timeTracking.customers', () => {
  const state = baseState();
  const next = applyEvent(state, event({
    type: 'customer.created',
    entity_id: 'cust-1',
    payload: { customer: { name: 'Acme', color: '#03a9f4', archived: false } }
  }));
  expect(next.timeTracking.customers).toHaveLength(1);
  expect(next.timeTracking.customers[0]).toMatchObject({ id: 'cust-1', name: 'Acme' });
});

test('customer.created is idempotent by entity_id', () => {
  const state = baseState({ customers: [{ id: 'cust-1', name: 'Acme', color: '#03a9f4', archived: false }] });
  const next = applyEvent(state, event({
    id: 'evt-1',
    type: 'customer.created',
    entity_id: 'cust-1',
    payload: { customer: { name: 'Acme 2', color: '#000', archived: false } }
  }));
  // Pre-existing customer — should not be added again
  expect(next.timeTracking.customers).toHaveLength(1);
  expect(next.timeTracking.customers[0].name).toBe('Acme');
});

test('customer.updated merges fields', () => {
  const state = baseState({ customers: [{ id: 'cust-1', name: 'Old', color: '#03a9f4', archived: false }] });
  const next = applyEvent(state, event({
    type: 'customer.updated',
    entity_id: 'cust-1',
    payload: { fields: { name: 'New' } }
  }));
  expect(next.timeTracking.customers[0].name).toBe('New');
});

test('customer.archived sets archived flag', () => {
  const state = baseState({ customers: [{ id: 'cust-1', name: 'Acme', archived: false }] });
  const next = applyEvent(state, event({ type: 'customer.archived', entity_id: 'cust-1' }));
  expect(next.timeTracking.customers[0].archived).toBe(true);
});

test('customer.unarchived clears archived flag', () => {
  const state = baseState({ customers: [{ id: 'cust-1', name: 'Acme', archived: true }] });
  const next = applyEvent(state, event({ type: 'customer.unarchived', entity_id: 'cust-1' }));
  expect(next.timeTracking.customers[0].archived).toBe(false);
});

test('customer.deleted removes customer', () => {
  const state = baseState({ customers: [{ id: 'cust-1', name: 'Acme' }, { id: 'cust-2', name: 'Globex' }] });
  const next = applyEvent(state, event({ type: 'customer.deleted', entity_id: 'cust-1' }));
  expect(next.timeTracking.customers).toHaveLength(1);
  expect(next.timeTracking.customers[0].id).toBe('cust-2');
});

// ── Project handlers ───────────────────────────────────────────────────────────

test('project.created adds project to timeTracking.projects', () => {
  const state = baseState();
  const next = applyEvent(state, event({
    type: 'project.created',
    entity_id: 'proj-1',
    payload: { project: { customerId: 'cust-1', name: 'MVP', color: '#e91e63', archived: false } }
  }));
  expect(next.timeTracking.projects).toHaveLength(1);
  expect(next.timeTracking.projects[0]).toMatchObject({ id: 'proj-1', customerId: 'cust-1', name: 'MVP' });
});

test('project.created is idempotent by entity_id', () => {
  const state = baseState({ projects: [{ id: 'proj-1', customerId: 'cust-1', name: 'MVP', archived: false }] });
  const next = applyEvent(state, event({
    id: 'evt-2',
    type: 'project.created',
    entity_id: 'proj-1',
    payload: { project: { customerId: 'cust-1', name: 'MVP 2', archived: false } }
  }));
  expect(next.timeTracking.projects).toHaveLength(1);
  expect(next.timeTracking.projects[0].name).toBe('MVP');
});

test('project.updated merges fields', () => {
  const state = baseState({ projects: [{ id: 'proj-1', customerId: 'cust-1', name: 'Old', color: '#000', archived: false }] });
  const next = applyEvent(state, event({
    type: 'project.updated',
    entity_id: 'proj-1',
    payload: { fields: { name: 'New' } }
  }));
  expect(next.timeTracking.projects[0].name).toBe('New');
});

test('project.archived sets archived flag', () => {
  const state = baseState({ projects: [{ id: 'proj-1', name: 'MVP', archived: false }] });
  const next = applyEvent(state, event({ type: 'project.archived', entity_id: 'proj-1' }));
  expect(next.timeTracking.projects[0].archived).toBe(true);
});

test('project.unarchived clears archived flag', () => {
  const state = baseState({ projects: [{ id: 'proj-1', name: 'MVP', archived: true }] });
  const next = applyEvent(state, event({ type: 'project.unarchived', entity_id: 'proj-1' }));
  expect(next.timeTracking.projects[0].archived).toBe(false);
});

test('project.deleted removes project', () => {
  const state = baseState({ projects: [{ id: 'proj-1', name: 'MVP' }, { id: 'proj-2', name: 'Support' }] });
  const next = applyEvent(state, event({ type: 'project.deleted', entity_id: 'proj-1' }));
  expect(next.timeTracking.projects).toHaveLength(1);
  expect(next.timeTracking.projects[0].id).toBe('proj-2');
});

// ── Time entry handlers ────────────────────────────────────────────────────────

test('time_entry.created adds entry to timeTracking.timeEntries', () => {
  const state = baseState();
  const next = applyEvent(state, event({
    type: 'time_entry.created',
    entity_id: 'entry-1',
    payload: { entry: { projectId: 'proj-1', description: 'Standup', start: '2026-01-01T09:00:00Z', end: '2026-01-01T09:15:00Z' } }
  }));
  expect(next.timeTracking.timeEntries).toHaveLength(1);
  expect(next.timeTracking.timeEntries[0]).toMatchObject({ id: 'entry-1', projectId: 'proj-1' });
});

test('time_entry.created is idempotent by entity_id', () => {
  const state = baseState({ timeEntries: [{ id: 'entry-1', projectId: 'proj-1', description: 'Old' }] });
  const next = applyEvent(state, event({
    id: 'evt-3',
    type: 'time_entry.created',
    entity_id: 'entry-1',
    payload: { entry: { projectId: 'proj-1', description: 'New' } }
  }));
  expect(next.timeTracking.timeEntries).toHaveLength(1);
  expect(next.timeTracking.timeEntries[0].description).toBe('Old');
});

test('time_entry.updated merges fields', () => {
  const state = baseState({ timeEntries: [{ id: 'entry-1', projectId: 'proj-1', description: 'Old' }] });
  const next = applyEvent(state, event({
    type: 'time_entry.updated',
    entity_id: 'entry-1',
    payload: { fields: { description: 'New' } }
  }));
  expect(next.timeTracking.timeEntries[0].description).toBe('New');
});

test('time_entry.deleted removes entry', () => {
  const state = baseState({ timeEntries: [{ id: 'entry-1' }, { id: 'entry-2' }] });
  const next = applyEvent(state, event({ type: 'time_entry.deleted', entity_id: 'entry-1' }));
  expect(next.timeTracking.timeEntries).toHaveLength(1);
  expect(next.timeTracking.timeEntries[0].id).toBe('entry-2');
});

// ── Board state isolation ──────────────────────────────────────────────────────

test('time-tracking events do not affect board-level state', () => {
  const state = createProjectionState({
    boards: [{ id: 'board-1', name: 'My Board' }],
    timeTracking: { customers: [], projects: [], timeEntries: [] }
  });
  const next = applyEvent(state, event({
    type: 'customer.created',
    entity_id: 'cust-1',
    payload: { customer: { name: 'Acme', archived: false } }
  }));
  expect(next.boards).toEqual(state.boards);
  expect(next.tasks).toEqual(state.tasks);
});

// ── applyEvent idempotency by event id ────────────────────────────────────────

test('customer.created respects event-level idempotency via appliedEventIds', () => {
  const state = baseState();
  const evt = event({ id: 'idempotent-1', type: 'customer.created', entity_id: 'cust-1', payload: { customer: { name: 'Acme', archived: false } } });
  const once = applyEvent(state, evt);
  const twice = applyEvent(once, evt);
  expect(twice.timeTracking.customers).toHaveLength(1);
  expect(twice).toEqual(once);
});
