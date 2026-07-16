import { isDoneColumn } from './constants.js';

export function createProjectionState(seed = {}) {
  return {
    boards: Array.isArray(seed.boards) ? seed.boards : [],
    tasks: Array.isArray(seed.tasks) ? seed.tasks : [],
    columns: Array.isArray(seed.columns) ? seed.columns : [],
    labels: Array.isArray(seed.labels) ? seed.labels : [],
    settings: seed.settings && typeof seed.settings === 'object' ? seed.settings : {},
    globalSettings: seed.globalSettings && typeof seed.globalSettings === 'object' ? seed.globalSettings : {},
    appliedEventIds: seed.appliedEventIds instanceof Set ? new Set(seed.appliedEventIds) : new Set(),
    taskTombstones: seed.taskTombstones instanceof Set ? new Set(seed.taskTombstones) : new Set()
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
  return event.scope === 'global'
    ? { ...state, globalSettings: { ...state.globalSettings, ...fields } }
    : { ...state, settings: { ...state.settings, ...fields } };
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
  'settings.updated': applySettingsUpdated
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
