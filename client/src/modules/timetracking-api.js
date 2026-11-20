// Loads no storage or emitter itself, so tests can back it with the real reducer instead of IndexedDB.
import { createCustomer, createProject, createTimeEntry } from './schema.js';
import { EVENT_SCOPE, TT_COLOR_PALETTE } from './constants.js';
import { floorToMinute, timeTrackingPrefs } from './timetracking-time.js';
import {
  TT_ERROR, projectById, customerById, isCustomerInUse, isProjectInUse, activeProjectsOf,
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

const pick = (obj, keys) => Object.fromEntries(keys.map((key) => [key, obj[key]]));
const fieldChange = (keys, next, before) => ({ fields: pick(next, keys), before: pick(before, keys) });

const KINDS = {
  customer: { byId: customerById, inUse: isCustomerInUse },
  project: { byId: projectById, inUse: isProjectInUse }
};

// `emit` takes scheduleDomainEvent's input; `device` is a localStorage-like store for per-device prefs.
export function createTimeTracking({ readTimeTracking, readGlobalSettings, emit, subscribe, device }) {
  const emitTT = (type, entityId, payload) => emit({ type, scope: EVENT_SCOPE.TIMETRACKING, entityId, payload });
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
    emitTT('customer.created', customer.id, { customer });
    return { ok: true, customer };
  }

  function updateName(entity, item, validation) {
    if (!item) return { ok: false, reason: TT_ERROR.NOT_FOUND };
    if (!validation.ok) return validation;
    if (item.name !== validation.name) {
      emitTT(`${entity}.updated`, item.id, fieldChange(['name'], validation, item));
    }
    return { ok: true };
  }

  function updateCustomerName(id, rawName) {
    const tt = readTimeTracking();
    return updateName('customer', customerById(tt, id), validateCustomerName(rawName, tt.customers, id));
  }

  // Archived Customers stay editable: their Work week still shapes their past Balance.
  function updateCustomerWorkWeek(id, patch) {
    const customer = customerById(readTimeTracking(), id);
    if (!customer) return { ok: false, reason: TT_ERROR.NOT_FOUND };
    const current = resolveWorkWeek(customer);
    const next = patchWorkWeek(current, patch);
    if (!next) return { ok: false, reason: TT_ERROR.INVALID_WORK_WEEK };
    const changed = WORK_WEEK_FIELDS.filter((key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]));
    if (changed.length === 0) return { ok: true, changed: false };
    emitTT('customer.updated', id, fieldChange(changed, next, current));
    return { ok: true, changed: true };
  }

  function addProject(customerId, rawName) {
    const tt = readTimeTracking();
    const validation = validateProjectName(rawName, customerId, tt.projects);
    if (!validation.ok) return validation;
    const project = createProject({ customerId, name: validation.name }, nextColorIndex(tt.projects));
    emitTT('project.created', project.id, { project });
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
    emitTT('time_entry.created', timeEntry.id, { timeEntry });
    return { ok: true, timeEntry };
  }

  function updateTimeEntry(id, fields) {
    const tt = readTimeTracking();
    const entry = findTimeEntry(tt, id);
    if (!entry) return { ok: false, reason: TT_ERROR.NOT_FOUND };
    const validation = validateTimeEntry(fields, tt, { keepProjectId: entry.projectId });
    if (!validation.ok) return validation;
    const next = normaliseEntryFields(fields);
    const changedKeys = EDITABLE_ENTRY_FIELDS.filter((key) => next[key] !== entry[key]);
    if (changedKeys.length === 0) return { ok: true, changed: false };
    emitTT('time_entry.updated', id, fieldChange(changedKeys, next, entry));
    return { ok: true, changed: true };
  }

  function duplicateTimeEntry(id, now = Date.now()) {
    const entry = findTimeEntry(readTimeTracking(), id);
    if (!entry) return { ok: false, reason: TT_ERROR.NOT_FOUND };
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
    if (!entry) return { ok: false, reason: TT_ERROR.NOT_FOUND };
    emitTT('time_entry.deleted', id, { timeEntry: { ...entry } });
    return { ok: true };
  }

  function setArchived(entity, id, archived) {
    const item = KINDS[entity].byId(readTimeTracking(), id);
    if (!item) return { ok: false, reason: TT_ERROR.NOT_FOUND };
    if (!!item.archived === archived) return { ok: true };
    emitTT(`${entity}.${archived ? 'archived' : 'unarchived'}`, id, {});
    return { ok: true };
  }

  function deleteGuarded(entity, id) {
    const tt = readTimeTracking();
    const item = KINDS[entity].byId(tt, id);
    if (!item) return { ok: false, reason: TT_ERROR.NOT_FOUND };
    if (KINDS[entity].inUse(tt, id)) return { ok: false, reason: TT_ERROR.IN_USE };
    emitTT(`${entity}.deleted`, id, { [entity]: { ...item } });
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
    setCustomerArchived: (id, archived) => setArchived('customer', id, archived),
    deleteCustomer: (id) => deleteGuarded('customer', id),
    addProject,
    updateProjectName,
    setProjectArchived: (id, archived) => setArchived('project', id, archived),
    deleteProject: (id) => deleteGuarded('project', id),
    saveSettings
  };
}
