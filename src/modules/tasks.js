import { generateUUID } from './utils.js';
import { loadLabels, loadSettings, loadTasks, saveTasks } from './storage.js';
import { applySwimLaneAssignment } from './swimlanes.js';
import { normalizePriority } from './normalize.js';
import { DONE_COLUMN_ID } from './constants.js';

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

// Add a new task
export function addTask(title, description, priority, dueDate, columnName, labels = []) {
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
  const newTask = {
    id: generateUUID(),
    title: title.trim(),
    description: (description || '').toString().trim(),
    priority: normalizePriority(priority),
    dueDate: normalizeDueDate(dueDate),
    column: columnName,
    order: 1,
    labels: [...labels],
    creationDate: nowIso,
    changeDate: nowIso,
    columnHistory: [{ column: columnName, at: nowIso }],
    ...(columnName === DONE_COLUMN_ID ? { doneDate: nowIso } : {})
  };

  updatedTasks.push(newTask);
  saveTasks(updatedTasks);
}

// Update an existing task
export function updateTask(taskId, title, description, priority, dueDate, columnName, labels = []) {
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

    tasks[taskIndex].title = title.trim();
    tasks[taskIndex].description = (description || '').toString().trim();
    tasks[taskIndex].priority = normalizePriority(priority);
    tasks[taskIndex].dueDate = normalizeDueDate(dueDate);
    tasks[taskIndex].column = nextColumn;
    tasks[taskIndex].labels = [...labels];

    if (prevColumn !== nextColumn) {
      tasks[taskIndex].columnHistory.push({ column: nextColumn, at: nowIso });
    }

    if (prevColumn !== DONE_COLUMN_ID && nextColumn === DONE_COLUMN_ID) {
      tasks[taskIndex].doneDate = nowIso;
    } else if (prevColumn === DONE_COLUMN_ID && nextColumn !== DONE_COLUMN_ID) {
      delete tasks[taskIndex].doneDate;
    }

    tasks[taskIndex].changeDate = nowIso;
    saveTasks(tasks);
  }
}

// Delete a task
export function deleteTask(taskId) {
  const tasks = loadTasks();
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

        if (task.column !== DONE_COLUMN_ID && toColumn === DONE_COLUMN_ID) {
          nextTask.doneDate = nowIso;
        } else if (task.column === DONE_COLUMN_ID && toColumn !== DONE_COLUMN_ID) {
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

  const finalTasks = toColumn === DONE_COLUMN_ID
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

