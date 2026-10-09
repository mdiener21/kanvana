import { projectById, customerById } from './timetracking-crud.js';

export const ALL_ENTRIES = Object.freeze({ customerId: null, projectId: null });

export function filterEntries(tt, filter) {
  const { customerId, projectId } = filter;
  if (!customerId && !projectId) return tt.timeEntries;
  return tt.timeEntries.filter((entry) => {
    if (projectId && entry.projectId !== projectId) return false;
    return !customerId || projectById(tt, entry.projectId)?.customerId === customerId;
  });
}

export function filterOptions(tt, filter) {
  const customers = tt.customers.map(({ id, name, archived }) => ({ id, name, archived: !!archived }));
  const projectGroups = tt.customers
    .filter((customer) => !filter.customerId || customer.id === filter.customerId)
    .map((customer) => ({
      customer: { id: customer.id, name: customer.name },
      projects: tt.projects
        .filter((p) => p.customerId === customer.id)
        .map(({ id, name, archived }) => ({ id, name, archived: !!archived }))
    }))
    .filter((group) => group.projects.length > 0);
  return { customers, projectGroups };
}

export function reconcileFilter(tt, filter) {
  const customerId = customerById(tt, filter.customerId) ? filter.customerId : null;
  const project = projectById(tt, filter.projectId);
  const projectFits = project && (!customerId || project.customerId === customerId);
  return { customerId, projectId: projectFits ? filter.projectId : null };
}
