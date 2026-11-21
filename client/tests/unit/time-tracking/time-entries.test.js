import { beforeEach, describe, test, expect } from 'vitest';
import { createTestTimeTracking } from '../../fixtures/time-tracking.js';
import { validateTimeEntry, TT_ERROR } from '../../../src/modules/timetracking-model.js';

const customers = [
  { id: 'c1', name: 'Acme', color: '#000', archived: false },
  { id: 'c2', name: 'Old Co', color: '#111', archived: true }
];
const projects = [
  { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false },
  { id: 'p2', customerId: 'c1', name: 'Legacy', color: '#e91e63', archived: true },
  { id: 'p3', customerId: 'c2', name: 'Support', color: '#8bc34a', archived: false }
];
const tt = { customers, projects, timeEntries: [] };

const valid = {
  projectId: 'p1',
  description: '  Standup  ',
  start: '2026-10-31T21:00:00.000Z',
  end: '2026-11-01T01:00:00.000Z'
};

let timeTracking = null;
const seed = (timeEntries = []) => { timeTracking = createTestTimeTracking({ ...tt, timeEntries }); };

beforeEach(() => {
  seed();
});

describe('validateTimeEntry', () => {
  test.each([
    ['no project', { projectId: '' }, TT_ERROR.NO_PROJECT],
    ['unknown project', { projectId: 'nope' }, TT_ERROR.NO_PROJECT],
    ['archived project', { projectId: 'p2' }, TT_ERROR.ARCHIVED_PROJECT],
    ['project of an archived customer', { projectId: 'p3' }, TT_ERROR.ARCHIVED_PROJECT],
    ['missing start', { start: '' }, TT_ERROR.INVALID_TIME],
    ['unparsable end', { end: 'later' }, TT_ERROR.INVALID_TIME],
    ['zero duration', { end: valid.start }, TT_ERROR.ZERO_DURATION],
    ['negative duration', { end: '2026-10-31T20:00:00.000Z' }, TT_ERROR.ZERO_DURATION]
  ])('%s is rejected', (_name, overrides, reason) => {
    expect(validateTimeEntry({ ...valid, ...overrides }, tt)).toEqual({ ok: false, reason });
  });

  test('a project is checked before the times', () => {
    expect(validateTimeEntry({ ...valid, projectId: '', end: valid.start }, tt).reason).toBe(TT_ERROR.NO_PROJECT);
  });

  test('a valid entry passes', () => {
    expect(validateTimeEntry(valid, tt)).toEqual({ ok: true });
  });
});

describe('addTimeEntry', () => {
  test('emits time_entry.created in the timetracking scope with absolute instants', () => {
    const result = timeTracking.addTimeEntry(valid);

    expect(result.ok).toBe(true);
    expect(result.timeEntry).toEqual({
      id: expect.any(String),
      projectId: 'p1',
      description: 'Standup',
      start: '2026-10-31T21:00:00.000Z',
      end: '2026-11-01T01:00:00.000Z'
    });
    expect(timeTracking.emitted).toHaveLength(1);
    expect(timeTracking.emitted).toContainEqual({
      type: 'time_entry.created',
      scope: 'timetracking',
      entityId: result.timeEntry.id,
      payload: { timeEntry: result.timeEntry }
    });
  });

  test('normalises instants to UTC ISO strings', () => {
    const result = timeTracking.addTimeEntry({ ...valid, start: '2026-10-08T09:00:00+02:00', end: '2026-10-08T10:00:00+02:00' });
    expect(result.timeEntry).toMatchObject({ start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' });
  });

  test('invalid entries save nothing', () => {
    expect(timeTracking.addTimeEntry({ ...valid, projectId: 'p2' })).toEqual({ ok: false, reason: TT_ERROR.ARCHIVED_PROJECT });
    expect(timeTracking.addTimeEntry({ ...valid, end: valid.start })).toEqual({ ok: false, reason: TT_ERROR.ZERO_DURATION });
    expect(timeTracking.emitted).toEqual([]);
  });
});

describe('updateTimeEntry', () => {
  const existing = { id: 'te-1', projectId: 'p1', description: 'Standup', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };

  beforeEach(() => {
    seed([existing]);
  });

  test('emits time_entry.updated with the changed fields after and before', () => {
    const result = timeTracking.updateTimeEntry('te-1', { ...existing, description: ' Planning ', end: '2026-10-08T08:30:00.000Z' });

    expect(result).toEqual({ ok: true, changed: true });
    expect(timeTracking.emitted).toHaveLength(1);
    expect(timeTracking.emitted).toContainEqual({
      type: 'time_entry.updated',
      scope: 'timetracking',
      entityId: 'te-1',
      payload: {
        fields: { description: 'Planning', end: '2026-10-08T08:30:00.000Z' },
        before: { description: 'Standup', end: '2026-10-08T08:00:00.000Z' }
      }
    });
  });

  test('saving without changes emits nothing', () => {
    expect(timeTracking.updateTimeEntry('te-1', { ...existing, start: '2026-10-08T09:00:00+02:00' })).toEqual({ ok: true, changed: false });
    expect(timeTracking.emitted).toEqual([]);
  });

  test('an entry may keep its already-archived project', () => {
    seed([{ ...existing, projectId: 'p2' }]);
    const result = timeTracking.updateTimeEntry('te-1', { ...existing, projectId: 'p2', description: 'Cleanup' });
    expect(result.ok).toBe(true);
    expect(timeTracking.emitted).toHaveLength(1);
  });

  test.each([
    ['switching to an archived project', { projectId: 'p2' }, TT_ERROR.ARCHIVED_PROJECT],
    ['switching to a project of an archived customer', { projectId: 'p3' }, TT_ERROR.ARCHIVED_PROJECT],
    ['no project', { projectId: '' }, TT_ERROR.NO_PROJECT],
    ['zero duration', { end: existing.start }, TT_ERROR.ZERO_DURATION]
  ])('%s is rejected', (_name, overrides, reason) => {
    expect(timeTracking.updateTimeEntry('te-1', { ...existing, ...overrides })).toEqual({ ok: false, reason });
    expect(timeTracking.emitted).toEqual([]);
  });

  test('an unknown entry is rejected', () => {
    expect(timeTracking.updateTimeEntry('ghost', existing)).toEqual({ ok: false, reason: TT_ERROR.NOT_FOUND });
  });
});

describe('duplicateTimeEntry', () => {
  const existing = { id: 'te-1', projectId: 'p1', description: 'Standup', start: '2026-10-07T07:00:00.000Z', end: '2026-10-07T08:30:00.000Z' };
  const now = Date.parse('2026-10-08T10:15:42.123Z');

  beforeEach(() => {
    seed([existing]);
  });

  test('emits time_entry.created with the same project, description and duration, starting now', () => {
    const result = timeTracking.duplicateTimeEntry('te-1', now);

    expect(result.ok).toBe(true);
    expect(result.timeEntry).toEqual({
      id: expect.any(String),
      projectId: 'p1',
      description: 'Standup',
      start: '2026-10-08T10:15:00.000Z',
      end: '2026-10-08T11:45:00.000Z'
    });
    expect(result.timeEntry.id).not.toBe('te-1');
    expect(timeTracking.emitted).toContainEqual({
      type: 'time_entry.created',
      scope: 'timetracking',
      entityId: result.timeEntry.id,
      payload: { timeEntry: result.timeEntry }
    });
  });

  test('an entry on an archived project cannot be duplicated', () => {
    seed([{ ...existing, projectId: 'p2' }]);
    expect(timeTracking.duplicateTimeEntry('te-1', now)).toEqual({ ok: false, reason: TT_ERROR.ARCHIVED_PROJECT });
    expect(timeTracking.emitted).toEqual([]);
  });

  test('an unknown entry is rejected', () => {
    expect(timeTracking.duplicateTimeEntry('ghost', now)).toEqual({ ok: false, reason: TT_ERROR.NOT_FOUND });
  });
});

describe('deleteTimeEntry', () => {
  const existing = { id: 'te-1', projectId: 'p2', description: 'Standup', start: '2026-10-07T07:00:00.000Z', end: '2026-10-07T08:30:00.000Z' };

  beforeEach(() => {
    seed([existing]);
  });

  test('emits time_entry.deleted carrying the deleted entry', () => {
    expect(timeTracking.deleteTimeEntry('te-1')).toEqual({ ok: true });
    expect(timeTracking.emitted).toContainEqual({
      type: 'time_entry.deleted',
      scope: 'timetracking',
      entityId: 'te-1',
      payload: { timeEntry: existing }
    });
  });

  test('an unknown entry is rejected', () => {
    expect(timeTracking.deleteTimeEntry('ghost')).toEqual({ ok: false, reason: TT_ERROR.NOT_FOUND });
    expect(timeTracking.emitted).toEqual([]);
  });
});
