// Thin orchestrator — delegates to task-card.js, column-element.js, swimlane-renderer.js

import { loadColumns, loadTasks, loadLabels, loadSettings } from './storage.js';
import { initDragDrop } from './dragdrop.js';
import { renderIcons } from './icons.js';
import { refreshNotifications } from './notifications.js';
import { calculateDaysUntilDue, formatCountdown, getCountdownClassName } from './dateutils.js';
import { syncSwimLaneControls } from './swimlanes.js';
import { DONE_COLUMN_ID } from './constants.js';
import { on, DATA_CHANGED } from './events.js';
import { createTaskElement, formatDisplayDate } from './task-card.js';
import { createColumnElement, closeAllColumnMenus, initColumnMenuCloseHandler } from './column-element.js';
import { renderSwimlaneBoard } from './swimlane-renderer.js';

// Subscribe to the event bus so any module can trigger a re-render
// without importing render.js directly (eliminates circular deps).
on(DATA_CHANGED, () => renderBoard());

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

function renderStandardBoard(container, sortedColumns, visibleTasks, settings, labelsMap, today) {
  sortedColumns.forEach(column => {
    const columnEl = createColumnElement(column);
    container.appendChild(columnEl);

    const tasksList = columnEl.querySelector('.tasks');
    const taskCounter = columnEl.querySelector('.task-counter');

    const columnTasks = visibleTasks.filter(t => t.column === column.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const isDoneColumn = column.id === DONE_COLUMN_ID;
    const shouldVirtualize = isDoneColumn && columnTasks.length > DONE_INITIAL_BATCH_SIZE;
    const tasksToRender = shouldVirtualize ? columnTasks.slice(0, doneVisibleCount) : columnTasks;

    tasksToRender.forEach(task => {
      tasksList.appendChild(createTaskElement(task, settings, labelsMap, today));
    });

    if (shouldVirtualize && doneVisibleCount < columnTasks.length) {
      const showMoreBtn = document.createElement('button');
      showMoreBtn.classList.add('show-more-btn');
      showMoreBtn.type = 'button';
      showMoreBtn.textContent = `Show more (${columnTasks.length - doneVisibleCount} remaining)`;
      showMoreBtn.addEventListener('click', () => {
        doneVisibleCount += DONE_LOAD_MORE_SIZE;
        renderBoard();
      });
      tasksList.appendChild(showMoreBtn);
    }

    taskCounter.textContent = columnTasks.length;
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
 * Sync task counters without full re-render (performance optimization)
 */
export function syncTaskCounters(tasksCache) {
  const tasks = tasksCache || loadTasks();
  const labelsById = new Map(loadLabels().map((l) => [l.id, { name: (l.name || '').toString().trim().toLowerCase(), group: (l.group || '').toString().trim().toLowerCase() }]));
  const queryLower = (boardFilterQuery || '').toString().trim().toLowerCase();

  document.querySelectorAll('.task-counter').forEach(counter => {
    const columnId = counter.dataset.columnId;
    if (!columnId) return;

    const columnTasks = tasks.filter(t => {
      if (t.column !== columnId) return false;
      if (!queryLower) return true;
      return taskMatchesFilter(t, queryLower, labelsById);
    });

    counter.textContent = columnTasks.length;
  });
}

/**
 * Sync collapsed column titles without full re-render
 */
export function syncCollapsedTitles(tasksCache) {
  const tasks = tasksCache || loadTasks();
  document.querySelectorAll('.task-column.is-collapsed').forEach(columnEl => {
    const columnId = columnEl.dataset.column;
    const h2 = columnEl.querySelector('h2');
    if (!columnId || !h2) return;

    const taskCount = tasks.filter(t => t.column === columnId).length;
    const columnName = h2.textContent.replace(/\s*\(\d+\)$/, '');
    h2.textContent = `${columnName} (${taskCount})`;
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

  if (toColumn === DONE_COLUMN_ID) {
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
  const labelsById = new Map(labels.map((l) => [l.id, { name: (l.name || '').toString().trim().toLowerCase(), group: (l.group || '').toString().trim().toLowerCase() }]));

  const queryLower = (boardFilterQuery || '').toString().trim().toLowerCase();
  const visibleTasks = queryLower
    ? tasks.filter((t) => taskMatchesFilter(t, queryLower, labelsById))
    : tasks;
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
}
