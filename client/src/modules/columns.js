import { generateUUID } from './utils.js';
import { getActiveBoardId, isDoneColumnId, loadColumns, loadDeletedColumnsForBoard, loadDeletedTasksForBoard, saveColumns, loadTasks, saveTasks } from './storage.js';
import { normalizeHexColor } from './normalize.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';

// Add a new column
export function addColumn(name, color) {
  if (!name || name.trim() === '') return;
  
  const columns = loadColumns();
  const maxOrder = columns.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
  const id = generateUUID();
  const newColumn = { id, name: name.trim(), color: normalizeHexColor(color), order: maxOrder - 1, collapsed: false };
  columns.push(newColumn);
  saveColumns(columns);
  scheduleDomainEvent({
    type: 'column.created',
    boardId: getActiveBoardId(),
    entityId: newColumn.id,
    payload: { column: newColumn }
  });
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
    }
    saveColumns(columns);
    scheduleDomainEvent({
      type: 'column.updated',
      boardId: getActiveBoardId(),
      entityId: columnId,
      payload: { fields: { name: columns[columnIndex].name, color: columns[columnIndex].color } }
    });
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

  tasksInColumn.forEach((task) => {
    scheduleDomainEvent({
      type: 'task.deleted',
      boardId,
      entityId: task.id,
      payload: { column: task.column }
    });
  });

  scheduleDomainEvent({
    type: 'column.deleted',
    boardId,
    entityId: columnId,
    payload: { tasksDestroyed: tasksInColumn.length }
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
    scheduleDomainEvent({
      type: 'column.reordered',
      boardId: getActiveBoardId(),
      entityId: '',
      payload: { order: columns.map((column) => ({ id: column.id, order: column.order })) }
    });
  }
}
