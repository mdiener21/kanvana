// Column element DOM construction — extracted from render.js

import { loadColumns, loadTasks, saveTasks } from './storage.js';
import { deleteColumn, toggleColumnCollapsed } from './columns.js';
import { showModal, showEditColumnModal } from './modals.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { DONE_COLUMN_ID, PRIORITY_ORDER } from './constants.js';
import { emit, DATA_CHANGED } from './events.js';

function getTaskCountInColumn(columnId) {
  const tasks = loadTasks();
  return tasks.filter(t => t.column === columnId).length;
}

function closeAllColumnMenus(exceptMenu = null) {
  document.querySelectorAll('.column-menu').forEach((menu) => {
    if (exceptMenu && menu === exceptMenu) return;
    menu.classList.add('hidden');
  });
  document.querySelectorAll('.column-submenu').forEach((submenu) => {
    submenu.classList.add('hidden');
  });
}

/**
 * Sort tasks by due date (ascending).
 */
function sortTasksByDueDate(tasks) {
  return [...tasks].sort((a, b) => {
    const dateA = (a.dueDate || '').toString().trim();
    const dateB = (b.dueDate || '').toString().trim();
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.localeCompare(dateB);
  });
}

/**
 * Sort tasks by priority (descending: urgent → high → medium → low → none).
 */
function sortTasksByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    const prioA = PRIORITY_ORDER[a.priority] ?? 4;
    const prioB = PRIORITY_ORDER[b.priority] ?? 4;
    return prioA - prioB;
  });
}

/**
 * Apply sorting to tasks in a specific column and persist.
 */
function sortColumnTasks(columnId, sortBy) {
  const tasks = loadTasks();
  const columnTasks = tasks.filter((t) => t.column === columnId);
  const otherTasks = tasks.filter((t) => t.column !== columnId);

  const sortedColumnTasks =
    sortBy === 'dueDate' ? sortTasksByDueDate(columnTasks) : sortTasksByPriority(columnTasks);

  const updatedColumnTasks = sortedColumnTasks.map((task, index) => ({
    ...task,
    order: index + 1
  }));

  const updatedTasks = [...otherTasks, ...updatedColumnTasks];
  saveTasks(updatedTasks);
  emit(DATA_CHANGED);
}

export { closeAllColumnMenus };

// Create a column element
export function createColumnElement(column) {
  const div = document.createElement('article');
  div.classList.add('task-column');
  div.dataset.column = column.id;
  div.draggable = false;
  div.setAttribute('aria-labelledby', `column-title-${column.id}`);

  const isCollapsed = column?.collapsed === true;
  if (isCollapsed) div.classList.add('is-collapsed');

  if (column?.color) {
    div.style.setProperty('--column-accent', column.color);
  }

  const collapseBtn = document.createElement('button');
  collapseBtn.classList.add('column-collapse-btn');
  collapseBtn.type = 'button';
  collapseBtn.setAttribute('aria-label', isCollapsed ? `Expand ${column.name} column` : `Collapse ${column.name} column`);
  collapseBtn.title = isCollapsed ? 'Expand column' : 'Collapse column';
  const collapseIcon = document.createElement('span');
  collapseIcon.dataset.lucide = isCollapsed ? 'chevron-right' : 'chevrons-right-left';
  collapseIcon.setAttribute('aria-hidden', 'true');
  collapseBtn.appendChild(collapseIcon);
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (toggleColumnCollapsed(column.id)) emit(DATA_CHANGED);
  });

  const dragHandle = document.createElement('button');
  dragHandle.classList.add('column-drag-handle');
  dragHandle.type = 'button';
  dragHandle.setAttribute('aria-label', 'Drag to reorder column');
  const gripIcon = document.createElement('span');
  gripIcon.dataset.lucide = 'grip-vertical';
  gripIcon.setAttribute('aria-hidden', 'true');
  dragHandle.appendChild(gripIcon);
  dragHandle.title = 'Drag to reorder';

  const headerDiv = document.createElement('header');
  headerDiv.classList.add('column-header');

  const h2 = document.createElement('h2');
  h2.id = `column-title-${column.id}`;
  if (isCollapsed) {
    const taskCount = getTaskCountInColumn(column.id);
    h2.textContent = `${column.name} (${taskCount})`;
  } else {
    h2.textContent = column.name;
  }

  const taskCounter = document.createElement('span');
  taskCounter.classList.add('task-counter');
  taskCounter.dataset.columnId = column.id;
  taskCounter.textContent = '0';
  taskCounter.setAttribute('aria-label', 'Task count');

  const headerActions = document.createElement('div');
  headerActions.classList.add('column-actions');

  const addBtn = document.createElement('button');
  addBtn.classList.add('add-task-btn-icon');
  addBtn.type = 'button';
  addBtn.setAttribute('aria-label', `Add task to ${column.name}`);
  const plusIcon = document.createElement('span');
  plusIcon.dataset.lucide = 'plus';
  plusIcon.setAttribute('aria-hidden', 'true');
  addBtn.appendChild(plusIcon);
  addBtn.title = 'Add task';
  addBtn.addEventListener('click', () => showModal(column.id));

  // Overflow menu
  const menuWrapper = document.createElement('div');
  menuWrapper.classList.add('column-menu-wrapper');

  const menuBtn = document.createElement('button');
  menuBtn.classList.add('column-menu-btn');
  menuBtn.type = 'button';
  menuBtn.setAttribute('aria-haspopup', 'menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-label', `${column.name} column menu`);
  const menuIcon = document.createElement('span');
  menuIcon.dataset.lucide = 'ellipsis-vertical';
  menuIcon.setAttribute('aria-hidden', 'true');
  menuBtn.appendChild(menuIcon);
  menuBtn.title = 'Column menu';

  const menu = document.createElement('div');
  menu.classList.add('column-menu', 'hidden');
  menu.setAttribute('role', 'menu');

  const editColBtn = document.createElement('button');
  editColBtn.classList.add('column-menu-item');
  editColBtn.type = 'button';
  editColBtn.setAttribute('role', 'menuitem');
  const editIcon = document.createElement('span');
  editIcon.dataset.lucide = 'pencil';
  editIcon.setAttribute('aria-hidden', 'true');
  editColBtn.appendChild(editIcon);
  editColBtn.appendChild(document.createTextNode(' Edit'));
  editColBtn.title = 'Edit column';
  editColBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllColumnMenus();
    showEditColumnModal(column.id);
  });

  const deleteColBtn = document.createElement('button');
  deleteColBtn.classList.add('column-menu-item', 'danger');
  deleteColBtn.type = 'button';
  deleteColBtn.setAttribute('role', 'menuitem');
  const deleteIcon = document.createElement('span');
  deleteIcon.dataset.lucide = 'trash-2';
  deleteIcon.setAttribute('aria-hidden', 'true');
  deleteColBtn.appendChild(deleteIcon);
  deleteColBtn.appendChild(document.createTextNode(' Delete'));
  deleteColBtn.title = 'Delete column';
  deleteColBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllColumnMenus();
    (async () => {
      if (column.id === DONE_COLUMN_ID) {
        await alertDialog({ title: 'Cannot Delete Column', message: 'The Done column is permanent and cannot be deleted.' });
        return;
      }

      const columns = loadColumns();
      if (columns.length <= 1) {
        await alertDialog({ title: 'Cannot Delete Column', message: 'Cannot delete the last column.' });
        return;
      }

      const tasks = loadTasks();
      const tasksInColumn = tasks.filter((t) => t.column === column.id);
      const colName = column?.name ? `"${column.name}"` : 'this column';
      const message = tasksInColumn.length > 0
        ? `Delete ${colName}? This will also delete ${tasksInColumn.length} task(s).`
        : `Delete ${colName}?`;

      const ok = await confirmDialog({ title: 'Delete Column', message, confirmText: 'Delete' });
      if (!ok) return;
      if (deleteColumn(column.id)) emit(DATA_CHANGED);
    })();
  });

  // Sort submenu
  const sortWrapper = document.createElement('div');
  sortWrapper.classList.add('column-menu-submenu-wrapper');

  const sortBtn = document.createElement('button');
  sortBtn.classList.add('column-menu-item', 'has-submenu');
  sortBtn.type = 'button';
  sortBtn.setAttribute('role', 'menuitem');
  sortBtn.setAttribute('aria-haspopup', 'menu');
  sortBtn.setAttribute('aria-expanded', 'false');
  const sortIcon = document.createElement('span');
  sortIcon.dataset.lucide = 'arrow-up-down';
  sortIcon.setAttribute('aria-hidden', 'true');
  sortBtn.appendChild(sortIcon);
  sortBtn.appendChild(document.createTextNode(' Sort'));
  const chevronIcon = document.createElement('span');
  chevronIcon.dataset.lucide = 'chevron-left';
  chevronIcon.classList.add('submenu-chevron');
  chevronIcon.setAttribute('aria-hidden', 'true');
  sortBtn.appendChild(chevronIcon);
  sortBtn.title = 'Sort tasks in column';

  const sortSubmenu = document.createElement('div');
  sortSubmenu.classList.add('column-submenu', 'hidden');
  sortSubmenu.setAttribute('role', 'menu');

  const sortByDueDateBtn = document.createElement('button');
  sortByDueDateBtn.classList.add('column-menu-item');
  sortByDueDateBtn.type = 'button';
  sortByDueDateBtn.setAttribute('role', 'menuitem');
  sortByDueDateBtn.textContent = 'By Due Date';
  sortByDueDateBtn.title = 'Sort by due date (earliest first)';
  sortByDueDateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllColumnMenus();
    sortColumnTasks(column.id, 'dueDate');
  });

  const sortByPriorityBtn = document.createElement('button');
  sortByPriorityBtn.classList.add('column-menu-item');
  sortByPriorityBtn.type = 'button';
  sortByPriorityBtn.setAttribute('role', 'menuitem');
  sortByPriorityBtn.textContent = 'By Priority';
  sortByPriorityBtn.title = 'Sort by priority (urgent to none)';
  sortByPriorityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllColumnMenus();
    sortColumnTasks(column.id, 'priority');
  });

  sortSubmenu.appendChild(sortByDueDateBtn);
  sortSubmenu.appendChild(sortByPriorityBtn);

  sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = !sortSubmenu.classList.contains('hidden');
    sortSubmenu.classList.toggle('hidden');
    sortBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
  });

  sortWrapper.addEventListener('mouseenter', () => {
    sortSubmenu.classList.remove('hidden');
    sortBtn.setAttribute('aria-expanded', 'true');
  });

  sortWrapper.addEventListener('mouseleave', () => {
    sortSubmenu.classList.add('hidden');
    sortBtn.setAttribute('aria-expanded', 'false');
  });

  sortWrapper.appendChild(sortBtn);
  sortWrapper.appendChild(sortSubmenu);

  menu.appendChild(editColBtn);
  menu.appendChild(sortWrapper);
  menu.appendChild(deleteColBtn);

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    closeAllColumnMenus();
    if (!isOpen) {
      menu.classList.remove('hidden');
      menuBtn.setAttribute('aria-expanded', 'true');
    } else {
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  menuWrapper.appendChild(menuBtn);
  menuWrapper.appendChild(menu);

  headerActions.appendChild(addBtn);
  headerActions.appendChild(menuWrapper);

  headerDiv.appendChild(collapseBtn);
  headerDiv.appendChild(dragHandle);
  headerDiv.appendChild(h2);
  headerDiv.appendChild(taskCounter);
  headerDiv.appendChild(headerActions);

  const ul = document.createElement('ul');
  ul.classList.add('tasks');
  ul.setAttribute('role', 'list');
  ul.setAttribute('aria-label', `Tasks in ${column.name}`);

  if (isCollapsed) {
    ul.classList.add('hidden');
    headerActions.classList.add('hidden');
    taskCounter.classList.add('hidden');
  }

  div.appendChild(headerDiv);
  div.appendChild(ul);

  return div;
}

/**
 * Set up document-level handlers for closing column menus.
 * Called once from render.js.
 */
export function initColumnMenuCloseHandler() {
  document.addEventListener('click', () => closeAllColumnMenus());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllColumnMenus();
  });
}
