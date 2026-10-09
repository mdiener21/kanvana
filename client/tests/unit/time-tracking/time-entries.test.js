import { beforeEach, describe, test, expect, vi } from 'vitest';

vi.mock('../../../src/modules/event-sourcing/emitter.js', () => ({
  scheduleDomainEvent: vi.fn(() => Promise.resolve())
}));

vi.mock('../../../src/modules/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadTimeTracking: vi.fn()
}));

const { addTimeEntry, validateTimeEntry, CRUD_ERROR } = await import('../../../src/modules/timetracking-crud.js');
const { loadTimeTracking } = await import('../../../src/modules/storage.js');
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadTimeTracking).mockReturnValue(tt);
});

describe('validateTimeEntry', () => {
  test.each([
    ['no project', { projectId: '' }, CRUD_ERROR.NO_PROJECT],
    ['unknown project', { projectId: 'nope' }, CRUD_ERROR.NO_PROJECT],
    ['archived project', { projectId: 'p2' }, CRUD_ERROR.ARCHIVED_PROJECT],
    ['project of an archived customer', { projectId: 'p3' }, CRUD_ERROR.ARCHIVED_PROJECT],
    ['missing start', { start: '' }, CRUD_ERROR.INVALID_TIME],
    ['unparsable end', { end: 'later' }, CRUD_ERROR.INVALID_TIME],
    ['zero duration', { end: valid.start }, CRUD_ERROR.ZERO_DURATION],
    ['negative duration', { end: '2026-10-31T20:00:00.000Z' }, CRUD_ERROR.ZERO_DURATION]
  ])('%s is rejected', (_name, overrides, reason) => {
    expect(validateTimeEntry({ ...valid, ...overrides }, tt)).toEqual({ ok: false, reason });
  });

  test('a project is checked before the times', () => {
    expect(validateTimeEntry({ ...valid, projectId: '', end: valid.start }, tt).reason).toBe(CRUD_ERROR.NO_PROJECT);
  });

  test('a valid entry passes', () => {
    expect(validateTimeEntry(valid, tt)).toEqual({ ok: true });
  });
});

describe('addTimeEntry', () => {
  test('emits time_entry.created in the timetracking scope with absolute instants', () => {
    const result = addTimeEntry(valid);

    expect(result.ok).toBe(true);
    expect(result.timeEntry).toEqual({
      id: expect.any(String),
      projectId: 'p1',
      description: 'Standup',
      start: '2026-10-31T21:00:00.000Z',
      end: '2026-11-01T01:00:00.000Z'
    });
    expect(scheduleDomainEvent).toHaveBeenCalledOnce();
    expect(scheduleDomainEvent).toHaveBeenCalledWith({
      type: 'time_entry.created',
      scope: 'timetracking',
      entityId: result.timeEntry.id,
      payload: { timeEntry: result.timeEntry }
    });
  });

  test('normalises instants to UTC ISO strings', () => {
    const result = addTimeEntry({ ...valid, start: '2026-10-08T09:00:00+02:00', end: '2026-10-08T10:00:00+02:00' });
    expect(result.timeEntry).toMatchObject({ start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' });
  });

  test('invalid entries save nothing', () => {
    expect(addTimeEntry({ ...valid, projectId: 'p2' })).toEqual({ ok: false, reason: CRUD_ERROR.ARCHIVED_PROJECT });
    expect(addTimeEntry({ ...valid, end: valid.start })).toEqual({ ok: false, reason: CRUD_ERROR.ZERO_DURATION });
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });
});
