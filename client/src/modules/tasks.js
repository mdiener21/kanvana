import { generateUUID } from './utils.js';
import { loadTasks, saveTasks, COLUMN_ID_DONE } from './storage.js';

const ALLOWED_PRIORITIES = new Set(['urgent', 'high', 'medium', 'low', 'none']);

function normalizePriority(priority) {
  const value = (priority || '').toString().trim().toLowerCase();
  return ALLOWED_PRIORITIES.has(value) ? value : 'none';
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
    ...(columnName === COLUMN_ID_DONE ? { doneDate: nowIso } : {})
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

    if (prevColumn !== COLUMN_ID_DONE && nextColumn === COLUMN_ID_DONE) {
      tasks[taskIndex].doneDate = nowIso;
    } else if (prevColumn === COLUMN_ID_DONE && nextColumn !== COLUMN_ID_DONE) {
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
  document.querySelectorAll('.task-column').forEach(column => {
    const columnName = column.dataset.column;
    column.querySelectorAll('.task').forEach(taskEl => {
      tasks.push({
        id: taskEl.dataset.taskId,
        column: columnName
      });
    });
  });
  return tasks;
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

  const fromColumnEl = evt.from.closest('.task-column');
  const toColumnEl = evt.to.closest('.task-column');
  if (!fromColumnEl || !toColumnEl) return null;

  const fromColumn = fromColumnEl.dataset.column;
  const toColumn = toColumnEl.dataset.column;
  const didChangeColumn = fromColumn !== toColumn;

  const tasks = loadTasks();
  const nowIso = new Date().toISOString();

  // Find the moved task
  const movedTaskIndex = tasks.findIndex(t => t.id === movedTaskId);
  if (movedTaskIndex === -1) return null;

  const movedTask = tasks[movedTaskIndex];

  // Build order maps for affected columns from DOM
  const affectedColumns = new Set([fromColumn, toColumn]);
  const orderByColumn = new Map();

  affectedColumns.forEach(columnId => {
    const columnEl = document.querySelector(`.task-column[data-column="${columnId}"]`);
    if (!columnEl) return;
    
    const taskEls = columnEl.querySelectorAll('.task');
    const order = [];
    taskEls.forEach((el, idx) => {
      const taskId = el.dataset.taskId;
      if (taskId) {
        order.push({ id: taskId, order: idx + 1 });
      }
    });
    orderByColumn.set(columnId, order);
  });

  // Update tasks
  const updatedTasks = tasks.map(task => {
    // Update the moved task
    if (task.id === movedTaskId) {
      const nextTask = {
        ...task,
        column: toColumn
      };

      // Update order
      const toOrder = orderByColumn.get(toColumn);
      const orderEntry = toOrder?.find(o => o.id === movedTaskId);
      if (orderEntry) {
        nextTask.order = orderEntry.order;
      }

      // Only update history/dates if column changed
      if (didChangeColumn) {
        nextTask.changeDate = nowIso;

        const history = Array.isArray(task.columnHistory) && task.columnHistory.length
          ? [...task.columnHistory]
          : [{ column: task.column, at: task.creationDate || task.changeDate || nowIso }];
        history.push({ column: toColumn, at: nowIso });
        nextTask.columnHistory = history;

        if (task.column !== COLUMN_ID_DONE && toColumn === COLUMN_ID_DONE) {
          nextTask.doneDate = nowIso;
        } else if (task.column === COLUMN_ID_DONE && toColumn !== COLUMN_ID_DONE) {
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

  saveTasks(updatedTasks);

  return {
    movedTaskId,
    fromColumn,
    toColumn,
    didChangeColumn
  };
}

// Update task positions after drag (legacy - kept for compatibility)
export function updateTaskPositions() {
  const currentOrder = getCurrentTaskOrder();
  const tasks = loadTasks();
  const nowIso = new Date().toISOString();
  
  // Update each task with new column and order based on DOM position
  const updatedTasks = tasks.map(task => {
    const currentIndex = currentOrder.findIndex(c => c.id === task.id);
    if (currentIndex !== -1) {
      const current = currentOrder[currentIndex];
      // Calculate order within column
      const tasksInSameColumn = currentOrder.filter((t, i) => t.column === current.column && i <= currentIndex);
      const nextColumn = current.column;
      const nextOrder = tasksInSameColumn.length;
      const didMove = task.column !== nextColumn;
      const nextTask = {
        ...task,
        column: nextColumn,
        order: nextOrder,
        ...(didMove ? { changeDate: nowIso } : {})
      };

      if (didMove) {
        const history = Array.isArray(task.columnHistory) && task.columnHistory.length
          ? [...task.columnHistory]
          : [{ column: task.column, at: task.creationDate || task.changeDate || nowIso }];
        history.push({ column: nextColumn, at: nowIso });
        nextTask.columnHistory = history;

        if (task.column !== COLUMN_ID_DONE && nextColumn === COLUMN_ID_DONE) {
          nextTask.doneDate = nowIso;
        } else if (task.column === COLUMN_ID_DONE && nextColumn !== COLUMN_ID_DONE) {
          delete nextTask.doneDate;
        }
      }

      return {
        ...nextTask
      };
    }
    return task;
  });
  
  saveTasks(updatedTasks);
}
