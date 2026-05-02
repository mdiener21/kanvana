import { generateUUID } from './utils.js';
import { appendBoardEvent, getActiveBoardId, isDoneColumnId, loadColumns, loadDeletedColumnsForBoard, loadDeletedTasksForBoard, saveColumns, loadTasks, saveTasks } from './storage.js';
import { normalizeHexColor } from './normalize.js';
import { DEFAULT_HUMAN_ACTOR, createActivityEvent } from './activity-log.js';

// Add a new column
export function addColumn(name, color) {
  if (!name || name.trim() === '') return;
  
  const columns = loadColumns();
  const maxOrder = columns.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
  const id = generateUUID();
  const newColumn = { id, name: name.trim(), color: normalizeHexColor(color), order: maxOrder - 1, collapsed: false };
  columns.push(newColumn);
  appendBoardEvent(getActiveBoardId(), createActivityEvent('column.created', {
    columnId: newColumn.id,
    columnName: newColumn.name
  }, DEFAULT_HUMAN_ACTOR));
  saveColumns(columns);
}

export function toggleColumnCollapsed(columnId) {
  const id = typeof columnId === 'string' ? columnId.trim() : '';
  if (!id) return false;

  const columns = loadColumns();
  const column = columns.find((c) => c.id === id);
  if (!column) return false;

  column.collapsed = column.collapsed !== true;
  saveColumns(columns);
  return true;
}

// Update an existing column
export function updateColumn(columnId, name, color) {
  if (!name || name.trim() === '') return;
  
  const columns = loadColumns();
  const columnIndex = columns.findIndex(c => c.id === columnId);
  if (columnIndex !== -1) {
    const previousName = columns[columnIndex].name;
    columns[columnIndex].name = name.trim();
    columns[columnIndex].color = normalizeHexColor(color);
    if (previousName !== columns[columnIndex].name) {
      appendBoardEvent(getActiveBoardId(), createActivityEvent('column.renamed', {
        columnId,
        from: previousName,
        to: columns[columnIndex].name
      }, DEFAULT_HUMAN_ACTOR));
    }
    saveColumns(columns);
  }
}

// Delete a column
export function deleteColumn(columnId) {
  if (isDoneColumnId(columnId)) {
    return false;
  }

  const boardId = getActiveBoardId();
  const columns = loadColumns();
  if (columns.length <= 1) {
    return false;
  }
  const column = columns.find(c => c.id === columnId);
  if (!column) {
    return false;
  }

  const columnName = column.name;
  const liveTasks = loadTasks();
  const tasksInColumn = liveTasks.filter(t => t.column === columnId);

  // Soft-delete tasks in the column, preserving already-deleted tasks
  const allTasks = [...liveTasks, ...loadDeletedTasksForBoard(boardId)];
  const updatedTasks = allTasks.map(t =>
    t.column === columnId ? { ...t, deleted: true } : t
  );
  saveTasks(updatedTasks);

  // Soft-delete the column, preserving already-deleted columns
  const allColumns = [...columns, ...loadDeletedColumnsForBoard(boardId)];
  const updatedColumns = allColumns.map(c =>
    c.id === columnId ? { ...c, deleted: true } : c
  );
  saveColumns(updatedColumns);

  appendBoardEvent(boardId, createActivityEvent('column.deleted', {
    columnName,
    tasksDestroyed: tasksInColumn.length
  }, DEFAULT_HUMAN_ACTOR));

  tasksInColumn.forEach((task) => {
    appendBoardEvent(boardId, createActivityEvent('task.deleted', {
      taskId: task.id,
      taskTitle: task.title,
      column: task.column,
      columnName
    }, DEFAULT_HUMAN_ACTOR));
  });

  return true;
}

// Update column positions after drag
export function updateColumnPositions() {
  const container = document.getElementById("board-container");
  const columnElements = container.querySelectorAll(".task-column");
  const columns = loadColumns();
  
  let anyMoved = false;
  columnElements.forEach((colEl, index) => {
    const columnId = colEl.dataset.column;
    const column = columns.find(c => c.id === columnId);
    if (column) {
      const nextOrder = index + 1;
      if (column.order !== nextOrder) {
        anyMoved = true;
      }
      column.order = nextOrder;
    }
  });
  
  saveColumns(columns);

  // Emit a single event only when at least one column moved; details {} kept
  // minimal as the PRD does not specify a bulk payload shape.
  if (anyMoved) {
    appendBoardEvent(getActiveBoardId(), createActivityEvent('column.reordered', {}, DEFAULT_HUMAN_ACTOR));
  }
}
