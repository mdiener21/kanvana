// The Time Tracking interface a page creates once and hands to its panels: current state, settings,
// display prefs, device prefs, commands and change subscription. It loads no storage or emitter
// itself; an adapter supplies them (`timetracking-api-storage.js` in the app, a reducer-backed one in tests).
import { createCustomer, createProject, createTimeEntry } from './schema.js';
import { EVENT_SCOPE, TT_COLOR_PALETTE } from './constants.js';
import { floorToMinute, timeTrackingPrefs } from './timetracking-time.js';
import {
  CRUD_ERROR, projectById, customerById, isCustomerInUse, isProjectInUse, activeProjectsOf,
  validateCustomerName, validateProjectName, validateTimeEntry,
  WORK_WEEK_FIELDS, resolveWorkWeek, patchWorkWeek
} from './timetracking-model.js';
import {
  resolveTimeTrackingSettings, loadLastUsedProjectId, rememberLastUsedProject,
  loadReportPeriodKind, rememberReportPeriodKind
} from './timetracking-settings.js';

const EDITABLE_ENTRY_FIELDS = ['projectId', 'description', 'start', 'end'];

const nextColorIndex = (collection) => collection.length % TT_COLOR_PALETTE.length;

function normaliseEntryFields({ projectId, description = '', start, end }) {
  return {
    projectId,
    description: description.trim(),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString()
  };
}

const findTimeEntry = (tt, id) => tt.timeEntries.find((e) => e.id === id) ?? null;

// port: { readTimeTracking(), readGlobalSettings(), emit(event), subscribe(listener) → unsubscribe, device }
// `emit` takes scheduleDomainEvent's input; `device` is a localStorage-like store for per-device prefs.
export function createTimeTracking({ readTimeTracking, readGlobalSettings, emit, subscribe, device }) {
  const storedSettings = () => {
    const stored = readGlobalSettings().timeTracking;
    return stored && typeof stored === 'object' ? stored : {};
  };
  const settings = () => resolveTimeTrackingSettings(storedSettings());

  function addCustomer(rawName) {
    const tt = readTimeTracking();
    const validation = validateCustomerName(rawName, tt.customers);
    if (!validation.ok) return validation;
    const customer = createCustomer({ name: validation.name }, nextColorIndex(tt.customers));
    emit({ type: 'customer.created', scope: EVENT_SCOPE.TIMETRACKING, entityId: customer.id, payload: { customer } });
    return { ok: true, customer };
  }

  function updateName(entity, item, validation) {
    if (!item) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
    if (!validation.ok) return validation;
    if (item.name !== validation.name) emit({
      type: `${entity}.updated`, scope: EVENT_SCOPE.TIMETRACKING, entityId: item.id,
      payload: { fields: { name: validation.name }, before: { name: item.name } }
    });
    return { ok: true };
  }

  function updateCustomerName(id, rawName) {
    const tt = readTimeTracking();
    return updateName('customer', customerById(tt, id), validateCustomerName(rawName, tt.customers, id));
  }

  // Archived Customers stay editable: their Work week still shapes their past Balance.
  function updateCustomerWorkWeek(id, patch) {
    const customer = customerById(readTimeTracking(), id);
    if (!customer) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
    const current = resolveWorkWeek(customer);
    const next = patchWorkWeek(current, patch);
    if (!next) return { ok: false, reason: CRUD_ERROR.INVALID_WORK_WEEK };
    const changed = WORK_WEEK_FIELDS.filter((key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]));
    if (changed.length === 0) return { ok: true, changed: false };
    emit({
      type: 'customer.updated', scope: EVENT_SCOPE.TIMETRACKING, entityId: id,
      payload: {
        fields: Object.fromEntries(changed.map((key) => [key, next[key]])),
        before: Object.fromEntries(changed.map((key) => [key, current[key]]))
      }
    });
    return { ok: true, changed: true };
  }

  function addProject(customerId, rawName) {
    const tt = readTimeTracking();
    const validation = validateProjectName(rawName, customerId, tt.projects);
    if (!validation.ok) return validation;
    const project = createProject({ customerId, name: validation.name }, nextColorIndex(tt.projects));
    emit({ type: 'project.created', scope: EVENT_SCOPE.TIMETRACKING, entityId: project.id, payload: { project } });
    return { ok: true, project };
  }

  function updateProjectName(id, rawName) {
    const tt = readTimeTracking();
    const project = projectById(tt, id);
    return updateName('project', project, validateProjectName(rawName, project?.customerId, tt.projects, id));
  }

  function addTimeEntry(fields) {
    const validation = validateTimeEntry(fields, readTimeTracking());
    if (!validation.ok) return validation;
    const timeEntry = createTimeEntry(normaliseEntryFields(fields));
    emit({ type: 'time_entry.created', scope: EVENT_SCOPE.TIMETRACKING, entityId: timeEntry.id, payload: { timeEntry } });
    return { ok: true, timeEntry };
  }

  function updateTimeEntry(id, fields) {
    const tt = readTimeTracking();
    const entry = findTimeEntry(tt, id);
    if (!entry) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
    const validation = validateTimeEntry(fields, tt, { keepProjectId: entry.projectId });
    if (!validation.ok) return validation;
    const next = normaliseEntryFields(fields);
    const changedKeys = EDITABLE_ENTRY_FIELDS.filter((key) => next[key] !== entry[key]);
    if (changedKeys.length === 0) return { ok: true, changed: false };
    emit({
      type: 'time_entry.updated', scope: EVENT_SCOPE.TIMETRACKING, entityId: id,
      payload: {
        fields: Object.fromEntries(changedKeys.map((key) => [key, next[key]])),
        before: Object.fromEntries(changedKeys.map((key) => [key, entry[key]]))
      }
    });
    return { ok: true, changed: true };
  }

  function duplicateTimeEntry(id, now = Date.now()) {
    const entry = findTimeEntry(readTimeTracking(), id);
    if (!entry) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
    const startMs = floorToMinute(now);
    const durationMs = Date.parse(entry.end) - Date.parse(entry.start);
    return addTimeEntry({
      projectId: entry.projectId,
      description: entry.description,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + durationMs).toISOString()
    });
  }

  function deleteTimeEntry(id) {
    const entry = findTimeEntry(readTimeTracking(), id);
    if (!entry) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
    emit({ type: 'time_entry.deleted', scope: EVENT_SCOPE.TIMETRACKING, entityId: id, payload: { timeEntry: { ...entry } } });
    return { ok: true };
  }

  function setArchived(entity, collection, id, archived) {
    const item = readTimeTracking()[collection].find((x) => x.id === id);
    if (!item) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
    if (!!item.archived === archived) return { ok: true };
    emit({ type: `${entity}.${archived ? 'archived' : 'unarchived'}`, scope: EVENT_SCOPE.TIMETRACKING, entityId: id, payload: {} });
    return { ok: true };
  }

  function deleteGuarded(entity, collection, id, inUse) {
    const tt = readTimeTracking();
    const item = tt[collection].find((x) => x.id === id);
    if (!item) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
    if (inUse(tt, id)) return { ok: false, reason: CRUD_ERROR.IN_USE };
    emit({ type: `${entity}.deleted`, scope: EVENT_SCOPE.TIMETRACKING, entityId: id, payload: { [entity]: { ...item } } });
    return { ok: true };
  }

  // Persists only what the user chose: unset fields (notably timezone) keep resolving per device.
  function saveSettings(patch) {
    const next = { ...storedSettings(), ...patch };
    if ('defaultCustomerId' in patch) {
      next.defaultProjectId = next.defaultCustomerId
        ? activeProjectsOf(readTimeTracking(), next.defaultCustomerId)[0]?.id ?? null
        : null;
    }
    emit({
      type: 'settings.updated', scope: EVENT_SCOPE.GLOBAL, entityId: 'timeTracking',
      payload: { fields: { timeTracking: next } }
    });
    return resolveTimeTrackingSettings(next);
  }

  return {
    state: () => readTimeTracking(),
    settings,
    prefs: () => timeTrackingPrefs(settings()),
    subscribe,
    lastUsedProjectId: () => loadLastUsedProjectId(device),
    rememberLastUsedProject: (projectId) => rememberLastUsedProject(projectId, device),
    reportPeriodKind: () => loadReportPeriodKind(device),
    rememberReportPeriodKind: (kind) => rememberReportPeriodKind(kind, device),
    addTimeEntry,
    updateTimeEntry,
    duplicateTimeEntry,
    deleteTimeEntry,
    addCustomer,
    updateCustomerName,
    updateCustomerWorkWeek,
    setCustomerArchived: (id, archived) => setArchived('customer', 'customers', id, archived),
    deleteCustomer: (id) => deleteGuarded('customer', 'customers', id, isCustomerInUse),
    addProject,
    updateProjectName,
    setProjectArchived: (id, archived) => setArchived('project', 'projects', id, archived),
    deleteProject: (id) => deleteGuarded('project', 'projects', id, isProjectInUse),
    saveSettings
  };
}
