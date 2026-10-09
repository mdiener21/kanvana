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
