import { describe, test, expect } from 'vitest';
import {
  ALL_ENTRIES, filterEntries, filterOptions, reconcileFilter
} from '../../../src/modules/timetracking-filter.js';

const tt = {
  customers: [
    { id: 'c1', name: 'Acme', archived: false },
    { id: 'c2', name: 'Old Co', archived: true }
  ],
  projects: [
    { id: 'p1', customerId: 'c1', name: 'Website', archived: false },
    { id: 'p2', customerId: 'c1', name: 'Legacy', archived: true },
    { id: 'p3', customerId: 'c2', name: 'Support', archived: false }
  ],
  timeEntries: [
    { id: 'e1', projectId: 'p1' },
    { id: 'e2', projectId: 'p2' },
    { id: 'e3', projectId: 'p3' },
    { id: 'e4', projectId: 'ghost' }
  ]
};

const ids = (entries) => entries.map((e) => e.id);

describe('filterEntries', () => {
  test('All keeps every entry', () => {
    expect(ids(filterEntries(tt, ALL_ENTRIES))).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  test('by customer keeps entries of all that customer\'s projects, archived ones included', () => {
    expect(ids(filterEntries(tt, { customerId: 'c1', projectId: null }))).toEqual(['e1', 'e2']);
    expect(ids(filterEntries(tt, { customerId: 'c2', projectId: null }))).toEqual(['e3']);
  });

  test('by project keeps only that project\'s entries', () => {
    expect(ids(filterEntries(tt, { customerId: null, projectId: 'p2' }))).toEqual(['e2']);
  });

  test('by customer and project', () => {
    expect(ids(filterEntries(tt, { customerId: 'c1', projectId: 'p1' }))).toEqual(['e1']);
  });

  test('entries of an unknown project only show under All', () => {
    expect(ids(filterEntries(tt, { customerId: 'c1', projectId: null }))).not.toContain('e4');
  });
});

describe('filterOptions', () => {
  test('lists every customer, archived ones marked', () => {
    expect(filterOptions(tt, ALL_ENTRIES).customers).toEqual([
      { id: 'c1', name: 'Acme', archived: false },
      { id: 'c2', name: 'Old Co', archived: true }
    ]);
  });

  test('with no customer selected, projects of every customer are offered, grouped by customer', () => {
    const { projectGroups } = filterOptions(tt, ALL_ENTRIES);
    expect(projectGroups.map((g) => g.customer.name)).toEqual(['Acme', 'Old Co']);
    expect(projectGroups[0].projects.map((p) => [p.name, p.archived])).toEqual([['Website', false], ['Legacy', true]]);
    expect(projectGroups[1].projects.map((p) => p.name)).toEqual(['Support']);
  });

  test('with a customer selected, only that customer\'s projects are offered', () => {
    const { projectGroups } = filterOptions(tt, { customerId: 'c2', projectId: null });
    expect(projectGroups).toHaveLength(1);
    expect(projectGroups[0].projects.map((p) => p.id)).toEqual(['p3']);
  });

  test('a customer without projects is not an empty project group', () => {
    const withEmpty = { ...tt, customers: [...tt.customers, { id: 'c3', name: 'New', archived: false }] };
    expect(filterOptions(withEmpty, ALL_ENTRIES).projectGroups.map((g) => g.customer.id)).toEqual(['c1', 'c2']);
  });
});

describe('reconcileFilter', () => {
  test('keeps a compatible selection', () => {
    expect(reconcileFilter(tt, { customerId: 'c1', projectId: 'p2' })).toEqual({ customerId: 'c1', projectId: 'p2' });
  });

  test('clears a project that does not belong to the selected customer', () => {
    expect(reconcileFilter(tt, { customerId: 'c2', projectId: 'p1' })).toEqual({ customerId: 'c2', projectId: null });
  });

  test('clears selections that no longer exist', () => {
    expect(reconcileFilter(tt, { customerId: 'gone', projectId: 'p1' })).toEqual({ customerId: null, projectId: 'p1' });
    expect(reconcileFilter(tt, { customerId: null, projectId: 'gone' })).toEqual(ALL_ENTRIES);
  });
});
