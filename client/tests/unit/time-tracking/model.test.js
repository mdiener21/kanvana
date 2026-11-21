import { describe, test, expect } from 'vitest';
import {
  TT_ERROR, projectById, customerById, isProjectActive, activeProjectsOf, isCustomerInUse, isProjectInUse,
  validateCustomerName, validateProjectName, validateTimeEntry,
  hasTarget, resolveWorkWeek, patchWorkWeek, customerWorkWeek, prefillProjectId
} from '../../../src/modules/timetracking-model.js';

const ACME = { id: 'c1', name: 'Acme', color: '#000', archived: false, weeklyHours: 40, workdays: [1, 2, 3, 4] };
const OLD_CO = { id: 'c2', name: 'Old Co', color: '#111', archived: true };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false };
const LEGACY = { id: 'p2', customerId: 'c1', name: 'Legacy', color: '#000', archived: true };
const SUPPORT = { id: 'p3', customerId: 'c2', name: 'Support', color: '#000', archived: false };
const APP = { id: 'p4', customerId: 'c1', name: 'App', color: '#000', archived: false };
const ENTRY = { id: 'e1', projectId: 'p1', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };
const tt = { customers: [ACME, OLD_CO], projects: [WEBSITE, LEGACY, SUPPORT, APP], timeEntries: [ENTRY] };
const span = { start: ENTRY.start, end: ENTRY.end };

describe('lookups', () => {
  test('finds a project and a customer by id, or null when unknown', () => {
    expect(projectById(tt, 'p3')).toBe(SUPPORT);
    expect(customerById(tt, 'c2')).toBe(OLD_CO);
    expect(projectById(tt, 'nope')).toBeNull();
    expect(customerById(tt, null)).toBeNull();
  });
});

describe('active and in-use rules', () => {
  test('a project is active only while it and its existing customer are not archived', () => {
    const orphan = { id: 'p9', customerId: 'gone', archived: false };
    expect(isProjectActive(WEBSITE, tt)).toBe(true);
    expect(isProjectActive(LEGACY, tt)).toBe(false);
    expect(isProjectActive(SUPPORT, tt)).toBe(false);
    expect(isProjectActive(orphan, { ...tt, projects: [orphan] })).toBe(false);
    expect(isProjectActive(null, tt)).toBe(false);
  });

  test('the active projects of a customer leave out archived ones', () => {
    expect(activeProjectsOf(tt, 'c1').map((p) => p.id)).toEqual(['p1', 'p4']);
    expect(activeProjectsOf(tt, 'c2')).toEqual([]);
  });

  test('a customer with projects and a project with entries are in use', () => {
    expect(isCustomerInUse(tt, 'c1')).toBe(true);
    expect(isCustomerInUse({ ...tt, projects: [] }, 'c1')).toBe(false);
    expect(isProjectInUse(tt, 'p1')).toBe(true);
    expect(isProjectInUse(tt, 'p4')).toBe(false);
  });
});

describe('validation', () => {
  test('a customer name is trimmed and must be unique, ignoring case', () => {
    expect(validateCustomerName('  Globex ', tt.customers)).toEqual({ ok: true, name: 'Globex' });
    expect(validateCustomerName(' ', tt.customers).reason).toBe(TT_ERROR.EMPTY_NAME);
    expect(validateCustomerName('acme', tt.customers).reason).toBe(TT_ERROR.DUPLICATE_NAME);
    expect(validateCustomerName('acme', tt.customers, 'c1').ok).toBe(true);
  });

  test('a project name needs a customer and is unique within it', () => {
    expect(validateProjectName('website', 'c1', tt.projects).reason).toBe(TT_ERROR.DUPLICATE_NAME);
    expect(validateProjectName('website', 'c2', tt.projects).ok).toBe(true);
    expect(validateProjectName('Site', null, tt.projects).reason).toBe(TT_ERROR.NO_CUSTOMER);
  });

  test('a time entry needs an active project and a positive span', () => {
    expect(validateTimeEntry({ projectId: 'p1', ...span }, tt)).toEqual({ ok: true });
    expect(validateTimeEntry({ projectId: 'zz', ...span }, tt).reason).toBe(TT_ERROR.NO_PROJECT);
    expect(validateTimeEntry({ projectId: 'p2', ...span }, tt).reason).toBe(TT_ERROR.ARCHIVED_PROJECT);
    expect(validateTimeEntry({ projectId: 'p1', start: 'x', end: span.end }, tt).reason).toBe(TT_ERROR.INVALID_TIME);
    expect(validateTimeEntry({ projectId: 'p1', start: span.end, end: span.end }, tt).reason)
      .toBe(TT_ERROR.ZERO_DURATION);
  });

  test('an edited entry may stay on its own archived project', () => {
    expect(validateTimeEntry({ projectId: 'p2', ...span }, tt, { keepProjectId: 'p2' }).ok).toBe(true);
  });
});

describe('work week', () => {
  test('the work week of a customer resolves from its fields; an unknown customer has no target', () => {
    expect(customerWorkWeek(tt, 'c1')).toEqual({ weeklyHours: 40, workdays: [1, 2, 3, 4] });
    expect(customerWorkWeek(tt, 'nope')).toEqual({ weeklyHours: null, workdays: [1, 2, 3, 4, 5] });
    expect(hasTarget(customerWorkWeek(tt, 'nope'))).toBe(false);
  });

  test('a work week edit is rejected rather than repaired', () => {
    const week = resolveWorkWeek(ACME);
    expect(patchWorkWeek(week, { workdays: [5, 1] })).toEqual({ weeklyHours: 40, workdays: [1, 5] });
    expect(patchWorkWeek(week, { weeklyHours: null }).weeklyHours).toBeNull();
    expect(patchWorkWeek(week, { weeklyHours: -1 })).toBeNull();
    expect(patchWorkWeek(week, { workdays: [] })).toBeNull();
  });
});

describe('prefill', () => {
  test('a new entry starts on the last-used project while it is active, else on the default', () => {
    expect(prefillProjectId(tt, { defaultProjectId: 'p1' }, 'p4')).toBe('p4');
    expect(prefillProjectId(tt, { defaultProjectId: 'p1' }, 'p2')).toBe('p1');
    expect(prefillProjectId(tt, { defaultProjectId: 'p3' }, null)).toBeNull();
  });
});
