import Sortable from 'sortablejs';
import { updateTaskPositionsFromDrop } from './tasks.js';
import { updateColumnPositions } from './columns.js';

// Store Sortable instances for cleanup
let taskSortables = [];
let columnSortable = null;
let autoScrollInterval = null;
let lastTouchX = 0;

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
}

// Track touch/mouse position globally during drag
function trackPointer(evt) {
  if (evt.touches && evt.touches[0]) {
    lastTouchX = evt.touches[0].clientX;
  } else if (evt.clientX) {
    lastTouchX = evt.clientX;
  }
}

// Initialize sortable for tasks within columns
function initTaskSortables() {
  const taskLists = document.querySelectorAll('.tasks:not(.hidden)');
  const forceFallback = shouldForceFallbackForTasks();

  taskLists.forEach(taskList => {
    const sortable = new Sortable(taskList, {
      group: {
        name: 'tasks',
        pull: true,
        put: true
      },
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
      
      onStart: function(evt) {
        document.body.classList.add('dragging');
        startAutoScroll();
        // Add global move listener to track pointer
        document.addEventListener('touchmove', trackPointer, { passive: true });
        document.addEventListener('mousemove', trackPointer, { passive: true });
      },
      
      onEnd: async function(evt) {
        document.body.classList.remove('dragging');
        stopAutoScroll();
        document.removeEventListener('touchmove', trackPointer);
        document.removeEventListener('mousemove', trackPointer);
        
        // Update task positions in storage (optimized - no full re-render)
        const dropResult = updateTaskPositionsFromDrop(evt);

        if (dropResult) {
          // Import helpers dynamically to avoid circular dependencies
          const { syncTaskCounters, syncCollapsedTitles } = await import('./render.js');
          const { refreshNotifications } = await import('./notifications.js');

          // Update UI elements that depend on task positions without full re-render
          syncTaskCounters();

          // If column changed, update collapsed titles and notifications
          if (dropResult.didChangeColumn) {
            syncCollapsedTitles();
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

// Legacy exports for compatibility - these now just call initDragDrop
export function attachTaskListeners() {
  // No-op: handled by initDragDrop
}

export function attachColumnListeners() {
  // No-op: handled by initDragDrop
}

export function attachColumnDragListeners() {
  // No-op: handled by initDragDrop
}
