import { createStorageTimeTracking } from './timetracking-api-storage.js';

// Module-level commands for the panels not yet handed the Time Tracking interface (#336).
const timeTracking = createStorageTimeTracking();

export const {
  addCustomer, updateCustomerName, updateCustomerWorkWeek, setCustomerArchived, deleteCustomer,
  addProject, updateProjectName, setProjectArchived, deleteProject,
  addTimeEntry, updateTimeEntry, duplicateTimeEntry, deleteTimeEntry,
  settings: loadTimeTrackingSettings,
  saveSettings: saveTimeTrackingSettings
} = timeTracking;
