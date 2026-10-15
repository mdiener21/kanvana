// Column element DOM construction — extracted from render.js

import { isDoneColumnId, loadColumns, loadTasks } from './storage.js';
import { sortColumnTasks } from './tasks.js';
import { deleteColumn, toggleColumnCollapsed } from './columns.js';
import { showModal, showEditColumnModal } from './modals.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { emit, DATA_CHANGED } from './events.js';
import { h, cx } from './dom.js';
import { formatWipCount, getWipState, wipCounterLabel, applyWipCounter } from './wip-limit.js';

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

export { closeAllColumnMenus };

export function createColumnElement(column) {
  const isCollapsed = column?.collapsed === true;

  const collapseBtn = h('button', {
    class: 'column-collapse-btn',
    type: 'button',
    'aria-label': isCollapsed ? `Expand ${column.name} column` : `Collapse ${column.name} column`,
    title: isCollapsed ? 'Expand column' : 'Collapse column',
    onClick: (e) => {
      e.stopPropagation();
      if (toggleColumnCollapsed(column.id)) emit(DATA_CHANGED);
    }
  },
    h('span', { 'data-lucide': isCollapsed ? 'chevron-right' : 'chevrons-right-left', 'aria-hidden': 'true' })
  );

  const dragHandle = h('button', {
    class: 'column-drag-handle',
    type: 'button',
    'aria-label': 'Drag to reorder column',
    title: 'Drag to reorder'
  },
    h('span', { 'data-lucide': 'grip-vertical', 'aria-hidden': 'true' })
  );

  const taskCount = getTaskCountInColumn(column.id);
  const titleText = isCollapsed
    ? `${column.name} (${formatWipCount(taskCount, column)})`
    : column.name;
  const columnTitle = h('h2', { id: `column-title-${column.id}` }, titleText);

  const taskCounter = h('span', {
    class: cx('task-counter', isCollapsed && 'hidden'),
    'data-column-id': column.id,
    'aria-label': wipCounterLabel(taskCount, column)
  });
  applyWipCounter(taskCounter, taskCount, column);

  const addBtn = h('button', {
    class: 'add-task-btn-icon',
    type: 'button',
    'aria-label': `Add task to ${column.name}`,
    title: 'Add task',
    onClick: () => showModal(column.id)
  },
    h('span', { 'data-lucide': 'plus', 'aria-hidden': 'true' })
  );

  const editColBtn = h('button', {
    class: 'column-menu-item',
    type: 'button',
    role: 'menuitem',
    title: 'Edit column',
    onClick: (e) => {
      e.stopPropagation();
      closeAllColumnMenus();
      showEditColumnModal(column.id);
    }
  },
    h('span', { 'data-lucide': 'pencil', 'aria-hidden': 'true' }),
    ' Edit'
  );

  const deleteColBtn = h('button', {
    class: 'column-menu-item danger',
    type: 'button',
    role: 'menuitem',
    title: 'Delete column',
    onClick: (e) => {
      e.stopPropagation();
      closeAllColumnMenus();
      (async () => {
        if (isDoneColumnId(column.id)) {
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
    }
  },
    h('span', { 'data-lucide': 'trash-2', 'aria-hidden': 'true' }),
    ' Delete'
  );

  const sortByDueDateBtn = h('button', {
    class: 'column-menu-item',
    type: 'button',
    role: 'menuitem',
    title: 'Sort by due date (earliest first)',
    onClick: (e) => {
      e.stopPropagation();
      closeAllColumnMenus();
      sortColumnTasks(column.id, 'dueDate');
    }
  }, 'By Due Date');

  const sortByPriorityBtn = h('button', {
    class: 'column-menu-item',
    type: 'button',
    role: 'menuitem',
    title: 'Sort by priority (urgent to none)',
    onClick: (e) => {
      e.stopPropagation();
      closeAllColumnMenus();
      sortColumnTasks(column.id, 'priority');
    }
  }, 'By Priority');

  const sortSubmenu = h('div', { class: 'column-submenu hidden', role: 'menu' },
    sortByDueDateBtn, sortByPriorityBtn
  );

  const sortBtn = h('button', {
    class: 'column-menu-item has-submenu',
    type: 'button',
    role: 'menuitem',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    title: 'Sort tasks in column',
    onClick: (e) => {
      e.stopPropagation();
      const isExpanded = !sortSubmenu.classList.contains('hidden');
      sortSubmenu.classList.toggle('hidden');
      sortBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
    }
  },
    h('span', { 'data-lucide': 'arrow-up-down', 'aria-hidden': 'true' }),
    ' Sort',
    h('span', { 'data-lucide': 'chevron-left', class: 'submenu-chevron', 'aria-hidden': 'true' })
  );

  const sortWrapper = h('div', { class: 'column-menu-submenu-wrapper' }, sortBtn, sortSubmenu);
  sortWrapper.addEventListener('mouseenter', () => {
    sortSubmenu.classList.remove('hidden');
    sortBtn.setAttribute('aria-expanded', 'true');
  });
  sortWrapper.addEventListener('mouseleave', () => {
    sortSubmenu.classList.add('hidden');
    sortBtn.setAttribute('aria-expanded', 'false');
  });

  const menu = h('div', { class: 'column-menu hidden', role: 'menu' },
    editColBtn, sortWrapper, deleteColBtn
  );

  const menuBtn = h('button', {
    class: 'column-menu-btn',
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-label': `${column.name} column menu`,
    title: 'Column menu',
    onClick: (e) => {
      e.stopPropagation();
      const isOpen = !menu.classList.contains('hidden');
      closeAllColumnMenus();
      if (!isOpen) {
        menu.classList.remove('hidden');
        menuBtn.setAttribute('aria-expanded', 'true');
      } else {
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    }
  },
    h('span', { 'data-lucide': 'ellipsis-vertical', 'aria-hidden': 'true' })
  );

  const menuWrapper = h('div', { class: 'column-menu-wrapper' }, menuBtn, menu);

  const headerActions = h('div', {
    class: cx('column-actions', isCollapsed && 'hidden')
  }, addBtn, menuWrapper);

  const headerDiv = h('header', { class: 'column-header' },
    collapseBtn, dragHandle, columnTitle, taskCounter, headerActions
  );

  const ul = h('ul', {
    class: cx('tasks', isCollapsed && 'hidden'),
    role: 'list',
    'aria-label': `Tasks in ${column.name}`
  });

  return h('article', {
    class: cx('task-column', isCollapsed && 'is-collapsed'),
    'data-column': column.id,
    'data-wip': getWipState(taskCount, column),
    draggable: 'false',
    'aria-labelledby': `column-title-${column.id}`,
    style: column?.color ? { '--column-accent': column.color } : {}
  }, headerDiv, ul);
}

export function initColumnMenuCloseHandler() {
  document.addEventListener('click', () => closeAllColumnMenus());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllColumnMenus();
  });
}
