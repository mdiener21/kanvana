import { beforeEach, describe, test, expect } from 'vitest';
import { createTestTimeTracking } from '../../fixtures/time-tracking.js';
import {
  isCustomerInUse, isProjectInUse, isProjectActive, validateTimeEntry, CRUD_ERROR
} from '../../../src/modules/timetracking-model.js';
import { pickableProjects } from '../../../src/modules/timetracking-entry-fields.js';

const ACME = { id: 'c1', name: 'Acme', color: '#000', archived: false };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false };

let tt = null;

function seed({ customers = [ACME], projects = [WEBSITE], timeEntries = [] } = {}) {
  tt = createTestTimeTracking({ customers, projects, timeEntries });
}

beforeEach(() => {
  seed();
});

describe('archive / unarchive', () => {
  test('archiving a customer emits customer.archived', () => {
    expect(tt.setCustomerArchived('c1', true)).toEqual({ ok: true });
    expect(tt.emitted).toContainEqual({
      type: 'customer.archived', scope: 'timetracking', entityId: 'c1', payload: {}
    });
  });

  test('unarchiving a project emits project.unarchived', () => {
    seed({ projects: [{ ...WEBSITE, archived: true }] });
    expect(tt.setProjectArchived('p1', false)).toEqual({ ok: true });
    expect(tt.emitted).toContainEqual({
      type: 'project.unarchived', scope: 'timetracking', entityId: 'p1', payload: {}
    });
  });

  test('archiving an already archived item emits nothing', () => {
    seed({ projects: [{ ...WEBSITE, archived: true }] });
    expect(tt.setProjectArchived('p1', true)).toEqual({ ok: true });
    expect(tt.emitted).toEqual([]);
  });

  test('an unknown id is rejected', () => {
    expect(tt.setCustomerArchived('ghost', true)).toEqual({ ok: false, reason: CRUD_ERROR.NOT_FOUND });
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
    expect(tt.deleteProject('p1')).toEqual({ ok: true });
    expect(tt.emitted).toContainEqual({
      type: 'project.deleted', scope: 'timetracking', entityId: 'p1', payload: { project: WEBSITE }
    });
  });

  test('deleting an unreferenced customer emits customer.deleted with the customer', () => {
    seed({ projects: [] });
    expect(tt.deleteCustomer('c1')).toEqual({ ok: true });
    expect(tt.emitted).toContainEqual({
      type: 'customer.deleted', scope: 'timetracking', entityId: 'c1', payload: { customer: ACME }
    });
  });

  test('a referenced project or customer is not deleted', () => {
    seed({ timeEntries: [entry] });
    expect(tt.deleteProject('p1')).toEqual({ ok: false, reason: CRUD_ERROR.IN_USE });
    expect(tt.deleteCustomer('c1')).toEqual({ ok: false, reason: CRUD_ERROR.IN_USE });
    expect(tt.emitted).toEqual([]);
  });

  test('deleting an unknown id is rejected', () => {
    expect(tt.deleteProject('ghost')).toEqual({ ok: false, reason: CRUD_ERROR.NOT_FOUND });
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

  test('a project whose customer is missing is not selectable', () => {
    const orphan = { id: 'p9', customerId: 'gone', name: 'Orphan', color: '#000', archived: false };
    const withOrphan = { ...tt, projects: [...tt.projects, orphan] };
    expect(isProjectActive(orphan, withOrphan)).toBe(false);
    expect(pickableProjects(withOrphan).map((p) => p.id)).toEqual(['p1']);
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
