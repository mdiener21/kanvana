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
import { createTaskElement } from './task-card.js';
import { emit, DATA_CHANGED } from './events.js';
import { isDoneColumn as isPermanentDoneColumn } from './constants.js';
import { h, cx } from './dom.js';

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
    style: column?.color ? { '--column-accent': column.color } : {}
  },
    collapseBtn,
    !isCollapsed ? h('h2', {}, column.name) : null,
    !isCollapsed ? h('span', { class: 'task-counter', 'data-column-id': column.id, 'aria-label': 'Task count' }, String(taskCount)) : null,
    !isCollapsed ? h('button', {
      class: 'add-task-btn-icon', type: 'button',
      'aria-label': `Add task to ${column.name}`, title: 'Add task',
      onClick: () => showModal(column.id)
    }, h('span', { 'data-lucide': 'plus', 'aria-hidden': 'true' })) : null
  );
}

export function createSwimlaneLaneHeader(lane, activeTaskCount, hiddenDoneCount, isCollapsed, laneColor) {
  const main = h('div', { class: 'swimlane-row-header-main' },
    h('div', { class: 'swimlane-row-title' }, lane.value),
    h('div', { class: 'swimlane-row-meta' },
      h('span', { class: 'swimlane-row-badge' }, `${activeTaskCount} active`),
      hiddenDoneCount > 0 ? h('span', { class: 'swimlane-row-badge is-muted' }, `${hiddenDoneCount} done hidden`) : null
    )
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

export function createSwimlaneCell(column, lane, tasksInCell, visibleTasks, settings, labelsMap, today, cellCollapsed) {
  const isColumnCollapsed = column?.collapsed === true;
  const isDone = isPermanentDoneColumn(column);
  const isCollapsed = cellCollapsed === true;
  const hiddenTaskCount = getHiddenTaskCountForLane(tasksInCell, column.id);

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
    const taskCount = tasksInCell.length;
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
      isCollapsed ? h('span', { class: 'swimlane-cell-summary' },
        taskCount > 0 ? `${taskCount} task${taskCount === 1 ? '' : 's'}` : 'Empty'
      ) : null,
      addBtn
    ));
  }

  if (isDone || isColumnCollapsed) {
    const summaryText = isColumnCollapsed
      ? (tasksInCell.length > 0 ? `${tasksInCell.length} task${tasksInCell.length === 1 ? '' : 's'}` : 'Empty')
      : (hiddenTaskCount > 0 ? `${hiddenTaskCount} completed item${hiddenTaskCount === 1 ? '' : 's'} hidden` : 'Drop completed tasks here');
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

export function renderSwimlaneBoard(container, sortedColumns, visibleTasks, labels, settings, labelsMap, today) {
  const lanes = groupTasksBySwimLane(visibleTasks, settings.swimLaneGroupBy, labels, settings.swimLaneLabelGroup, settings.swimLaneOrder);
  const grid = buildBoardGrid(sortedColumns, lanes, visibleTasks, settings.swimLaneGroupBy, labels, settings.swimLaneLabelGroup);

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
    const collapsed = isSwimLaneCollapsed(lane.key, settings);
    const activeTaskCount = sortedColumns
      .filter((column) => !isPermanentDoneColumn(column))
      .reduce((count, column) => count + ((lane.cells[column.id] || []).length), 0);
    const doneColumn = sortedColumns.find((column) => isPermanentDoneColumn(column));
    const hiddenDoneCount = doneColumn ? (lane.cells[doneColumn.id] || []).length : 0;
    const laneLabel = labelsMap.get(lane.key);
    const laneColor = laneLabel?.color || null;

    const cellsWrapper = h('div', { class: 'swimlane-row-cells' });
    sortedColumns.forEach((column) => {
      const tasksInCell = (lane.cells[column.id] || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const cellCollapsed = isSwimLaneCellCollapsed(lane.key, column.id, settings);
      const visibleTasksInCell = collapsed
        ? []
        : column?.collapsed === true
          ? tasksInCell
          : cellCollapsed ? [] : getVisibleTasksForLane(tasksInCell, column.id);
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
