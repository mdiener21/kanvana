import Sortable from 'sortablejs';
import { moveTaskToTopInColumn, updateTaskPositionsFromDrop } from './tasks.js';
import { updateColumnPositions } from './columns.js';
import { emit, DRAG_RECONCILE_BEGIN, DRAG_RECONCILE_END } from './events.js';
import { isDoneColumnId } from './storage.js';
import { commitTogether } from './event-sourcing/emitter.js';

// Store Sortable instances for cleanup
let taskSortables = [];
let columnSortable = null;
let autoScrollInterval = null;
let lastTouchX = 0;
let lastTouchY = 0;
const COLLAPSED_DROP_HOVER_CLASS = 'is-drop-hover';
let isDraggingTask = false;
let activeTaskList = null;

function isSwimlaneViewEnabled() {
  return document.getElementById('board-container')?.dataset?.viewMode === 'swimlanes';
}

function getTaskContainerElement(node) {
  return node?.closest?.('.task-column, .swimlane-cell, [data-column]') || null;
}

// Initialize all drag and drop functionality
export function initDragDrop() {
  destroySortables();
  initTaskSortables();
  initColumnSortable();
}

// Drop only the instances whose list left the board, such as a lane that lost its last task. The
// others keep running: a drop reconciles in place and never reinitializes drag and drop.
export function pruneDetachedTaskSortables() {
  taskSortables = taskSortables.filter((sortable) => {
    if (sortable.el?.isConnected) return true;
    sortable.destroy();
    return false;
  });
}

// Clean up existing sortable instances
function destroySortables() {
  taskSortables.forEach(sortable => sortable.destroy());
  taskSortables = [];
  
  if (columnSortable) {
    columnSortable.destroy();
    columnSortable = null;
  }
  
  cleanupTaskDragState({ restoreCollapsedDropZones: true });
  cleanupColumnDragState();
}

function removePointerTracking() {
  document.removeEventListener('touchmove', trackPointer);
  document.removeEventListener('mousemove', trackPointer);
  document.removeEventListener('dragover', trackPointer);
}

function cleanupTaskDragState({ restoreCollapsedDropZones = false } = {}) {
  document.body.classList.remove('dragging');
  isDraggingTask = false;
  activeTaskList = null;
  stopAutoScroll();
  removePointerTracking();
  clearCollapsedDropHover();
  if (restoreCollapsedDropZones) {
    hideCollapsedDropZones();
  }
}

function cleanupColumnDragState() {
  document.body.classList.remove('dragging-column');
}

// Auto-scroll logic for board and task-list scrolling during drag
function startAutoScroll() {
  const boardContainer = document.getElementById('board-container');
  if (!boardContainer || autoScrollInterval) return;
  
  autoScrollInterval = setInterval(() => {
    if (!boardContainer) return;
    
    const rect = boardContainer.getBoundingClientRect();
    const edgeSize = 80;
    const scrollSpeed = 12;
    
    if (lastTouchX > 0) {
      if (lastTouchX < rect.left + edgeSize && boardContainer.scrollLeft > 0) {
        boardContainer.scrollLeft -= scrollSpeed;
      } else if (lastTouchX > rect.right - edgeSize && 
                 boardContainer.scrollLeft < boardContainer.scrollWidth - boardContainer.clientWidth) {
        boardContainer.scrollLeft += scrollSpeed;
      }
    }

    autoScrollActiveTaskList();
  }, 16); // ~60fps
}

function stopAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
  lastTouchX = 0;
  lastTouchY = 0;
}

function autoScrollActiveTaskList() {
  if (!isDraggingTask || !activeTaskList) return;
  const rect = activeTaskList.getBoundingClientRect();
  const edgeSize = 80;
  const maxSpeed = 20;
  let delta = 0;

  if (lastTouchY > 0) {
    if (lastTouchY < rect.top + edgeSize) {
      const dist = Math.max(0, lastTouchY - rect.top);
      const intensity = (edgeSize - dist) / edgeSize;
      delta = -Math.ceil(intensity * maxSpeed);
    } else if (lastTouchY > rect.bottom - edgeSize) {
      const dist = Math.max(0, rect.bottom - lastTouchY);
      const intensity = (edgeSize - dist) / edgeSize;
      delta = Math.ceil(intensity * maxSpeed);
    }
  }

  if (delta !== 0) {
    activeTaskList.scrollTop += delta;
  }
}

function showCollapsedDropZones() {
  document.querySelectorAll('.task-column.is-collapsed .tasks').forEach((tasksList) => {
    if (tasksList.classList.contains('hidden')) {
      tasksList.dataset.wasHidden = 'true';
      tasksList.classList.remove('hidden');
    }
  });
}

function hideCollapsedDropZones() {
  document.querySelectorAll('.task-column.is-collapsed .tasks').forEach((tasksList) => {
    if (tasksList.dataset.wasHidden === 'true') {
      tasksList.classList.add('hidden');
      delete tasksList.dataset.wasHidden;
    }
  });
}

function clearCollapsedDropHover() {
  document
    .querySelectorAll(`.task-column.is-collapsed.${COLLAPSED_DROP_HOVER_CLASS}`)
    .forEach((column) => column.classList.remove(COLLAPSED_DROP_HOVER_CLASS));
  document
    .querySelectorAll(`.swimlane-cell.is-column-collapsed.${COLLAPSED_DROP_HOVER_CLASS}`)
    .forEach((cell) => cell.classList.remove(COLLAPSED_DROP_HOVER_CLASS));
}

function setCollapsedDropHover(el) {
  clearCollapsedDropHover();
  if (el) el.classList.add(COLLAPSED_DROP_HOVER_CLASS);
}

// Track touch/mouse position globally during drag
function trackPointer(evt) {
  if (evt.touches && evt.touches[0]) {
    lastTouchX = evt.touches[0].clientX;
    lastTouchY = evt.touches[0].clientY;
  } else if (evt.clientX) {
    lastTouchX = evt.clientX;
    lastTouchY = evt.clientY;
  }
  updateCollapsedHoverFromPoint(lastTouchX, lastTouchY);
  autoScrollActiveTaskList();
}

function updateCollapsedHoverFromPoint(x, y) {
  if (!x && !y) return;
  const target = document.elementFromPoint(x, y);
  if (isSwimlaneViewEnabled()) {
    const cell = target?.closest?.('.swimlane-cell');
    if (cell && cell.classList.contains('is-column-collapsed')) {
      setCollapsedDropHover(cell);
    } else {
      clearCollapsedDropHover();
    }
  } else {
    const column = target?.closest?.('.task-column');
    if (column && column.classList.contains('is-collapsed')) {
      setCollapsedDropHover(column);
    } else {
      clearCollapsedDropHover();
    }
  }
}

// Initialize sortable for tasks within columns
function initTaskSortables() {
  const taskLists = document.querySelectorAll('.tasks');

  taskLists.forEach(taskList => {
    // Disable sorting within the Done column for performance.
    // Tasks dropped into Done are placed at the top automatically;
    // internal reordering among completed tasks is unnecessary.
    const columnEl = taskList.closest('.task-column');
    const isDoneColumn = isDoneColumnId(columnEl?.dataset?.column);

    const sortable = new Sortable(taskList, {
      group: {
        name: 'tasks',
        pull: true,
        put: true
      },
      sort: !isDoneColumn, // Skip position calculations for Done column
      animation: 0,
      delay: 150, // Delay before drag starts (allows scrolling on mobile)
      delayOnTouchOnly: true, // Only apply delay on touch devices
      touchStartThreshold: 5, // Pixels to move before canceling delayed drag
      ghostClass: 'task-ghost',
      chosenClass: 'task-chosen',
      dragClass: 'task-drag',
      draggable: '.task',
      // Keep in-board moves out of native OS drag/DataTransfer and endpoint drag hooks.
      forceFallback: true,
      fallbackClass: 'task-fallback',
      fallbackOnBody: true,
      fallbackTolerance: 3,
      swapThreshold: 0.65,
      emptyInsertThreshold: 20, // Pixels around empty list where items can be dropped
      direction: 'vertical',
      scroll: true,
      scrollSensitivity: 120,
      scrollSpeed: 22,
      bubbleScroll: true,
      
      onStart: function(evt) {
        document.body.classList.add('dragging');
        isDraggingTask = true;
        activeTaskList = evt.from || null;
        if (!isSwimlaneViewEnabled()) {
          showCollapsedDropZones();
        }
        startAutoScroll();
        // Add global move listener to track pointer
        document.addEventListener('touchmove', trackPointer, { passive: true });
        document.addEventListener('mousemove', trackPointer, { passive: true });
        document.addEventListener('dragover', trackPointer, { passive: true });
        updateCollapsedHoverFromPoint(lastTouchX, lastTouchY);
      },

      onMove: function(evt) {
        activeTaskList = evt.to || activeTaskList;
        if (isSwimlaneViewEnabled()) {
          const targetCell = evt.to?.closest('.swimlane-cell');
          if (targetCell && targetCell.classList.contains('is-column-collapsed')) {
            setCollapsedDropHover(targetCell);
          } else {
            clearCollapsedDropHover();
          }
        } else {
          const targetColumn = evt.to?.closest('.task-column');
          if (targetColumn && targetColumn.classList.contains('is-collapsed')) {
            setCollapsedDropHover(targetColumn);
          } else {
            clearCollapsedDropHover();
          }
        }
      },
      
      onEnd: function(evt) {
        const isSwimlaneView = isSwimlaneViewEnabled();
        cleanupTaskDragState({ restoreCollapsedDropZones: !isSwimlaneView });

        // Open a reconcile window for the whole mutation. The one DATA_CHANGED its
        // commit scope emits on closing, whatever events the drop made, is routed
        // through reconcileBoard() (patch in place) instead of renderBoard() (full
        // teardown), so the just-dragged node is never detached. Counters, collapsed
        // titles, due dates, and notifications are reconcile's responsibility now —
        // no manual sync pass here.
        emit(DRAG_RECONCILE_BEGIN, evt.item);
        try {
          commitTogether(() => {
            const dropResult = updateTaskPositionsFromDrop(evt);
            if (!dropResult) return;

            const toColumnEl = getTaskContainerElement(evt.to);

            if (!isSwimlaneView && toColumnEl?.classList.contains('is-collapsed')) {
              // Keep collapsed drops state-only so Sortable's detached drag node is
              // never re-parented here; reconcile repaints from state.
              moveTaskToTopInColumn(dropResult.movedTaskId, dropResult.toColumn);
            }
          });
        } finally {
          emit(DRAG_RECONCILE_END);
        }
      }
    });

    taskSortables.push(sortable);
  });
}

// Initialize sortable for column reordering
function initColumnSortable() {
  const container = document.getElementById('board-container');
  if (!container) return;
  if (isSwimlaneViewEnabled()) return;
  
  columnSortable = new Sortable(container, {
    animation: 150,
    delay: 150,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    ghostClass: 'column-ghost',
    chosenClass: 'column-chosen',
    dragClass: 'column-drag',
    handle: '.column-header', // Drag via header (including title)
    filter: 'button:not(.column-drag-handle), a, input, select, textarea, [contenteditable]',
    preventOnFilter: true,
    draggable: '.task-column',
    scrollSensitivity: 80,
    scrollSpeed: 15,
    forceFallback: true,
    fallbackTolerance: 3,
    fallbackOnBody: true,
    
    onStart: function(evt) {
      document.body.classList.add('dragging-column');
    },
    
    onEnd: function(evt) {
      cleanupColumnDragState();
      
      // Update column positions in storage
      updateColumnPositions();
    }
  });
}
