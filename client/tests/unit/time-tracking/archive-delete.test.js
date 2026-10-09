import { beforeEach, describe, test, expect, vi } from 'vitest';

vi.mock('../../../src/modules/event-sourcing/emitter.js', () => ({
  scheduleDomainEvent: vi.fn(() => Promise.resolve())
}));

vi.mock('../../../src/modules/storage.js', () => ({
  loadTimeTracking: vi.fn()
}));

const {
  setCustomerArchived, setProjectArchived, deleteCustomer, deleteProject,
  isCustomerInUse, isProjectInUse, isProjectActive, validateTimeEntry, CRUD_ERROR
} = await import('../../../src/modules/timetracking-crud.js');
const { pickableProjects } = await import('../../../src/modules/timetracking-entry-fields.js');
const { loadTimeTracking } = await import('../../../src/modules/storage.js');
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');

const ACME = { id: 'c1', name: 'Acme', color: '#000', archived: false };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false };

function seed({ customers = [ACME], projects = [WEBSITE], timeEntries = [] } = {}) {
  vi.mocked(loadTimeTracking).mockReturnValue({ customers, projects, timeEntries });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe('archive / unarchive', () => {
  test('archiving a customer emits customer.archived', () => {
    expect(setCustomerArchived('c1', true)).toEqual({ ok: true });
    expect(scheduleDomainEvent).toHaveBeenCalledWith({
      type: 'customer.archived', scope: 'timetracking', entityId: 'c1', payload: {}
    });
  });

  test('unarchiving a project emits project.unarchived', () => {
    seed({ projects: [{ ...WEBSITE, archived: true }] });
    expect(setProjectArchived('p1', false)).toEqual({ ok: true });
    expect(scheduleDomainEvent).toHaveBeenCalledWith({
      type: 'project.unarchived', scope: 'timetracking', entityId: 'p1', payload: {}
    });
  });

  test('archiving an already archived item emits nothing', () => {
    seed({ projects: [{ ...WEBSITE, archived: true }] });
    expect(setProjectArchived('p1', true)).toEqual({ ok: true });
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('an unknown id is rejected', () => {
    expect(setCustomerArchived('ghost', true)).toEqual({ ok: false, reason: CRUD_ERROR.NOT_FOUND });
  });
});

describe('reference guard', () => {
  const entry = { id: 'e1', projectId: 'p1', description: '', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };

  test('a customer is in use while it has projects, archived or not', () => {
    const tt = { customers: [ACME], projects: [{ ...WEBSITE, archived: true }], timeEntries: [] };
    expect(isCustomerInUse(tt, 'c1')).toBe(true);
    expect(isCustomerInUse({ ...tt, projects: [] }, 'c1')).toBe(false);
  });

  test('a project is in use while it has time entries', () => {
    const tt = { customers: [ACME], projects: [WEBSITE], timeEntries: [entry] };
    expect(isProjectInUse(tt, 'p1')).toBe(true);
    expect(isProjectInUse({ ...tt, timeEntries: [] }, 'p1')).toBe(false);
  });

  test('deleting an unreferenced project emits project.deleted with the project', () => {
    expect(deleteProject('p1')).toEqual({ ok: true });
    expect(scheduleDomainEvent).toHaveBeenCalledWith({
      type: 'project.deleted', scope: 'timetracking', entityId: 'p1', payload: { project: WEBSITE }
    });
  });

  test('deleting an unreferenced customer emits customer.deleted with the customer', () => {
    seed({ projects: [] });
    expect(deleteCustomer('c1')).toEqual({ ok: true });
    expect(scheduleDomainEvent).toHaveBeenCalledWith({
      type: 'customer.deleted', scope: 'timetracking', entityId: 'c1', payload: { customer: ACME }
    });
  });

  test('a referenced project or customer is not deleted', () => {
    seed({ timeEntries: [entry] });
    expect(deleteProject('p1')).toEqual({ ok: false, reason: CRUD_ERROR.IN_USE });
    expect(deleteCustomer('c1')).toEqual({ ok: false, reason: CRUD_ERROR.IN_USE });
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('deleting an unknown id is rejected', () => {
    expect(deleteProject('ghost')).toEqual({ ok: false, reason: CRUD_ERROR.NOT_FOUND });
  });
});

describe('archive filtering', () => {
  const OLD_CO = { id: 'c2', name: 'Old Co', color: '#111', archived: true };
  const LEGACY = { id: 'p2', customerId: 'c1', name: 'Legacy', color: '#000', archived: true };
  const SUPPORT = { id: 'p3', customerId: 'c2', name: 'Support', color: '#000', archived: false };
  const tt = { customers: [ACME, OLD_CO], projects: [WEBSITE, LEGACY, SUPPORT], timeEntries: [] };
  const span = { start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };

  test('a project is selectable only when neither it nor its customer is archived', () => {
    expect(isProjectActive(WEBSITE, tt)).toBe(true);
    expect(isProjectActive(LEGACY, tt)).toBe(false);
    expect(isProjectActive(SUPPORT, tt)).toBe(false);
    expect(isProjectActive(null, tt)).toBe(false);
  });

  test('the picker offers only selectable projects', () => {
    expect(pickableProjects(tt).map((p) => p.id)).toEqual(['p1']);
  });

  test('validation rejects archived projects and projects of archived customers', () => {
    expect(validateTimeEntry({ projectId: 'p1', ...span }, tt).ok).toBe(true);
    expect(validateTimeEntry({ projectId: 'p2', ...span }, tt).reason).toBe(CRUD_ERROR.ARCHIVED_PROJECT);
    expect(validateTimeEntry({ projectId: 'p3', ...span }, tt).reason).toBe(CRUD_ERROR.ARCHIVED_PROJECT);
  });
});
