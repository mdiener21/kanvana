// Reference rules shared by CRUD (UI guard) and the reducer (replay guard):
// a referenced Customer or Project can be archived but never deleted.
export const isCustomerInUse = (tt, customerId) => tt.projects.some((p) => p.customerId === customerId);
export const isProjectInUse = (tt, projectId) => tt.timeEntries.some((e) => e.projectId === projectId);
