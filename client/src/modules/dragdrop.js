import Sortable from 'sortablejs';
import { moveTaskToTopInColumn, updateTaskPositionsFromDrop } from './tasks.js';
import { updateColumnPositions } from './columns.js';
import { emit, DATA_CHANGED } from './events.js';

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

function shouldForceFallbackForTasks() {
  // Sortable's JS fallback is required on most mobile/touch environments
  // (native HTML5 drag/drop is unreliable or unavailable), but it also
  // makes Playwright's locator.dragTo() ineffective. Prefer native DnD
  // on fine pointers (mouse/trackpad).
  const hasTouchPoints =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0);

  const isCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  return hasTouchPoints || isCoarsePointer;
}

// Initialize all drag and drop functionality
export function initDragDrop() {
  destroySortables();
  initTaskSortables();
  initColumnSortable();
}

// Clean up existing sortable instances
function destroySortables() {
  taskSortables.forEach(sortable => sortable.destroy());
  taskSortables = [];
  
  if (columnSortable) {
    columnSortable.destroy();
    columnSortable = null;
  }
  
  stopAutoScroll();
}

// Auto-scroll logic for horizontal scrolling during drag
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
  const forceFallback = shouldForceFallbackForTasks();

  taskLists.forEach(taskList => {
    // Disable sorting within the Done column for performance.
    // Tasks dropped into Done are placed at the top automatically;
    // internal reordering among completed tasks is unnecessary.
    const columnEl = taskList.closest('.task-column');
    const isDoneColumn = columnEl?.dataset?.column === 'done';

    const sortable = new Sortable(taskList, {
      group: {
        name: 'tasks',
        pull: true,
        put: true
      },
      sort: !isDoneColumn, // Skip position calculations for Done column
      animation: 150,
      delay: 150, // Delay before drag starts (allows scrolling on mobile)
      delayOnTouchOnly: true, // Only apply delay on touch devices
      touchStartThreshold: 5, // Pixels to move before canceling delayed drag
      ghostClass: 'task-ghost',
      chosenClass: 'task-chosen',
      dragClass: 'task-drag',
      draggable: '.task',
      forceFallback, // Fallback on touch; native HTML5 DnD on desktop
      fallbackClass: 'task-fallback',
      fallbackOnBody: true,
      fallbackTolerance: 0,
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
      
      onEnd: async function(evt) {
        document.body.classList.remove('dragging');
        isDraggingTask = false;
        activeTaskList = null;
        stopAutoScroll();
        document.removeEventListener('touchmove', trackPointer);
        document.removeEventListener('mousemove', trackPointer);
        
        // Update task positions in storage (optimized - no full re-render)
        const dropResult = updateTaskPositionsFromDrop(evt);
        let cachedTasks = dropResult?.tasks || null;

        const isSwimlaneView = isSwimlaneViewEnabled();
        const toColumnEl = getTaskContainerElement(evt.to);
        const isDropIntoDone = !isSwimlaneView && dropResult?.toColumn === 'done';

        if (dropResult && !isSwimlaneView && (toColumnEl?.classList.contains('is-collapsed') || isDropIntoDone)) {
          cachedTasks = moveTaskToTopInColumn(dropResult.movedTaskId, dropResult.toColumn, cachedTasks);

          // Move the DOM element to the top of the list so the user sees it snap there
          if (isDropIntoDone && evt.item && evt.to) {
            evt.to.prepend(evt.item);
          }
        }

        clearCollapsedDropHover();
        if (!isSwimlaneView) {
          hideCollapsedDropZones();
        }

        if (dropResult) {

          if (isSwimlaneView && (dropResult.didChangeColumn || dropResult.didChangeLane)) {
            emit(DATA_CHANGED);
            return;
          }

          // Import helpers dynamically — these are sync helpers that don't
          // cause circular deps when loaded lazily at call-time.
          const { syncTaskCounters, syncCollapsedTitles, syncMovedTaskDueDate } = await import('./render.js');
          const { refreshNotifications } = await import('./notifications.js');

          // Update UI elements that depend on task positions without full re-render
          syncTaskCounters(cachedTasks);

          // If column changed, update collapsed titles and notifications
          if (dropResult.didChangeColumn) {
            syncCollapsedTitles(cachedTasks);
            syncMovedTaskDueDate(dropResult.movedTaskId, dropResult.toColumn, cachedTasks);
            refreshNotifications();
          }
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
    forceFallback: false,
    fallbackOnBody: true,
    
    onStart: function(evt) {
      document.body.classList.add('dragging-column');
    },
    
    onEnd: function(evt) {
      document.body.classList.remove('dragging-column');
      
      // Update column positions in storage
      updateColumnPositions();
    }
  });
}

