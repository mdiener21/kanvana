import { test, expect } from 'vitest';
import { applyEvent, applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

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

// ── Time entry handlers ────────────────────────────────────────────────────────

test('time_entry.created adds the entry with its absolute instants', () => {
  const next = applyEvent(baseState(), event({
    type: 'time_entry.created',
    entity_id: 'te-1',
    payload: { timeEntry: { projectId: 'proj-1', description: 'Standup', start: '2026-10-31T21:00:00.000Z', end: '2026-11-01T01:00:00.000Z' } }
  }));
  expect(next.timeTracking.timeEntries).toEqual([
    { id: 'te-1', projectId: 'proj-1', description: 'Standup', start: '2026-10-31T21:00:00.000Z', end: '2026-11-01T01:00:00.000Z' }
  ]);
});

test('time_entry.created is idempotent by entity_id', () => {
  const existing = { id: 'te-1', projectId: 'proj-1', description: 'A', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };
  const next = applyEvent(baseState({ timeEntries: [existing] }), event({
    type: 'time_entry.created',
    entity_id: 'te-1',
    payload: { timeEntry: { ...existing, description: 'B' } }
  }));
  expect(next.timeTracking.timeEntries).toEqual([existing]);
});

const ENTRY = { id: 'te-1', projectId: 'proj-1', description: 'A', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };
const hlc = (wallTime) => ({ wallTime, counter: 0, nodeId: 'node-a' });

test('time_entry.updated merges the after values into the entry', () => {
  const next = applyEvent(baseState({ timeEntries: [ENTRY] }), event({
    type: 'time_entry.updated',
    entity_id: 'te-1',
    payload: { fields: { description: 'B', end: '2026-10-08T09:00:00.000Z' }, before: { description: 'A', end: ENTRY.end } }
  }));
  expect(next.timeTracking.timeEntries).toEqual([{ ...ENTRY, description: 'B', end: '2026-10-08T09:00:00.000Z' }]);
});

test('time_entry.updated for an unknown entry is a no-op', () => {
  const next = applyEvent(baseState({ timeEntries: [ENTRY] }), event({
    type: 'time_entry.updated', entity_id: 'ghost', payload: { fields: { description: 'B' }, before: {} }
  }));
  expect(next.timeTracking.timeEntries).toEqual([ENTRY]);
});

test('time_entry.deleted removes the entry permanently', () => {
  const other = { ...ENTRY, id: 'te-2' };
  const next = applyEvent(baseState({ timeEntries: [ENTRY, other] }), event({
    type: 'time_entry.deleted', entity_id: 'te-1', payload: { timeEntry: ENTRY }
  }));
  expect(next.timeTracking.timeEntries).toEqual([other]);
});

test('time_entry.deleted for an unknown entry is a no-op', () => {
  const next = applyEvent(baseState({ timeEntries: [ENTRY] }), event({ type: 'time_entry.deleted', entity_id: 'ghost' }));
  expect(next.timeTracking.timeEntries).toEqual([ENTRY]);
});

test('edits and deletes converge to the same projection regardless of arrival order', () => {
  const created = { ...event({ id: 'e-created', type: 'time_entry.created', entity_id: 'te-1', payload: { timeEntry: ENTRY } }), hlc: hlc(1) };
  const edited = { ...event({ id: 'e-edited', type: 'time_entry.updated', entity_id: 'te-1', payload: { fields: { description: 'B' }, before: { description: 'A' } } }), hlc: hlc(2) };
  const otherCreated = { ...event({ id: 'e-other', type: 'time_entry.created', entity_id: 'te-2', payload: { timeEntry: { ...ENTRY, id: 'te-2' } } }), hlc: hlc(3) };
  const deleted = { ...event({ id: 'e-deleted', type: 'time_entry.deleted', entity_id: 'te-1', payload: { timeEntry: ENTRY } }), hlc: hlc(4) };
  const events = [created, edited, otherCreated, deleted];

  const forward = applyEvents(baseState(), events);
  const backward = applyEvents(baseState(), [...events].reverse());
  expect(forward.timeTracking).toEqual(backward.timeTracking);
  expect(forward.timeTracking.timeEntries).toEqual([{ ...ENTRY, id: 'te-2' }]);

  const editedOnly = applyEvents(baseState(), [edited, created]);
  expect(editedOnly.timeTracking.timeEntries).toEqual([{ ...ENTRY, description: 'B' }]);
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

// ── Archive and guarded delete ─────────────────────────────────────────────────

const ACME_C = { id: 'c1', name: 'Acme', color: '#000', archived: false };
const WEBSITE_P = { id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false };
const ON_WEBSITE = { id: 'te-9', projectId: 'p1', description: '', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };

test('customer.archived / unarchived toggle the archived flag', () => {
  const archived = applyEvent(baseState({ customers: [ACME_C] }), event({ type: 'customer.archived', entity_id: 'c1' }));
  expect(archived.timeTracking.customers[0].archived).toBe(true);
  const back = applyEvent(archived, event({ type: 'customer.unarchived', entity_id: 'c1' }));
  expect(back.timeTracking.customers[0].archived).toBe(false);
});

test('project.archived / unarchived toggle the archived flag and keep its entries', () => {
  const archived = applyEvent(
    baseState({ customers: [ACME_C], projects: [WEBSITE_P], timeEntries: [ON_WEBSITE] }),
    event({ type: 'project.archived', entity_id: 'p1' })
  );
  expect(archived.timeTracking.projects[0].archived).toBe(true);
  expect(archived.timeTracking.timeEntries).toEqual([ON_WEBSITE]);
  const back = applyEvent(archived, event({ type: 'project.unarchived', entity_id: 'p1' }));
  expect(back.timeTracking.projects[0].archived).toBe(false);
});

test('project.deleted removes an unreferenced project', () => {
  const next = applyEvent(baseState({ customers: [ACME_C], projects: [WEBSITE_P] }), event({ type: 'project.deleted', entity_id: 'p1' }));
  expect(next.timeTracking.projects).toEqual([]);
});

test('customer.deleted removes an unreferenced customer', () => {
  const next = applyEvent(baseState({ customers: [ACME_C] }), event({ type: 'customer.deleted', entity_id: 'c1' }));
  expect(next.timeTracking.customers).toEqual([]);
});

test('replayed deletes of referenced items keep them', () => {
  const state = baseState({ customers: [ACME_C], projects: [WEBSITE_P], timeEntries: [ON_WEBSITE] });
  const next = applyEvents(state, [
    event({ type: 'project.deleted', entity_id: 'p1' }),
    event({ type: 'customer.deleted', entity_id: 'c1' })
  ]);
  expect(next.timeTracking.projects).toEqual([WEBSITE_P]);
  expect(next.timeTracking.customers).toEqual([ACME_C]);
});
