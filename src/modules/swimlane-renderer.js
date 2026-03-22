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
  SWIMLANE_HIDDEN_DONE_COLUMN_ID,
  toggleSwimLaneCollapsed,
  toggleSwimLaneCellCollapsed
} from './swimlanes.js';
import { createTaskElement } from './task-card.js';
import { emit, DATA_CHANGED } from './events.js';

export function createSwimlaneHeaderCell(column, taskCount) {
  const header = document.createElement('section');
  header.classList.add('swimlane-column-header');
  header.dataset.column = column.id;
  const isCollapsed = column?.collapsed === true;
  if (isCollapsed) header.classList.add('is-collapsed');
  if (column?.color) {
    header.style.setProperty('--column-accent', column.color);
  }

  const collapseBtn = document.createElement('button');
  collapseBtn.classList.add('swimlane-column-collapse-btn');
  collapseBtn.type = 'button';
  collapseBtn.setAttribute('aria-label', isCollapsed ? `Expand ${column.name} column` : `Collapse ${column.name} column`);
  collapseBtn.title = isCollapsed ? 'Expand column' : 'Collapse column';
  const collapseIcon = document.createElement('span');
  collapseIcon.dataset.lucide = isCollapsed ? 'chevron-right' : 'chevrons-right-left';
  collapseIcon.setAttribute('aria-hidden', 'true');
  collapseBtn.appendChild(collapseIcon);
  collapseBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (toggleColumnCollapsed(column.id)) emit(DATA_CHANGED);
  });

  const title = document.createElement('h2');
  title.textContent = column.name;

  const counter = document.createElement('span');
  counter.classList.add('task-counter');
  counter.dataset.columnId = column.id;
  counter.textContent = String(taskCount);
  counter.setAttribute('aria-label', 'Task count');

  const addBtn = document.createElement('button');
  addBtn.classList.add('add-task-btn-icon');
  addBtn.type = 'button';
  addBtn.setAttribute('aria-label', `Add task to ${column.name}`);
  addBtn.title = 'Add task';
  const plusIcon = document.createElement('span');
  plusIcon.dataset.lucide = 'plus';
  plusIcon.setAttribute('aria-hidden', 'true');
  addBtn.appendChild(plusIcon);
  addBtn.addEventListener('click', () => showModal(column.id));

  header.appendChild(collapseBtn);
  if (!isCollapsed) {
    header.appendChild(title);
    header.appendChild(counter);
    header.appendChild(addBtn);
  }
  return header;
}

export function createSwimlaneLaneHeader(lane, activeTaskCount, hiddenDoneCount, isCollapsed, laneColor) {
  const laneHeader = document.createElement('header');
  laneHeader.classList.add('swimlane-row-header');
  if (laneColor) {
    laneHeader.style.setProperty('--lane-accent', laneColor);
  }

  const main = document.createElement('div');
  main.classList.add('swimlane-row-header-main');

  const title = document.createElement('div');
  title.classList.add('swimlane-row-title');
  title.textContent = lane.value;
  main.appendChild(title);

  const meta = document.createElement('div');
  meta.classList.add('swimlane-row-meta');

  const activeBadge = document.createElement('span');
  activeBadge.classList.add('swimlane-row-badge');
  activeBadge.textContent = `${activeTaskCount} active`;
  meta.appendChild(activeBadge);

  if (hiddenDoneCount > 0) {
    const doneBadge = document.createElement('span');
    doneBadge.classList.add('swimlane-row-badge', 'is-muted');
    doneBadge.textContent = `${hiddenDoneCount} done hidden`;
    meta.appendChild(doneBadge);
  }

  main.appendChild(meta);

  const toggleBtn = document.createElement('button');
  toggleBtn.classList.add('swimlane-row-toggle');
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
  toggleBtn.setAttribute('aria-label', isCollapsed ? `Expand ${lane.value} swim lane` : `Collapse ${lane.value} swim lane`);
  toggleBtn.title = isCollapsed ? 'Expand swim lane' : 'Collapse swim lane';
  const toggleIcon = document.createElement('span');
  toggleIcon.dataset.lucide = isCollapsed ? 'chevron-right' : 'chevron-down';
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleBtn.appendChild(toggleIcon);
  toggleBtn.addEventListener('click', () => {
    if (toggleSwimLaneCollapsed(lane.key)) emit(DATA_CHANGED);
  });

  laneHeader.appendChild(toggleBtn);
  laneHeader.appendChild(main);
  return laneHeader;
}

export function createSwimlaneCell(column, lane, tasksInCell, visibleTasks, settings, labelsMap, today, cellCollapsed) {
  const cell = document.createElement('section');
  cell.classList.add('swimlane-cell');
  const isColumnCollapsed = column?.collapsed === true;
  const isDoneColumn = column.id === SWIMLANE_HIDDEN_DONE_COLUMN_ID;
  if (isColumnCollapsed) cell.classList.add('is-column-collapsed');
  if (isDoneColumn) cell.classList.add('swimlane-cell-done');
  if (cellCollapsed && !isColumnCollapsed && !isDoneColumn) cell.classList.add('is-cell-collapsed');
  if (column?.color) cell.style.setProperty('--column-accent', column.color);
  cell.dataset.column = column.id;
  cell.dataset.laneKey = lane.key;
  cell.dataset.laneLabel = lane.value;
  cell.setAttribute('aria-label', `${lane.value}, ${column.name}`);

  const hiddenTaskCount = getHiddenTaskCountForLane(tasksInCell, column.id);

  if (!isDoneColumn && !isColumnCollapsed) {
    const cellHeader = document.createElement('div');
    cellHeader.classList.add('swimlane-cell-header');

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.classList.add('swimlane-cell-toggle');
    const isCollapsed = cellCollapsed === true;
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    toggleBtn.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} tasks in ${lane.value}, ${column.name}`);
    const toggleIcon = document.createElement('i');
    toggleIcon.dataset.lucide = isCollapsed ? 'chevron-right' : 'chevron-down';
    toggleBtn.appendChild(toggleIcon);
    toggleBtn.addEventListener('click', () => {
      toggleSwimLaneCellCollapsed(lane.key, column.id);
      emit(DATA_CHANGED);
    });
    cellHeader.appendChild(toggleBtn);

    if (isCollapsed) {
      const summary = document.createElement('span');
      summary.classList.add('swimlane-cell-summary');
      const taskCount = tasksInCell.length;
      summary.textContent = taskCount > 0
        ? `${taskCount} task${taskCount === 1 ? '' : 's'}`
        : 'Empty';
      cellHeader.appendChild(summary);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.classList.add('swimlane-cell-add-btn');
    addBtn.setAttribute('aria-label', `Add task to ${column.name}, ${lane.value}`);
    addBtn.title = 'Add task';
    const addIcon = document.createElement('i');
    addIcon.dataset.lucide = 'plus';
    addIcon.setAttribute('aria-hidden', 'true');
    addBtn.appendChild(addIcon);
    addBtn.addEventListener('click', () => {
      showModal(column.id, {
        groupBy: settings.swimLaneGroupBy,
        laneKey: lane.key
      });
    });
    cellHeader.appendChild(addBtn);

    cell.appendChild(cellHeader);
  }

  if (isDoneColumn || isColumnCollapsed) {
    const summary = document.createElement('div');
    summary.classList.add('swimlane-cell-summary');
    if (isColumnCollapsed) {
      const taskCount = tasksInCell.length;
      summary.textContent = taskCount > 0
        ? `${taskCount} task${taskCount === 1 ? '' : 's'}`
        : 'Empty';
    } else {
      summary.textContent = hiddenTaskCount > 0
        ? `${hiddenTaskCount} completed item${hiddenTaskCount === 1 ? '' : 's'} hidden`
        : 'Drop completed tasks here';
    }
    cell.appendChild(summary);
  }

  const tasksList = document.createElement('ul');
  tasksList.classList.add('tasks', 'swimlane-tasks');
  if (isDoneColumn || isColumnCollapsed) tasksList.classList.add('swimlane-tasks-hidden-done');
  tasksList.dataset.column = column.id;
  tasksList.dataset.laneKey = lane.key;
  tasksList.dataset.laneLabel = lane.value;
  tasksList.setAttribute('role', 'list');
  tasksList.setAttribute('aria-label', `Tasks in ${lane.value}, ${column.name}`);

  visibleTasks.forEach((task) => {
    tasksList.appendChild(createTaskElement(task, settings, labelsMap, today));
  });

  cell.appendChild(tasksList);
  return cell;
}

export function renderSwimlaneBoard(container, sortedColumns, visibleTasks, labels, settings, labelsMap, today) {
  const lanes = groupTasksBySwimLane(visibleTasks, settings.swimLaneGroupBy, labels, settings.swimLaneLabelGroup);
  const grid = buildBoardGrid(sortedColumns, lanes, visibleTasks, settings.swimLaneGroupBy, labels, settings.swimLaneLabelGroup);
  const board = document.createElement('div');
  board.classList.add('swimlane-board');
  board.style.setProperty('--swimlane-column-count', String(sortedColumns.length));
  const colTemplate = sortedColumns
    .map((column) => (column?.collapsed === true ? '72px' : 'minmax(280px, 1fr)'))
    .join(' ');
  board.style.setProperty('--swimlane-grid-template', colTemplate);

  const headerRow = document.createElement('div');
  headerRow.classList.add('swimlane-grid-header');

  sortedColumns.forEach((column) => {
    const taskCount = visibleTasks.filter((task) => task.column === column.id).length;
    headerRow.appendChild(createSwimlaneHeaderCell(column, taskCount));
  });

  board.appendChild(headerRow);

  grid.forEach((lane) => {
    const row = document.createElement('section');
    row.classList.add('swimlane-row');
    row.dataset.laneKey = lane.key;
    row.dataset.laneLabel = lane.value;

    const collapsed = isSwimLaneCollapsed(lane.key, settings);
    if (collapsed) row.classList.add('is-collapsed');

    const activeTaskCount = sortedColumns
      .filter((column) => column.id !== SWIMLANE_HIDDEN_DONE_COLUMN_ID)
      .reduce((count, column) => count + ((lane.cells[column.id] || []).length), 0);
    const hiddenDoneCount = (lane.cells[SWIMLANE_HIDDEN_DONE_COLUMN_ID] || []).length;

    const laneLabel = labelsMap.get(lane.key);
    const laneColor = laneLabel?.color || null;
    const laneHeader = createSwimlaneLaneHeader(lane, activeTaskCount, hiddenDoneCount, collapsed, laneColor);
    row.appendChild(laneHeader);

    const cellsWrapper = document.createElement('div');
    cellsWrapper.classList.add('swimlane-row-cells');

    sortedColumns.forEach((column) => {
      const tasksInCell = (lane.cells[column.id] || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const cellCollapsed = isSwimLaneCellCollapsed(lane.key, column.id, settings);
      const visibleTasksInCell = collapsed
        ? []
        : column?.collapsed === true
          ? tasksInCell
          : cellCollapsed
            ? []
            : getVisibleTasksForLane(tasksInCell, column.id);
      cellsWrapper.appendChild(createSwimlaneCell(column, lane, tasksInCell, visibleTasksInCell, settings, labelsMap, today, cellCollapsed));
    });

    row.appendChild(cellsWrapper);
    board.appendChild(row);
  });

  container.appendChild(board);
}
