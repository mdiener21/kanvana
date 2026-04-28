// Thin facade — delegates to per-modal sub-modules.
// Keeps shared utilities (setupModalCloseHandlers, Escape handler, help modal)
// and wires cross-modal coordination (task-modal ↔ labels-modal).

import { showModal, showEditModal, hideModal as hideTaskModal,
  initializeTaskModalHandlers, updateTaskLabelsSelection,
  getSelectedTaskLabels, setSelectedTaskLabels,
  getReturnToTaskModalFlag, setReturnToTaskModalFlag,
  getSelectCreatedLabelFlag, setSelectCreatedLabelFlag,
  restoreTaskModalAfterLabelsManager } from './task-modal.js';
import { showColumnModal, showEditColumnModal, hideColumnModal,
  initializeColumnModalHandlers } from './column-modal.js';
import { showLabelsModal, hideLabelModal, hideLabelsModal,
  initializeLabelsModalHandlers, setTaskModalState } from './labels-modal.js';
import { refreshBoardsModalList, hideBoardsModal, hideBoardRenameModal,
  initializeBoardsModalHandlers } from './boards-modal.js';

// ── Shared utility ──────────────────────────────────────────────────

function isModalOpen(modalId) {
  const modal = document.getElementById(modalId);
  return !!modal && !modal.classList.contains('hidden');
}

/**
 * Generic modal close handler setup.
 * Wires backdrop click, close buttons (X), and cancel buttons.
 */
function setupModalCloseHandlers(modalId, closeHandler) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const backdrop = modal.querySelector('.modal-backdrop');
  backdrop?.addEventListener('click', closeHandler);

  const closeButtons = modal.querySelectorAll(
    '[id$="-close-btn"], [id$="-close-modal-btn"], [id$="-cancel-btn"], [id^="cancel-"]'
  );
  closeButtons.forEach((btn) => {
    btn.addEventListener('click', closeHandler);
  });
}

// ── Help modal (tiny — not worth a separate file) ───────────────────

function showHelpModal() {
  const modal = document.getElementById('help-modal');
  modal.classList.remove('hidden');
}

function hideHelpModal() {
  const modal = document.getElementById('help-modal');
  modal.classList.add('hidden');
}

// ── Cross-modal coordination ────────────────────────────────────────
// Wire the task-modal state into labels-modal so it can auto-select
// newly created labels and return to the task editor.

setTaskModalState({
  getSelectedTaskLabels,
  setSelectedTaskLabels,
  getReturnToTaskModalFlag,
  setReturnToTaskModalFlag,
  getSelectCreatedLabelFlag,
  setSelectCreatedLabelFlag,
  updateTaskLabelsSelection,
  restoreTaskModalAfterLabelsManager
});

// ── Master initializer ──────────────────────────────────────────────

export function initializeModalHandlers() {
  initializeTaskModalHandlers(setupModalCloseHandlers);
  initializeColumnModalHandlers(setupModalCloseHandlers);
  initializeLabelsModalHandlers(setupModalCloseHandlers);
  initializeBoardsModalHandlers(setupModalCloseHandlers);

  // Help modal
  document.getElementById('help-btn').addEventListener('click', showHelpModal);
  setupModalCloseHandlers('help-modal', hideHelpModal);

  // Close top-most modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isModalOpen('label-modal')) { hideLabelModal(); return; }
      if (isModalOpen('labels-modal')) { hideLabelsModal(); return; }
      if (isModalOpen('board-rename-modal')) { hideBoardRenameModal(); return; }
      if (isModalOpen('boards-modal')) { hideBoardsModal(); return; }
      if (isModalOpen('help-modal')) { hideHelpModal(); return; }
      if (isModalOpen('column-modal')) { hideColumnModal(); return; }
      if (isModalOpen('task-modal')) { hideTaskModal(); }
    }
  });
}

// ── Public API re-exports ───────────────────────────────────────────

export {
  setupModalCloseHandlers,
  showModal,
  showEditModal,
  showColumnModal,
  showEditColumnModal,
  showLabelsModal,
  showHelpModal,
  updateTaskLabelsSelection,
  refreshBoardsModalList
};
