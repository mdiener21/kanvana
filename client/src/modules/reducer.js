import { EVENT_SCOPE, isDoneColumn } from './constants.js';

export function createTimeTrackingState(seed = {}) {
  const source = seed && typeof seed === 'object' ? seed : {};
  return {
    customers: Array.isArray(source.customers) ? source.customers : [],
    projects: Array.isArray(source.projects) ? source.projects : [],
    timeEntries: Array.isArray(source.timeEntries) ? source.timeEntries : []
  };
}

export function createProjectionState(seed = {}) {
  return {
    boards: Array.isArray(seed.boards) ? seed.boards : [],
    tasks: Array.isArray(seed.tasks) ? seed.tasks : [],
    columns: Array.isArray(seed.columns) ? seed.columns : [],
    labels: Array.isArray(seed.labels) ? seed.labels : [],
    settings: seed.settings && typeof seed.settings === 'object' ? seed.settings : {},
    globalSettings: seed.globalSettings && typeof seed.globalSettings === 'object' ? seed.globalSettings : {},
    timeTracking: createTimeTrackingState(seed.timeTracking),
    appliedEventIds: seed.appliedEventIds instanceof Set ? new Set(seed.appliedEventIds) : new Set(),
    taskTombstones: seed.taskTombstones instanceof Set ? new Set(seed.taskTombstones) : new Set()
  };
}

function cloneTimeTracking(timeTracking) {
  return {
    customers: timeTracking.customers.map((customer) => ({ ...customer })),
    projects: timeTracking.projects.map((project) => ({ ...project })),
    timeEntries: timeTracking.timeEntries.map((entry) => ({ ...entry }))
  };
}

function cloneState(state) {
  return {
    ...state,
    boards: [...state.boards],
    tasks: state.tasks.map((task) => ({
      ...task,
      ...(Array.isArray(task.labels) ? { labels: [...task.labels] } : {}),
      ...(Array.isArray(task.subTasks) ? { subTasks: task.subTasks.map((subtask) => ({ ...subtask })) } : {}),
      ...(Array.isArray(task.relationships) ? { relationships: task.relationships.map((relationship) => ({ ...relationship })) } : {}),
      ...(Array.isArray(task.columnHistory) ? { columnHistory: [...task.columnHistory] } : {})
    })),
    columns: state.columns.map((column) => ({ ...column })),
    labels: state.labels.map((label) => ({ ...label })),
    settings: { ...state.settings },
    globalSettings: { ...state.globalSettings },
    timeTracking: cloneTimeTracking(state.timeTracking),
    appliedEventIds: new Set(state.appliedEventIds),
    taskTombstones: new Set(state.taskTombstones)
  };
}

function applyTaskCreated(state, event) {
  if (state.taskTombstones.has(event.entity_id) || state.tasks.some((task) => task.id === event.entity_id)) return state;
  return {
    ...state,
    tasks: [...state.tasks, { id: event.entity_id, ...(event.payload?.task || event.payload?.fields || {}) }]
  };
}

function applyTaskUpdated(state, event) {
  if (state.taskTombstones.has(event.entity_id)) return state;
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  return {
    ...state,
    tasks: state.tasks.map((task) => (
      task.id === event.entity_id ? { ...task, ...fields } : task
    ))
  };
}

function applyTaskMoved(state, event) {
  if (state.taskTombstones.has(event.entity_id)) return state;
  const order = Array.isArray(event.payload?.order) ? event.payload.order : [];
  const orderByTaskId = new Map(order.map((entry) => [entry.id, entry]));

  return {
    ...state,
    tasks: state.tasks.map((task) => {
      const entry = orderByTaskId.get(task.id);
      if (!entry) return task;

      const nextTask = {
        ...task,
        column: typeof entry.column === 'string' ? entry.column : task.column,
        order: Number.isFinite(entry.order) ? entry.order : task.order
      };

      if (task.id === event.entity_id && task.column !== nextTask.column) {
        const history = Array.isArray(task.columnHistory) && task.columnHistory.length
          ? [...task.columnHistory]
          : [{ column: task.column, at: task.creationDate || task.changeDate || event.at }];
        history.push({ column: nextTask.column, at: event.at });
        nextTask.columnHistory = history;

        // Derive doneDate from the move so it replays from events alone (ADR-0005):
        // entering the done column stamps it, leaving clears it.
        const wasDone = isDoneColumn(state.columns.find((column) => column.id === task.column));
        const isDone = isDoneColumn(state.columns.find((column) => column.id === nextTask.column));
        if (isDone && !wasDone) {
          nextTask.doneDate = event.at;
        } else if (wasDone && !isDone) {
          delete nextTask.doneDate;
        }
      }

      return nextTask;
    })
  };
}

function applyTaskDeleted(state, event) {
  const nextTombstones = new Set(state.taskTombstones);
  nextTombstones.add(event.entity_id);
  return {
    ...state,
    tasks: state.tasks.filter((task) => task.id !== event.entity_id),
    taskTombstones: nextTombstones
  };
}

function updateTaskById(state, taskId, updater) {
  if (state.taskTombstones.has(taskId)) return state;
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? updater(task) : task))
  };
}

function applySubtaskAdded(state, event) {
  const subtask = event.payload?.subtask;
  if (!subtask || typeof subtask !== 'object') return state;
  return updateTaskById(state, event.entity_id, (task) => ({
    ...task,
    subTasks: [...(Array.isArray(task.subTasks) ? task.subTasks : []), { ...subtask }]
  }));
}

function applySubtaskRemoved(state, event) {
  const subtaskId = event.payload?.subtask_id;
  return updateTaskById(state, event.entity_id, (task) => ({
    ...task,
    subTasks: (Array.isArray(task.subTasks) ? task.subTasks : []).filter((subtask) => subtask.id !== subtaskId)
  }));
}

function applySubtaskToggled(state, event) {
  const subtaskId = event.payload?.subtask_id;
  const completed = event.payload?.completed === true;
  return updateTaskById(state, event.entity_id, (task) => ({
    ...task,
    subTasks: (Array.isArray(task.subTasks) ? task.subTasks : []).map((subtask) => (
      subtask.id === subtaskId ? { ...subtask, completed } : subtask
    ))
  }));
}

function applySubtaskTextChanged(state, event) {
  const subtaskId = event.payload?.subtask_id;
  const title = typeof event.payload?.title === 'string' ? event.payload.title : '';
  return updateTaskById(state, event.entity_id, (task) => ({
    ...task,
    subTasks: (Array.isArray(task.subTasks) ? task.subTasks : []).map((subtask) => (
      subtask.id === subtaskId ? { ...subtask, title } : subtask
    ))
  }));
}

function applyRelationshipAdded(state, event) {
  const relationship = event.payload?.relationship;
  if (!relationship || typeof relationship !== 'object') return state;
  return updateTaskById(state, event.entity_id, (task) => {
    const relationships = Array.isArray(task.relationships) ? task.relationships : [];
    const exists = relationships.some((entry) => entry.targetTaskId === relationship.targetTaskId && entry.type === relationship.type);
    return exists ? task : { ...task, relationships: [...relationships, { ...relationship }] };
  });
}

function applyRelationshipRemoved(state, event) {
  const targetTaskId = event.payload?.targetTaskId;
  const relationshipType = event.payload?.relationship_type;
  return updateTaskById(state, event.entity_id, (task) => ({
    ...task,
    relationships: (Array.isArray(task.relationships) ? task.relationships : [])
      .filter((entry) => !(entry.targetTaskId === targetTaskId && entry.type === relationshipType))
  }));
}

function applyLabelAddedToTask(state, event) {
  const labelId = event.payload?.label_id;
  if (typeof labelId !== 'string' || !labelId) return state;
  return updateTaskById(state, event.entity_id, (task) => {
    const labels = Array.isArray(task.labels) ? task.labels : [];
    return labels.includes(labelId) ? task : { ...task, labels: [...labels, labelId] };
  });
}

function applyLabelRemovedFromTask(state, event) {
  const labelId = event.payload?.label_id;
  return updateTaskById(state, event.entity_id, (task) => ({
    ...task,
    labels: (Array.isArray(task.labels) ? task.labels : []).filter((id) => id !== labelId)
  }));
}

function applyLabelCreated(state, event) {
  if (state.labels.some((label) => label.id === event.entity_id)) return state;
  return {
    ...state,
    labels: [...state.labels, { id: event.entity_id, ...(event.payload?.label || event.payload?.fields || {}) }]
  };
}

function applyLabelUpdated(state, event) {
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  return {
    ...state,
    labels: state.labels.map((label) => (label.id === event.entity_id ? { ...label, ...fields } : label))
  };
}

function applyLabelDeleted(state, event) {
  return {
    ...state,
    labels: state.labels.map((label) => (label.id === event.entity_id ? { ...label, deleted: true } : label))
  };
}

function applyColumnCreated(state, event) {
  if (state.columns.some((column) => column.id === event.entity_id)) return state;
  return {
    ...state,
    columns: [...state.columns, { id: event.entity_id, ...(event.payload?.column || event.payload?.fields || {}) }]
  };
}

function applyColumnUpdated(state, event) {
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  return {
    ...state,
    columns: state.columns.map((column) => (column.id === event.entity_id ? { ...column, ...fields } : column))
  };
}

function applyColumnDeleted(state, event) {
  return {
    ...state,
    columns: state.columns.map((column) => (column.id === event.entity_id ? { ...column, deleted: true } : column))
  };
}

function applyColumnReordered(state, event) {
  const order = Array.isArray(event.payload?.order) ? event.payload.order : [];
  const orderByColumnId = new Map(order.map((entry) => [entry.id, entry.order]));
  return {
    ...state,
    columns: state.columns.map((column) => (
      orderByColumnId.has(column.id) ? { ...column, order: orderByColumnId.get(column.id) } : column
    ))
  };
}

function applyBoardCreated(state, event) {
  if (state.boards.some((board) => board.id === event.entity_id)) return state;
  return {
    ...state,
    boards: [...state.boards, { id: event.entity_id, ...(event.payload?.board || event.payload?.fields || {}) }]
  };
}

function applyBoardUpdated(state, event) {
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  return {
    ...state,
    boards: state.boards.map((board) => (board.id === event.entity_id ? { ...board, ...fields } : board))
  };
}

function applyBoardDeleted(state, event) {
  return {
    ...state,
    boards: state.boards.map((board) => (board.id === event.entity_id ? { ...board, deleted: true } : board))
  };
}

function applySettingsUpdated(state, event) {
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  const scope = event.scope ?? EVENT_SCOPE.BOARD;
  if (scope === EVENT_SCOPE.GLOBAL) return { ...state, globalSettings: { ...state.globalSettings, ...fields } };
  if (scope === EVENT_SCOPE.BOARD) return { ...state, settings: { ...state.settings, ...fields } };
  return state; // timetracking owns no settings; the spec routes them through global
}

// ── Time-tracking handlers ─────────────────────────────────────────────────────

function applyCustomerCreated(state, event) {
  if (state.timeTracking.customers.some((c) => c.id === event.entity_id)) return state;
  const tt = cloneTimeTracking(state.timeTracking);
  const customer = event.payload?.customer && typeof event.payload.customer === 'object'
    ? event.payload.customer : event.payload?.fields || {};
  return { ...state, timeTracking: { ...tt, customers: [...tt.customers, { id: event.entity_id, ...customer }] } };
}

function applyCustomerUpdated(state, event) {
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  const tt = cloneTimeTracking(state.timeTracking);
  return { ...state, timeTracking: { ...tt, customers: tt.customers.map((c) => c.id === event.entity_id ? { ...c, ...fields } : c) } };
}

function applyArchiveToggle(collectionKey, archived) {
  return function (state, event) {
    const tt = cloneTimeTracking(state.timeTracking);
    return { ...state, timeTracking: { ...tt, [collectionKey]: tt[collectionKey].map((x) => x.id === event.entity_id ? { ...x, archived } : x) } };
  };
}

const applyCustomerArchived = applyArchiveToggle('customers', true);
const applyCustomerUnarchived = applyArchiveToggle('customers', false);

function applyCustomerDeleted(state, event) {
  const tt = cloneTimeTracking(state.timeTracking);
  return { ...state, timeTracking: { ...tt, customers: tt.customers.filter((c) => c.id !== event.entity_id) } };
}

function applyProjectCreated(state, event) {
  if (state.timeTracking.projects.some((p) => p.id === event.entity_id)) return state;
  const tt = cloneTimeTracking(state.timeTracking);
  const project = event.payload?.project && typeof event.payload.project === 'object'
    ? event.payload.project : event.payload?.fields || {};
  return { ...state, timeTracking: { ...tt, projects: [...tt.projects, { id: event.entity_id, ...project }] } };
}

function applyProjectUpdated(state, event) {
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  const tt = cloneTimeTracking(state.timeTracking);
  return { ...state, timeTracking: { ...tt, projects: tt.projects.map((p) => p.id === event.entity_id ? { ...p, ...fields } : p) } };
}

const applyProjectArchived = applyArchiveToggle('projects', true);
const applyProjectUnarchived = applyArchiveToggle('projects', false);

function applyProjectDeleted(state, event) {
  const tt = cloneTimeTracking(state.timeTracking);
  return { ...state, timeTracking: { ...tt, projects: tt.projects.filter((p) => p.id !== event.entity_id) } };
}

function applyTimeEntryCreated(state, event) {
  if (state.timeTracking.timeEntries.some((e) => e.id === event.entity_id)) return state;
  const tt = cloneTimeTracking(state.timeTracking);
  const entry = event.payload?.entry && typeof event.payload.entry === 'object'
    ? event.payload.entry : event.payload?.fields || {};
  return { ...state, timeTracking: { ...tt, timeEntries: [...tt.timeEntries, { id: event.entity_id, ...entry }] } };
}

function applyTimeEntryUpdated(state, event) {
  const fields = event.payload?.fields && typeof event.payload.fields === 'object' ? event.payload.fields : {};
  const tt = cloneTimeTracking(state.timeTracking);
  return { ...state, timeTracking: { ...tt, timeEntries: tt.timeEntries.map((e) => e.id === event.entity_id ? { ...e, ...fields } : e) } };
}

function applyTimeEntryDeleted(state, event) {
  const tt = cloneTimeTracking(state.timeTracking);
  return { ...state, timeTracking: { ...tt, timeEntries: tt.timeEntries.filter((e) => e.id !== event.entity_id) } };
}

const handlers = {
  'task.created': applyTaskCreated,
  'task.updated': applyTaskUpdated,
  'task.moved': applyTaskMoved,
  'task.deleted': applyTaskDeleted,
  'subtask.added': applySubtaskAdded,
  'subtask.removed': applySubtaskRemoved,
  'subtask.toggled': applySubtaskToggled,
  'subtask.text_changed': applySubtaskTextChanged,
  'relationship.added': applyRelationshipAdded,
  'relationship.removed': applyRelationshipRemoved,
  'label.added_to_task': applyLabelAddedToTask,
  'label.removed_from_task': applyLabelRemovedFromTask,
  'label.created': applyLabelCreated,
  'label.updated': applyLabelUpdated,
  'label.deleted': applyLabelDeleted,
  'column.created': applyColumnCreated,
  'column.updated': applyColumnUpdated,
  'column.deleted': applyColumnDeleted,
  'column.reordered': applyColumnReordered,
  'board.created': applyBoardCreated,
  'board.updated': applyBoardUpdated,
  'board.deleted': applyBoardDeleted,
  'settings.updated': applySettingsUpdated,
  'customer.created': applyCustomerCreated,
  'customer.updated': applyCustomerUpdated,
  'customer.archived': applyCustomerArchived,
  'customer.unarchived': applyCustomerUnarchived,
  'customer.deleted': applyCustomerDeleted,
  'project.created': applyProjectCreated,
  'project.updated': applyProjectUpdated,
  'project.archived': applyProjectArchived,
  'project.unarchived': applyProjectUnarchived,
  'project.deleted': applyProjectDeleted,
  'time_entry.created': applyTimeEntryCreated,
  'time_entry.updated': applyTimeEntryUpdated,
  'time_entry.deleted': applyTimeEntryDeleted
};

export function applyEvent(state, event) {
  if (state.appliedEventIds.has(event.id)) return state;

  const handler = handlers[event.type];
  if (!handler) {
    console.warn(`Unknown event type: ${event.type}`);
    return state;
  }

  const next = handler(cloneState(state), event);
  next.appliedEventIds.add(event.id);
  return next;
}

export function applyEvents(state, events) {
  return [...events].sort((a, b) => {
    if (a.hlc.wallTime !== b.hlc.wallTime) return a.hlc.wallTime - b.hlc.wallTime;
    if (a.hlc.counter !== b.hlc.counter) return a.hlc.counter - b.hlc.counter;
    return a.hlc.nodeId < b.hlc.nodeId ? -1 : a.hlc.nodeId > b.hlc.nodeId ? 1 : 0;
  }).reduce((nextState, event) => applyEvent(nextState, event), state);
}
