import { generateUUID } from './utils.js';
import { appendBoardEvent, getActiveBoardId, isDoneColumnId, loadColumns, loadLabels, loadSettings, loadTasks, saveTasks } from './storage.js';
import { applySwimLaneAssignment } from './swimlanes.js';
import { normalizePriority, normalizeRelationships, normalizeSubTasks } from './normalize.js';
import { DEFAULT_HUMAN_ACTOR, appendTaskActivity, createActivityEvent } from './activity-log.js';

const RELATIONSHIP_INVERSE = { prerequisite: 'dependent', dependent: 'prerequisite', related: 'related' };

function reorderColumnTasks(tasks, columnId, pinnedTaskId = null) {
  const columnTasks = tasks
    .filter((task) => task.column === columnId)
    .slice()
    .sort((a, b) => {
      if (a.id === pinnedTaskId) return -1;
      if (b.id === pinnedTaskId) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });

  const orderById = new Map();
  columnTasks.forEach((task, index) => {
    orderById.set(task.id, index + 1);
  });

  return tasks.map((task) => {
    if (task.column !== columnId) return task;
    const nextOrder = orderById.get(task.id);
    return typeof nextOrder === 'number' && nextOrder !== task.order
      ? { ...task, order: nextOrder }
      : task;
  });
}

function normalizeDueDate(value) {
  const date = (value || '').toString().trim();
  // Expecting YYYY-MM-DD from <input type="date">; keep empty if unset.
  return date;
}

function getColumnName(columnId) {
  return loadColumns().find((column) => column.id === columnId)?.name || '';
}

function getLabelName(labels, labelId) {
  return labels.find((label) => label.id === labelId)?.name || '';
}

function getTaskTitle(tasks, taskId) {
  return tasks.find((task) => task.id === taskId)?.title || '';
}

function relationshipKey(relationship) {
  return `${relationship.targetTaskId}:${relationship.type}`;
}

function appendTaskEvent(task, type, details, at) {
  return appendTaskActivity(task, createActivityEvent(type, details, DEFAULT_HUMAN_ACTOR, at));
}

/**
 * Apply bidirectional relationship sync on a tasks array.
 * Diffs oldRelationships vs newRelationships for a given taskId and mutates
 * the target tasks in-place to keep inverses consistent.
 */
function syncRelationshipInverses(tasks, taskId, oldRelationships, newRelationships, at) {
  const oldMap = new Map(oldRelationships.map((r) => [r.targetTaskId, r.type]));
  const newMap = new Map(newRelationships.map((r) => [r.targetTaskId, r.type]));
  const sourceTask = tasks.find((t) => t.id === taskId);

  for (const [targetId, newType] of newMap) {
    const target = tasks.find((t) => t.id === targetId);
    if (!target) continue;
    if (!Array.isArray(target.relationships)) target.relationships = [];
    const oldType = oldMap.get(targetId);
    // Remove any existing entry pointing back at taskId, then add the correct inverse.
    const inverseType = RELATIONSHIP_INVERSE[newType];
    const targetIndex = tasks.findIndex((t) => t.id === targetId);
    let nextTarget = {
      ...target,
      relationships: [
        ...target.relationships.filter((r) => r.targetTaskId !== taskId),
        { type: inverseType, targetTaskId: taskId }
      ]
    };

    if (oldType && oldType !== newType) {
      nextTarget = appendTaskEvent(nextTarget, 'task.relationship_removed', {
        targetTaskId: taskId,
        targetTaskTitle: sourceTask?.title || '',
        type: RELATIONSHIP_INVERSE[oldType]
      }, at);
    }
    if (!oldType || oldType !== newType) {
      nextTarget = appendTaskEvent(nextTarget, 'task.relationship_added', {
        targetTaskId: taskId,
        targetTaskTitle: sourceTask?.title || '',
        type: inverseType
      }, at);
    }
    tasks[targetIndex] = nextTarget;
  }

  for (const [targetId, oldType] of oldMap) {
    if (newMap.has(targetId)) continue; // handled above
    const target = tasks.find((t) => t.id === targetId);
    if (!target || !Array.isArray(target.relationships)) continue;
    const inverseType = RELATIONSHIP_INVERSE[oldType];
    const targetIndex = tasks.findIndex((t) => t.id === targetId);
    tasks[targetIndex] = appendTaskEvent({
      ...target,
      relationships: target.relationships.filter((r) => r.targetTaskId !== taskId)
    }, 'task.relationship_removed', {
      targetTaskId: taskId,
      targetTaskTitle: sourceTask?.title || '',
      type: inverseType
    }, at);
  }
}

// Add a new task
export function addTask(title, description, priority, dueDate, columnName, labels = [], relationships = [], subTasks = []) {
  if (!title || title.trim() === '') return;

  const tasks = loadTasks();
  // Insert new tasks at the top of the column.
  // Normalize the column's existing task orders so they start at 2 (leaving 1 for the new task).
  const columnTasks = tasks
    .filter((t) => t.column === columnName)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const nextOrderById = new Map();
  columnTasks.forEach((task, index) => {
    nextOrderById.set(task.id, index + 2);
  });

  const updatedTasks = tasks.map((task) => {
    if (task.column !== columnName) return task;
    const nextOrder = nextOrderById.get(task.id);
    return typeof nextOrder === 'number' ? { ...task, order: nextOrder } : task;
  });

  const nowIso = new Date().toISOString();
  const normalizedRelationships = normalizeRelationships(relationships);
  let newTask = {
    id: generateUUID(),
    title: title.trim(),
    description: (description || '').toString().trim(),
    priority: normalizePriority(priority),
    dueDate: normalizeDueDate(dueDate),
    column: columnName,
    order: 1,
    labels: [...labels],
    relationships: normalizedRelationships,
    subTasks: normalizeSubTasks(subTasks),
    creationDate: nowIso,
    changeDate: nowIso,
    columnHistory: [{ column: columnName, at: nowIso }],
    ...(isDoneColumnId(columnName) ? { doneDate: nowIso } : {})
  };

  newTask = appendTaskActivity(newTask, createActivityEvent('task.created', {
    column: columnName,
    columnName: getColumnName(columnName)
  }, DEFAULT_HUMAN_ACTOR, nowIso));

  updatedTasks.push(newTask);
  syncRelationshipInverses(updatedTasks, newTask.id, [], normalizedRelationships, nowIso);
  saveTasks(updatedTasks);
}

// Update an existing task
export function updateTask(taskId, title, description, priority, dueDate, columnName, labels = [], relationships = [], subTasks = []) {
  if (!title || title.trim() === '') return;
  
  const tasks = loadTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    const prevColumn = tasks[taskIndex].column;
    const nextColumn = columnName;
    const nowIso = new Date().toISOString();

    // Ensure we have a baseline history entry before appending transitions.
    if (!Array.isArray(tasks[taskIndex].columnHistory) || tasks[taskIndex].columnHistory.length === 0) {
      const seededAt = tasks[taskIndex].creationDate || tasks[taskIndex].changeDate || nowIso;
      const seededColumn = typeof prevColumn === 'string' ? prevColumn : nextColumn;
      tasks[taskIndex].columnHistory = [{ column: seededColumn, at: seededAt }];
    }

    const oldRelationships = Array.isArray(tasks[taskIndex].relationships) ? tasks[taskIndex].relationships : [];
    const newRelationships = normalizeRelationships(relationships);

    const previousTask = { ...tasks[taskIndex] };
    const nextTitle = title.trim();
    const nextDescription = (description || '').toString().trim();
    const nextPriority = normalizePriority(priority);
    const nextDueDate = normalizeDueDate(dueDate);

    tasks[taskIndex].title = nextTitle;
    tasks[taskIndex].description = nextDescription;
    tasks[taskIndex].priority = nextPriority;
    tasks[taskIndex].dueDate = nextDueDate;
    tasks[taskIndex].column = nextColumn;
    tasks[taskIndex].labels = [...labels];
    tasks[taskIndex].relationships = newRelationships;
    tasks[taskIndex].subTasks = normalizeSubTasks(subTasks);

    syncRelationshipInverses(tasks, taskId, oldRelationships, newRelationships, nowIso);

    if (prevColumn !== nextColumn) {
      tasks[taskIndex].columnHistory.push({ column: nextColumn, at: nowIso });
    }

    if (previousTask.title !== nextTitle) {
      tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.title_changed', { from: previousTask.title, to: nextTitle }, nowIso);
    }
    if ((previousTask.description || '') !== nextDescription) {
      tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.description_changed', { changed: true }, nowIso);
    }
    if (normalizePriority(previousTask.priority) !== nextPriority) {
      tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.priority_changed', { from: normalizePriority(previousTask.priority), to: nextPriority }, nowIso);
    }
    if (normalizeDueDate(previousTask.dueDate) !== nextDueDate) {
      tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.due_date_changed', { from: normalizeDueDate(previousTask.dueDate), to: nextDueDate }, nowIso);
    }
    if (prevColumn !== nextColumn) {
      tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.column_moved', { from: prevColumn, to: nextColumn }, nowIso);
    }
    const previousLabels = Array.isArray(previousTask.labels) ? previousTask.labels : [];
    const nextLabels = Array.isArray(labels) ? labels : [];
    const labelRecords = loadLabels();
    nextLabels
      .filter((labelId) => !previousLabels.includes(labelId))
      .forEach((labelId) => {
        tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.label_added', {
          labelId,
          labelName: getLabelName(labelRecords, labelId)
        }, nowIso);
      });
    previousLabels
      .filter((labelId) => !nextLabels.includes(labelId))
      .forEach((labelId) => {
        tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.label_removed', {
          labelId,
          labelName: getLabelName(labelRecords, labelId)
        }, nowIso);
      });
    const previousRelationshipKeys = new Set(oldRelationships.map(relationshipKey));
    const nextRelationshipKeys = new Set(newRelationships.map(relationshipKey));
    newRelationships
      .filter((relationship) => !previousRelationshipKeys.has(relationshipKey(relationship)))
      .forEach((relationship) => {
        tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.relationship_added', {
          targetTaskId: relationship.targetTaskId,
          targetTaskTitle: getTaskTitle(tasks, relationship.targetTaskId),
          type: relationship.type
        }, nowIso);
      });
    oldRelationships
      .filter((relationship) => !nextRelationshipKeys.has(relationshipKey(relationship)))
      .forEach((relationship) => {
        tasks[taskIndex] = appendTaskEvent(tasks[taskIndex], 'task.relationship_removed', {
          targetTaskId: relationship.targetTaskId,
          targetTaskTitle: getTaskTitle(tasks, relationship.targetTaskId),
          type: relationship.type
        }, nowIso);
      });

    if (!isDoneColumnId(prevColumn) && isDoneColumnId(nextColumn)) {
      tasks[taskIndex].doneDate = nowIso;
    } else if (isDoneColumnId(prevColumn) && !isDoneColumnId(nextColumn)) {
      delete tasks[taskIndex].doneDate;
    }

    tasks[taskIndex].changeDate = nowIso;
    saveTasks(tasks);
  }
}

// Delete a task
export function deleteTask(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    appendBoardEvent(getActiveBoardId(), createActivityEvent('task.deleted', {
      taskId: task.id,
      taskTitle: task.title,
      column: task.column,
      columnName: getColumnName(task.column)
    }, DEFAULT_HUMAN_ACTOR));
  }
  const filtered = tasks.filter(t => t.id !== taskId);
  saveTasks(filtered);
  return true;
}

// Get current task positions from DOM
export function getCurrentTaskOrder() {
  const tasks = [];
  document.querySelectorAll('.task').forEach(taskEl => {
    const columnContainer = taskEl.closest('[data-column]');
    const columnName = columnContainer?.dataset?.column;
    if (!columnName) return;
    tasks.push({
      id: taskEl.dataset.taskId,
      column: columnName
    });
  });
  return tasks;
}

function getColumnContainer(node) {
  return node?.closest?.('[data-column]') || null;
}

function getLaneKey(node) {
  const direct = node?.dataset?.laneKey;
  if (typeof direct === 'string') return direct;
  return node?.closest?.('[data-lane-key]')?.dataset?.laneKey || '';
}

function buildOrderByColumnFromDom() {
  const boardContainer = document.getElementById('board-container');
  const isSwimlaneView = boardContainer?.dataset?.viewMode === 'swimlanes';
  const orderByColumn = new Map();

  if (!isSwimlaneView) {
    document.querySelectorAll('.task-column[data-column]').forEach((columnEl) => {
      const columnId = columnEl.dataset.column;
      if (!columnId) return;
      const order = [];
      columnEl.querySelectorAll('.task').forEach((el, idx) => {
        const taskId = el.dataset.taskId;
        if (!taskId) return;
        order.push({ id: taskId, order: idx + 1 });
      });
      orderByColumn.set(columnId, order);
    });
    return orderByColumn;
  }

  const flattenedByColumn = new Map();
  document.querySelectorAll('.swimlane-row').forEach((rowEl) => {
    rowEl.querySelectorAll('.swimlane-cell[data-column]').forEach((cellEl) => {
      const columnId = cellEl.dataset.column;
      if (!columnId) return;
      if (!flattenedByColumn.has(columnId)) {
        flattenedByColumn.set(columnId, []);
      }
      cellEl.querySelectorAll('.task').forEach((taskEl) => {
        const taskId = taskEl.dataset.taskId;
        if (taskId) flattenedByColumn.get(columnId).push(taskId);
      });
    });
  });

  flattenedByColumn.forEach((taskIds, columnId) => {
    orderByColumn.set(columnId, taskIds.map((id, index) => ({ id, order: index + 1 })));
  });

  return orderByColumn;
}

/**
 * Update task positions from a drag-drop event (optimized for performance).
 * Only updates the moved task and reorders tasks in affected columns.
 * @param {object} evt - Sortable event with oldIndex, newIndex, from, to, item
 * @returns {object} - { movedTaskId, fromColumn, toColumn, didChangeColumn }
 */
export function updateTaskPositionsFromDrop(evt) {
  const movedTaskId = evt.item?.dataset?.taskId;
  if (!movedTaskId) return null;

  const fromColumnEl = getColumnContainer(evt.from);
  const toColumnEl = getColumnContainer(evt.to);
  if (!fromColumnEl || !toColumnEl) return null;

  const fromColumn = fromColumnEl.dataset.column;
  const toColumn = toColumnEl.dataset.column;
  const didChangeColumn = fromColumn !== toColumn;
  const fromLaneKey = getLaneKey(evt.from);
  const toLaneKey = getLaneKey(evt.to);
  const didChangeLane = fromLaneKey !== toLaneKey;

  const tasks = loadTasks();
  const nowIso = new Date().toISOString();
  const settings = loadSettings();
  const labels = loadLabels();
  const isSwimlaneView = settings.swimLanesEnabled === true;

  // Find the moved task
  const movedTaskIndex = tasks.findIndex(t => t.id === movedTaskId);
  if (movedTaskIndex === -1) return null;

  const movedTask = tasks[movedTaskIndex];

  const affectedColumns = new Set([fromColumn, toColumn]);
  const orderByColumn = buildOrderByColumnFromDom();

  // Update tasks
  const updatedTasks = tasks.map(task => {
    // Update the moved task
    if (task.id === movedTaskId) {
      let nextTask = {
        ...task,
        column: toColumn
      };

      if (isSwimlaneView) {
        nextTask = applySwimLaneAssignment(nextTask, settings.swimLaneGroupBy, toLaneKey, labels, settings.swimLaneLabelGroup);
      }

      // Update order
      const toOrder = orderByColumn.get(toColumn);
      const orderEntry = toOrder?.find(o => o.id === movedTaskId);
      if (orderEntry) {
        nextTask.order = orderEntry.order;
      }

      const previousPriority = normalizePriority(task.priority);
      const nextPriority = normalizePriority(nextTask.priority);
      if (previousPriority !== nextPriority) {
        nextTask = appendTaskEvent(nextTask, 'task.priority_changed', { from: previousPriority, to: nextPriority }, nowIso);
      }

      const previousLabels = Array.isArray(task.labels) ? task.labels : [];
      const nextLabels = Array.isArray(nextTask.labels) ? nextTask.labels : [];
      nextLabels
        .filter((labelId) => !previousLabels.includes(labelId))
        .forEach((labelId) => {
          nextTask = appendTaskEvent(nextTask, 'task.label_added', {
            labelId,
            labelName: getLabelName(labels, labelId)
          }, nowIso);
        });
      previousLabels
        .filter((labelId) => !nextLabels.includes(labelId))
        .forEach((labelId) => {
          nextTask = appendTaskEvent(nextTask, 'task.label_removed', {
            labelId,
            labelName: getLabelName(labels, labelId)
          }, nowIso);
        });

      // Only update history/dates if column changed
      if (didChangeColumn || (isSwimlaneView && didChangeLane)) {
        nextTask.changeDate = nowIso;

        if (!didChangeColumn) {
          return nextTask;
        }

        const history = Array.isArray(task.columnHistory) && task.columnHistory.length
          ? [...task.columnHistory]
          : [{ column: task.column, at: task.creationDate || task.changeDate || nowIso }];
        history.push({ column: toColumn, at: nowIso });
        nextTask.columnHistory = history;
        nextTask = appendTaskEvent(nextTask, 'task.column_moved', { from: task.column, to: toColumn }, nowIso);

        if (!isDoneColumnId(task.column) && isDoneColumnId(toColumn)) {
          nextTask.doneDate = nowIso;
        } else if (isDoneColumnId(task.column) && !isDoneColumnId(toColumn)) {
          delete nextTask.doneDate;
        }
      }

      return nextTask;
    }

    // Update order for other tasks in affected columns
    if (affectedColumns.has(task.column)) {
      const columnOrder = orderByColumn.get(task.column);
      const orderEntry = columnOrder?.find(o => o.id === task.id);
      if (orderEntry && orderEntry.order !== task.order) {
        return { ...task, order: orderEntry.order };
      }
    }

    return task;
  });

  const finalTasks = isDoneColumnId(toColumn)
    ? reorderColumnTasks(updatedTasks, toColumn, movedTaskId)
    : updatedTasks;

  saveTasks(finalTasks);

  return {
    movedTaskId,
    fromColumn,
    toColumn,
    fromLaneKey,
    toLaneKey,
    didChangeColumn,
    didChangeLane,
    tasks: finalTasks
  };
}

export function moveTaskToTopInColumn(taskId, columnId, tasksCache) {
  if (!taskId || !columnId) return null;

  const tasks = tasksCache || loadTasks();
  const updatedTasks = reorderColumnTasks(tasks, columnId, taskId);
  const didUpdate = updatedTasks.some((task, index) => task !== tasks[index]);

  if (didUpdate) {
    saveTasks(updatedTasks);
    return updatedTasks;
  }
  return tasks;
}
