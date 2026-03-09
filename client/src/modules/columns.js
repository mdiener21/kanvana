import { generateUUID } from './utils.js';
import { loadColumns, saveColumns, loadTasks, saveTasks, COLUMN_ID_DONE } from './storage.js';

function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normalizeColumnColor(color) {
  return isHexColor(color) ? color.trim() : '#3b82f6';
}

// Add a new column
export function addColumn(name, color) {
  if (!name || name.trim() === '') return;
  
  const columns = loadColumns();
  const maxOrder = columns.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
  const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + generateUUID().substring(0, 8);
  const newColumn = { id, name: name.trim(), color: normalizeColumnColor(color), order: maxOrder - 1, collapsed: false };
  columns.push(newColumn);
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
    columns[columnIndex].name = name.trim();
    columns[columnIndex].color = normalizeColumnColor(color);
    saveColumns(columns);
  }
}

// Delete a column
export function deleteColumn(columnId) {
  if (columnId === COLUMN_ID_DONE) {
    return false;
  }

  const columns = loadColumns();
  if (columns.length <= 1) {
    return false;
  }
  
  const tasks = loadTasks();
  const tasksInColumn = tasks.filter(t => t.column === columnId);

  if (tasksInColumn.length > 0) {
    // Remove tasks in this column
    const filteredTasks = tasks.filter(t => t.column !== columnId);
    saveTasks(filteredTasks);
  }
  
  const filteredColumns = columns.filter(c => c.id !== columnId);
  saveColumns(filteredColumns);
  return true;
}

// Update column positions after drag
export function updateColumnPositions() {
  const container = document.getElementById("board-container");
  const columnElements = container.querySelectorAll(".task-column");
  const columns = loadColumns();
  
  columnElements.forEach((colEl, index) => {
    const columnId = colEl.dataset.column;
    const column = columns.find(c => c.id === columnId);
    if (column) {
      column.order = index + 1;
    }
  });
  
  saveColumns(columns);
}
