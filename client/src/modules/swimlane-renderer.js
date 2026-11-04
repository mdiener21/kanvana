// Swimlane board rendering — extracted from render.js

import { showModal } from './modals.js';
import { toggleColumnCollapsed } from './columns.js';
import {
  buildBoardGrid,
  getHiddenTaskCountForLane,
  getVisibleTasksForLane,
  groupTasksBySwimLane,
  isSwimLaneCollapsed,
  isSwimLaneCellCollapsed,
  toggleSwimLaneCollapsed,
  toggleSwimLaneCellCollapsed
} from './swimlanes.js';
import { createTaskElement, syncTaskElement } from './task-card.js';
import { emit, DATA_CHANGED } from './events.js';
import { isDoneColumn as isPermanentDoneColumn } from './constants.js';
import { h, cx } from './dom.js';
import { applyWipCounter, getWipState, syncColumnWip } from './wip-limit.js';
import { byOrder } from './utils.js';

function buildSwimlaneCounter(column, taskCount) {
  const counter = h('span', { class: 'task-counter', 'data-column-id': column.id });
  applyWipCounter(counter, taskCount, column);
  return counter;
}

export function createSwimlaneHeaderCell(column, taskCount) {
  const isCollapsed = column?.collapsed === true;

  const collapseBtn = h('button', {
    class: 'swimlane-column-collapse-btn',
    type: 'button',
    'aria-label': isCollapsed ? `Expand ${column.name} column` : `Collapse ${column.name} column`,
    title: isCollapsed ? 'Expand column' : 'Collapse column',
    onClick: (event) => { event.stopPropagation(); if (toggleColumnCollapsed(column.id)) emit(DATA_CHANGED); }
  },
    h('span', { 'data-lucide': isCollapsed ? 'chevron-right' : 'chevrons-right-left', 'aria-hidden': 'true' })
  );

  return h('section', {
    class: cx('swimlane-column-header', isCollapsed && 'is-collapsed'),
    'data-column': column.id,
    'data-wip': getWipState(taskCount, column),
    style: column?.color ? { '--column-accent': column.color } : {}
  },
    collapseBtn,
    !isCollapsed ? h('h2', {}, column.name) : null,
    !isCollapsed ? buildSwimlaneCounter(column, taskCount) : null,
    !isCollapsed ? h('button', {
      class: 'add-task-btn-icon', type: 'button',
      'aria-label': `Add task to ${column.name}`, title: 'Add task',
      onClick: () => showModal(column.id)
    }, h('span', { 'data-lucide': 'plus', 'aria-hidden': 'true' })) : null
  );
}

function buildLaneBadges(activeTaskCount, hiddenDoneCount) {
  const badges = [h('span', { class: 'swimlane-row-badge' }, `${activeTaskCount} active`)];
  if (hiddenDoneCount > 0) badges.push(h('span', { class: 'swimlane-row-badge is-muted' }, `${hiddenDoneCount} done hidden`));
  return badges;
}

export function createSwimlaneLaneHeader(lane, activeTaskCount, hiddenDoneCount, isCollapsed, laneColor) {
  const main = h('div', { class: 'swimlane-row-header-main' },
    h('div', { class: 'swimlane-row-title' }, lane.value),
    h('div', { class: 'swimlane-row-meta' }, ...buildLaneBadges(activeTaskCount, hiddenDoneCount))
  );

  const toggleBtn = h('button', {
    class: 'swimlane-row-toggle',
    type: 'button',
    'aria-expanded': String(!isCollapsed),
    'aria-label': isCollapsed ? `Expand ${lane.value} swim lane` : `Collapse ${lane.value} swim lane`,
    title: isCollapsed ? 'Expand swim lane' : 'Collapse swim lane',
    onClick: () => { if (toggleSwimLaneCollapsed(lane.key)) emit(DATA_CHANGED); }
  },
    h('span', { 'data-lucide': isCollapsed ? 'chevron-right' : 'chevron-down', 'aria-hidden': 'true' })
  );

  return h('header', {
    class: 'swimlane-row-header',
    style: laneColor ? { '--lane-accent': laneColor } : {}
  }, toggleBtn, main);
}

function taskCountText(count) {
  return count > 0 ? `${count} task${count === 1 ? '' : 's'}` : 'Empty';
}

// The one summary a cell shows, or null when it shows none. Shared by the full rebuild and the
// reconcile adapter so a drop updates it to exactly what a rebuild would show.
function getCellSummaryText(column, tasksInCell, cellCollapsed) {
  if (column?.collapsed === true) return taskCountText(tasksInCell.length);
  if (isPermanentDoneColumn(column)) {
    const hiddenTaskCount = getHiddenTaskCountForLane(tasksInCell, column.id);
    return hiddenTaskCount > 0
      ? `${hiddenTaskCount} completed item${hiddenTaskCount === 1 ? '' : 's'} hidden`
      : 'Drop completed tasks here';
  }
  return cellCollapsed === true ? taskCountText(tasksInCell.length) : null;
}

export function createSwimlaneCell(column, lane, tasksInCell, visibleTasks, settings, labelsMap, today, cellCollapsed) {
  const isColumnCollapsed = column?.collapsed === true;
  const isDone = isPermanentDoneColumn(column);
  const isCollapsed = cellCollapsed === true;
  const summaryText = getCellSummaryText(column, tasksInCell, cellCollapsed);

  const cell = h('section', {
    class: cx('swimlane-cell',
      isColumnCollapsed && 'is-column-collapsed',
      isDone && 'swimlane-cell-done',
      (cellCollapsed && !isColumnCollapsed && !isDone) && 'is-cell-collapsed'
    ),
    'data-column': column.id,
    'data-lane-key': lane.key,
    'data-lane-label': lane.value,
    'aria-label': `${lane.value}, ${column.name}`,
    style: column?.color ? { '--column-accent': column.color } : {}
  });

  if (!isDone && !isColumnCollapsed) {
    const toggleBtn = h('button', {
      type: 'button',
      class: 'swimlane-cell-toggle',
      'aria-expanded': String(!isCollapsed),
      'aria-label': `${isCollapsed ? 'Expand' : 'Collapse'} tasks in ${lane.value}, ${column.name}`,
      onClick: () => { toggleSwimLaneCellCollapsed(lane.key, column.id); emit(DATA_CHANGED); }
    }, h('i', { 'data-lucide': isCollapsed ? 'chevron-right' : 'chevron-down' }));

    const addBtn = h('button', {
      type: 'button',
      class: 'swimlane-cell-add-btn',
      'aria-label': `Add task to ${column.name}, ${lane.value}`,
      title: 'Add task',
      onClick: () => showModal(column.id, { groupBy: settings.swimLaneGroupBy, laneKey: lane.key })
    }, h('i', { 'data-lucide': 'plus', 'aria-hidden': 'true' }));

    cell.appendChild(h('div', { class: 'swimlane-cell-header' },
      toggleBtn,
      isCollapsed ? h('span', { class: 'swimlane-cell-summary' }, summaryText) : null,
      addBtn
    ));
  }

  if (isDone || isColumnCollapsed) {
    cell.appendChild(h('div', { class: 'swimlane-cell-summary' }, summaryText));
  }

  const tasksList = h('ul', {
    class: cx('tasks swimlane-tasks', (isDone || isColumnCollapsed) && 'swimlane-tasks-hidden-done'),
    'data-column': column.id,
    'data-lane-key': lane.key,
    'data-lane-label': lane.value,
    role: 'list',
    'aria-label': `Tasks in ${lane.value}, ${column.name}`
  });
  visibleTasks.forEach((task) => tasksList.appendChild(createTaskElement(task, settings, labelsMap, today)));
  cell.appendChild(tasksList);
  return cell;
}

// What a lane shows, derived from the same grid by the full rebuild and the reconcile adapter.
function describeLane(lane, sortedColumns, settings) {
  const collapsed = isSwimLaneCollapsed(lane.key, settings);
  const activeTaskCount = sortedColumns
    .filter((column) => !isPermanentDoneColumn(column))
    .reduce((count, column) => count + ((lane.cells[column.id] || []).length), 0);
  const doneColumn = sortedColumns.find((column) => isPermanentDoneColumn(column));
  const hiddenDoneCount = doneColumn ? (lane.cells[doneColumn.id] || []).length : 0;
  const cells = sortedColumns.map((column) => {
    const tasksInCell = (lane.cells[column.id] || []).slice().sort(byOrder);
    const cellCollapsed = isSwimLaneCellCollapsed(lane.key, column.id, settings);
    const visibleTasksInCell = collapsed
      ? []
      : column?.collapsed === true
        ? tasksInCell
        : cellCollapsed ? [] : getVisibleTasksForLane(tasksInCell, column.id);
    return { column, tasksInCell, cellCollapsed, visibleTasksInCell };
  });
  return { collapsed, activeTaskCount, hiddenDoneCount, cells };
}

function buildLanes(sortedColumns, visibleTasks, labels, settings) {
  const lanes = groupTasksBySwimLane(visibleTasks, settings.swimLaneGroupBy, labels, settings.swimLaneLabelGroup, settings.swimLaneOrder);
  return buildBoardGrid(sortedColumns, lanes, visibleTasks, settings.swimLaneGroupBy, labels, settings.swimLaneLabelGroup);
}

export function renderSwimlaneBoard(container, sortedColumns, visibleTasks, labels, settings, labelsMap, today) {
  const grid = buildLanes(sortedColumns, visibleTasks, labels, settings);

  const colTemplate = sortedColumns
    .map((column) => (column?.collapsed === true ? '72px' : 'minmax(280px, 1fr)'))
    .join(' ');

  const headerRow = h('div', { class: 'swimlane-grid-header' });
  sortedColumns.forEach((column) => {
    const taskCount = visibleTasks.filter((task) => task.column === column.id).length;
    headerRow.appendChild(createSwimlaneHeaderCell(column, taskCount));
  });

  const board = h('div', {
    class: 'swimlane-board',
    style: {
      '--swimlane-column-count': String(sortedColumns.length),
      '--swimlane-grid-template': colTemplate
    }
  }, headerRow);

  grid.forEach((lane) => {
    const { collapsed, activeTaskCount, hiddenDoneCount, cells } = describeLane(lane, sortedColumns, settings);
    const laneLabel = labelsMap.get(lane.key);
    const laneColor = laneLabel?.color || null;

    const cellsWrapper = h('div', { class: 'swimlane-row-cells' });
    cells.forEach(({ column, tasksInCell, cellCollapsed, visibleTasksInCell }) => {
      cellsWrapper.appendChild(createSwimlaneCell(column, lane, tasksInCell, visibleTasksInCell, settings, labelsMap, today, cellCollapsed));
    });

    board.appendChild(h('section', {
      class: cx('swimlane-row', collapsed && 'is-collapsed'),
      'data-lane-key': lane.key,
      'data-lane-label': lane.value,
    },
      createSwimlaneLaneHeader(lane, activeTaskCount, hiddenDoneCount, collapsed, laneColor),
      cellsWrapper
    ));
  });

  container.appendChild(board);
}

// Index a board's lanes and their cells by key, so ids are never spliced into a selector.
function indexBoardRows(container) {
  const rows = new Map();
  container.querySelectorAll('.swimlane-row').forEach((rowEl) => {
    const cells = new Map();
    rowEl.querySelectorAll('.swimlane-cell').forEach((cellEl) => cells.set(cellEl.dataset.column, cellEl));
    rows.set(rowEl.dataset.laneKey, { rowEl, cells });
  });
  return rows;
}

// A drop never adds a lane or a column, so anything else needs a real rebuild. Lanes that lost
// their last task are fine: they are removed in place.
function boardMatchesGrid(container, rows, headers, grid, sortedColumns, settings) {
  if (container.dataset.viewMode !== 'swimlanes') return false;
  if (container.dataset.swimlaneGroupBy !== (settings.swimLaneGroupBy || '')) return false;
  if (container.dataset.swimlaneLabelGroup !== (settings.swimLaneLabelGroup || '')) return false;

  const headerIds = [...headers.keys()];
  if (headerIds.length !== sortedColumns.length) return false;
  if (sortedColumns.some((column, index) => column.id !== headerIds[index])) return false;

  const laneKeys = grid.map((lane) => lane.key);
  const stateKeys = new Set(laneKeys);
  const keptDomKeys = [...rows.keys()].filter((key) => stateKeys.has(key));
  if (keptDomKeys.length !== laneKeys.length) return false;
  if (laneKeys.some((key, index) => key !== keptDomKeys[index])) return false;

  return grid.every((lane) => {
    const { cells } = rows.get(lane.key);
    return sortedColumns.every((column) => cells.get(column.id)?.querySelector('.tasks'));
  });
}

// Put the cards in list order, touching only those out of place: a card already where it belongs
// (usually the one just dropped) is never detached and re-inserted.
function placeCards(listEl, cards) {
  let cursor = listEl.firstElementChild;
  cards.forEach((card) => {
    if (card === cursor) cursor = cursor.nextElementSibling;
    else listEl.insertBefore(card, cursor);
  });
}

/**
 * Patch a swimlane board in place to match the read model, reusing its rows, cells, lists and
 * cards so the drop that triggered this never tears down what SortableJS still holds.
 *
 * `droppedCard` is the node Sortable is finishing with. It is refreshed from state, and it stays
 * attached even when state says it is not shown (a hidden Done cell): the caller removes it once
 * Sortable has let go.
 *
 * @returns {{ droppedCardShown: boolean, removedLanes: boolean, createdCards: boolean } | null}
 *   null, with nothing changed, when the board needs a full rebuild instead.
 */
export function reconcileSwimlaneBoard(container, sortedColumns, visibleTasks, labels, settings, labelsMap, today, droppedCard = null) {
  const grid = buildLanes(sortedColumns, visibleTasks, labels, settings);
  const rows = indexBoardRows(container);
  const headers = new Map(
    [...container.querySelectorAll('.swimlane-column-header')].map((el) => [el.dataset.column, el])
  );
  if (!boardMatchesGrid(container, rows, headers, grid, sortedColumns, settings)) return null;

  const existingCards = new Map();
  container.querySelectorAll('.task[data-task-id]').forEach((el) => existingCards.set(el.dataset.taskId, el));
  const shownIds = new Set();
  let createdCards = false;

  grid.forEach((lane) => {
    const { activeTaskCount, hiddenDoneCount, cells } = describeLane(lane, sortedColumns, settings);
    const { rowEl, cells: cellEls } = rows.get(lane.key);
    rowEl.querySelector('.swimlane-row-meta')?.replaceChildren(...buildLaneBadges(activeTaskCount, hiddenDoneCount));

    cells.forEach(({ column, tasksInCell, cellCollapsed, visibleTasksInCell }) => {
      const cellEl = cellEls.get(column.id);
      const summaryEl = cellEl.querySelector('.swimlane-cell-summary');
      if (summaryEl) summaryEl.textContent = getCellSummaryText(column, tasksInCell, cellCollapsed);

      placeCards(cellEl.querySelector('.tasks'), visibleTasksInCell.map((task) => {
        shownIds.add(task.id);
        const card = existingCards.get(task.id);
        if (card) {
          if (card === droppedCard) syncTaskElement(card, task, settings, labelsMap, today);
          return card;
        }
        createdCards = true;
        return createTaskElement(task, settings, labelsMap, today);
      }));
    });
  });

  sortedColumns.forEach((column) => {
    const taskCount = visibleTasks.filter((task) => task.column === column.id).length;
    syncColumnWip(headers.get(column.id), taskCount, column);
  });

  existingCards.forEach((el, id) => {
    if (!shownIds.has(id) && el !== droppedCard) el.remove();
  });

  const stateKeys = new Set(grid.map((lane) => lane.key));
  let removedLanes = false;
  rows.forEach(({ rowEl }, key) => {
    if (stateKeys.has(key)) return;
    rowEl.remove();
    removedLanes = true;
  });

  const droppedCardShown = !droppedCard || shownIds.has(droppedCard.dataset.taskId);
  // Hidden by style rather than detached: Sortable is still finishing with this node.
  if (!droppedCardShown) droppedCard.style.display = 'none';
  else if (droppedCard?.style.display === 'none') droppedCard.style.removeProperty('display');

  return { droppedCardShown, removedLanes, createdCards };
}
