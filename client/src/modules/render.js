// Thin orchestrator — delegates to task-card.js, column-element.js, swimlane-renderer.js

import { isDoneColumnId, loadColumns, loadTasks, loadLabels, loadSettings } from './storage.js';
import { initDragDrop } from './dragdrop.js';
import { renderIcons } from './icons.js';
import { refreshNotifications } from './notifications.js';
import { calculateDaysUntilDue, formatCountdown, getCountdownClassName } from './dateutils.js';
import { syncSwimLaneControls } from './swimlanes.js';
import { on, DATA_CHANGED } from './events.js';
import { createTaskElement, formatDisplayDate } from './task-card.js';
import { createColumnElement, closeAllColumnMenus, initColumnMenuCloseHandler } from './column-element.js';
import { renderSwimlaneBoard } from './swimlane-renderer.js';
import { formatWipCount, syncColumnWip } from './wip-limit.js';

// Depth of the current drag-reconcile window. While open (> 0), a projected
// DATA_CHANGED patches the board in place via reconcileBoard() instead of the
// full renderBoard() teardown — so the just-dragged node Chrome's DnD engine
// still references is never detached. A counter (not a boolean) survives the
// several DATA_CHANGED events one drop can emit.
let dragReconcileDepth = 0;

export function beginDragReconcile() {
  dragReconcileDepth += 1;
}

export function endDragReconcile() {
  dragReconcileDepth = Math.max(0, dragReconcileDepth - 1);
}

// Subscribe to the event bus so any module can trigger a re-render
// without importing render.js directly (eliminates circular deps).
on(DATA_CHANGED, () => {
  if (dragReconcileDepth > 0 && reconcileBoard()) return;
  renderBoard();
});

let columnMenuCloseHandlerAttached = false;

let boardFilterQuery = '';

// Done column virtualization state
const DONE_INITIAL_BATCH_SIZE = 50;
const DONE_LOAD_MORE_SIZE = 50;
let doneVisibleCount = DONE_INITIAL_BATCH_SIZE;

export function setBoardFilterQuery(query) {
  boardFilterQuery = (query || '').toString();
}

function taskMatchesFilter(task, queryLower, labelsById) {
  if (!queryLower) return true;

  const legacyTitle = typeof task?.text === 'string' ? task.text : '';
  const title = (typeof task?.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  const description = typeof task?.description === 'string' ? task.description : '';
  const priority = typeof task?.priority === 'string' ? task.priority : '';

  if (title.toLowerCase().includes(queryLower)) return true;
  if (description.toLowerCase().includes(queryLower)) return true;
  if (priority.toLowerCase().includes(queryLower)) return true;

  const labelIds = Array.isArray(task?.labels) ? task.labels : [];
  for (const id of labelIds) {
    const label = labelsById.get(id);
    if (!label) continue;
    if (label.name.includes(queryLower)) return true;
    if (label.group.includes(queryLower)) return true;
  }

  return false;
}

// Apply the active board filter. Shared by the full rebuild and the reconcile
// adapter so both show and count exactly the same tasks under a filter.
function selectVisibleTasks(tasks, labels) {
  const queryLower = (boardFilterQuery || '').toString().trim().toLowerCase();
  if (!queryLower) return tasks;
  const labelsById = new Map(
    labels.map((l) => [
      l.id,
      {
        name: (l.name || '').toString().trim().toLowerCase(),
        group: (l.group || '').toString().trim().toLowerCase(),
      },
    ])
  );
  return tasks.filter((t) => taskMatchesFilter(t, queryLower, labelsById));
}

// The Done-column "Show more" control. Shared by the full rebuild and the
// reconcile adapter so both grow the virtualized batch identically.
function buildShowMoreButton(remaining) {
  const showMoreBtn = document.createElement('button');
  showMoreBtn.classList.add('show-more-btn');
  showMoreBtn.type = 'button';
  showMoreBtn.textContent = `Show more (${remaining} remaining)`;
  showMoreBtn.addEventListener('click', () => {
    doneVisibleCount += DONE_LOAD_MORE_SIZE;
    renderBoard();
  });
  return showMoreBtn;
}

function renderStandardBoard(container, sortedColumns, visibleTasks, settings, labelsMap, today) {
  sortedColumns.forEach(column => {
    const columnEl = createColumnElement(column);
    container.appendChild(columnEl);

    const tasksList = columnEl.querySelector('.tasks');
    const taskCounter = columnEl.querySelector('.task-counter');

    const columnTasks = visibleTasks.filter(t => t.column === column.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const isDoneColumn = isDoneColumnId(column.id);
    const shouldVirtualize = isDoneColumn && columnTasks.length > DONE_INITIAL_BATCH_SIZE;
    const tasksToRender = shouldVirtualize ? columnTasks.slice(0, doneVisibleCount) : columnTasks;

    tasksToRender.forEach(task => {
      tasksList.appendChild(createTaskElement(task, settings, labelsMap, today));
    });

    if (shouldVirtualize && doneVisibleCount < columnTasks.length) {
      tasksList.appendChild(buildShowMoreButton(columnTasks.length - doneVisibleCount));
    }

    syncColumnWip(columnEl, columnTasks.length, column);
  });
}

// Update the column select dropdown
function updateColumnSelect() {
  const columns = loadColumns();
  const select = document.getElementById('task-column');
  select.innerHTML = '';
  columns.forEach(col => {
    const option = document.createElement('option');
    option.value = col.id;
    option.textContent = col.name;
    select.appendChild(option);
  });
}

/**
 * Sync collapsed column titles without full re-render
 */
export function syncCollapsedTitles(tasksCache) {
  const tasks = tasksCache || loadTasks();
  const columns = loadColumns();
  document.querySelectorAll('.task-column.is-collapsed').forEach(columnEl => {
    const columnId = columnEl.dataset.column;
    const h2 = columnEl.querySelector('h2');
    if (!columnId || !h2) return;

    const column = columns.find((c) => c.id === columnId);
    const taskCount = tasks.filter(t => t.column === columnId).length;
    const columnName = h2.textContent.replace(/\s*\(\d+(?:\/\d+)?\)$/, '');
    h2.textContent = `${columnName} (${formatWipCount(taskCount, column)})`;
  });
}

/**
 * Update the due-date element on a moved task card.
 */
export function syncMovedTaskDueDate(taskId, toColumn, tasksCache) {
  if (!taskId) return;

  const taskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);
  if (!taskEl) return;

  const dueDateEl = taskEl.querySelector('.task-date');
  if (!dueDateEl) return;

  const tasks = tasksCache || loadTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const dueDateRaw = typeof task.dueDate === 'string' ? task.dueDate.trim() : '';
  if (!dueDateRaw) return;

  const settings = loadSettings();
  const formattedDate = formatDisplayDate(dueDateRaw, settings?.locale);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilDue = calculateDaysUntilDue(dueDateRaw, today);
  if (daysUntilDue === null) return;

  dueDateEl.classList.remove('countdown-urgent', 'countdown-warning', 'countdown-normal', 'countdown-none');

  if (isDoneColumnId(toColumn)) {
    dueDateEl.textContent = `Due ${formattedDate}`;
    dueDateEl.classList.add('countdown-none');
  } else {
    const countdown = formatCountdown(daysUntilDue);
    const urgentThreshold = settings?.countdownUrgentThreshold ?? 3;
    const warningThreshold = settings?.countdownWarningThreshold ?? 10;
    const countdownClass = getCountdownClassName(daysUntilDue, urgentThreshold, warningThreshold);
    dueDateEl.textContent = `Due ${formattedDate} (${countdown})`;
    dueDateEl.classList.add(countdownClass);
  }
}

/**
 * reconcile adapter — patch the standard board DOM in place to match the
 * projected read model, reusing existing card nodes instead of tearing the
 * board down. Used on the drag-drop path so the just-dragged node (which
 * Chrome's DnD engine still references) is never detached by an innerHTML
 * reset. Returns true when it handled the update; false when a structural or
 * swimlane change means the caller must fall back to renderBoard().
 */
export function reconcileBoard() {
  const container = document.getElementById('board-container');
  if (!container) return false;

  const settings = loadSettings();
  // Swimlane boards have a different DOM shape; the reconcile adapter only
  // handles the standard board. Defer to a full rebuild otherwise.
  if (settings.swimLanesEnabled === true) return false;

  const columns = loadColumns();
  const tasks = loadTasks();
  const labels = loadLabels();
  const labelsMap = new Map(labels.map((l) => [l.id, l]));
  const visibleTasks = selectVisibleTasks(tasks, labels);

  // Structural changes (a column added or removed) need a rebuild — the DOM
  // has no node to patch. A pure task move never changes the column set.
  const domColumnIds = new Set(
    [...container.querySelectorAll('.task-column')].map((el) => el.dataset.column)
  );
  const stateColumnIds = columns.map((c) => c.id);
  if (
    domColumnIds.size !== stateColumnIds.length ||
    stateColumnIds.some((id) => !domColumnIds.has(id))
  ) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Index every card currently on the board by task id, so a task that changed
  // column is re-parented (node kept alive) rather than removed and recreated.
  const existingCards = new Map();
  container.querySelectorAll('.task[data-task-id]').forEach((el) => {
    existingCards.set(el.dataset.taskId, el);
  });

  const usedIds = new Set();
  const sortedColumns = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  sortedColumns.forEach((column) => {
    const columnEl = container.querySelector(`.task-column[data-column="${column.id}"]`);
    if (!columnEl) return;
    const tasksList = columnEl.querySelector('.tasks');
    if (!tasksList) return;

    const columnTasks = visibleTasks
      .filter((t) => t.column === column.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Mirror renderStandardBoard's Done virtualization so a reconcile of an
    // overfull Done column renders only the visible batch, not every card.
    const isDoneColumn = isDoneColumnId(column.id);
    const shouldVirtualize = isDoneColumn && columnTasks.length > DONE_INITIAL_BATCH_SIZE;
    const tasksToRender = shouldVirtualize ? columnTasks.slice(0, doneVisibleCount) : columnTasks;

    tasksList.querySelector('.show-more-btn')?.remove();

    tasksToRender.forEach((task) => {
      let card = existingCards.get(task.id);
      const reused = card !== undefined;
      if (!reused) {
        card = createTaskElement(task, settings, labelsMap, today);
      }
      // appendChild moves an already-attached node to the correct position.
      tasksList.appendChild(card);
      // A reused card keeps its old due-date markup; patch it in place so a
      // move across the Done boundary updates the countdown without recreating
      // (and detaching) the node. Freshly created cards are already correct.
      if (reused) syncMovedTaskDueDate(task.id, column.id, tasks);
      usedIds.add(task.id);
    });

    if (shouldVirtualize && doneVisibleCount < columnTasks.length) {
      tasksList.appendChild(buildShowMoreButton(columnTasks.length - doneVisibleCount));
    }

    syncColumnWip(columnEl, columnTasks.length, column);
  });

  existingCards.forEach((el, id) => {
    if (!usedIds.has(id)) el.remove();
  });

  syncCollapsedTitles(tasks);
  refreshNotifications();
  performance.mark('kanvana:board-render:reconcile');

  return true;
}

// Render all columns and tasks
export function renderBoard() {
  const columns = loadColumns();
  const tasks = loadTasks();
  const labels = loadLabels();
  const settings = loadSettings();
  syncSwimLaneControls(settings);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const labelsMap = new Map(labels.map(l => [l.id, l]));
  const visibleTasks = selectVisibleTasks(tasks, labels);
  const container = document.getElementById('board-container');
  container.innerHTML = '';
  container.dataset.viewMode = settings.swimLanesEnabled === true ? 'swimlanes' : 'columns';
  container.dataset.swimlaneGroupBy = settings.swimLaneGroupBy || '';
  container.dataset.swimlaneLabelGroup = settings.swimLaneLabelGroup || '';
  container.classList.toggle('board-container-swimlanes', settings.swimLanesEnabled === true);

  const sortedColumns = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (settings.swimLanesEnabled === true) {
    renderSwimlaneBoard(container, sortedColumns, visibleTasks, labels, settings, labelsMap, today);
  } else {
    renderStandardBoard(container, sortedColumns, visibleTasks, settings, labelsMap, today);
  }

  initDragDrop();
  updateColumnSelect();
  renderIcons();
  refreshNotifications();

  if (!columnMenuCloseHandlerAttached) {
    columnMenuCloseHandlerAttached = true;
    initColumnMenuCloseHandler();
  }
  performance.mark('kanvana:board-render:full');
}
