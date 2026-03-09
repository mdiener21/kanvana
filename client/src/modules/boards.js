import { generateUUID } from './utils.js';
import { renderBoard } from './render.js';
import { setupModalCloseHandlers } from './modals.js';
import {
  ensureBoardsInitialized,
  listBoards,
  createBoard,
  getActiveBoardId,
  setActiveBoardId,
  getActiveBoardName
} from './storage.js';
import { alertDialog } from './dialog.js';

function boardDisplayName(board) {
  const name = typeof board?.name === 'string' ? board.name.trim() : '';
  return name || 'Untitled board';
}

function refreshBoardSelect(selectEl) {
  const boards = listBoards();
  const activeId = getActiveBoardId();

  selectEl.innerHTML = '';

  boards.forEach((b) => {
    const option = document.createElement('option');
    option.value = b.id;
    option.textContent = boardDisplayName(b);
    selectEl.appendChild(option);
  });

  if (activeId) selectEl.value = activeId;
}

function refreshBrandText() {
  const brandEl = document.getElementById('brand-text') || document.querySelector('.brand-text');
  if (!brandEl) return;
  brandEl.textContent = getActiveBoardName();
}

// Board Create Modal helpers
export function showBoardCreateModal() {
  const modal = document.getElementById('board-create-modal');
  const nameInput = document.getElementById('board-create-name');
  if (!modal || !nameInput) return;

  nameInput.value = '';
  modal.classList.remove('hidden');
  nameInput.focus();
}

function hideBoardCreateModal() {
  const modal = document.getElementById('board-create-modal');
  if (modal) modal.classList.add('hidden');
}

export function initializeBoardsUI() {
  ensureBoardsInitialized();

  const selectEl = document.getElementById('board-select');

  if (!selectEl) return;

  refreshBoardSelect(selectEl);
  refreshBrandText();

  document.addEventListener('kanban:open-board-create', () => {
    showBoardCreateModal();
  });

  selectEl.addEventListener('change', () => {
    const id = selectEl.value;
    if (!id) return;
    setActiveBoardId(id);
    refreshBrandText();
    renderBoard();

    // Collapse the dropdown menu after a selection.
    const controlsActions = document.getElementById('board-controls-menu');
    const menuBtn = document.getElementById('desktop-menu-btn');
    controlsActions?.classList.remove('show');
    menuBtn?.setAttribute('aria-expanded', 'false');
  });

  // Board Create Modal handlers
  const createModal = document.getElementById('board-create-modal');
  const createForm = document.getElementById('board-create-form');
  const cancelCreateBtn = document.getElementById('cancel-board-create-btn');

  if (createModal) {
    // Backdrop click closes modal
    const backdrop = createModal.querySelector('.modal-backdrop');
    backdrop?.addEventListener('click', hideBoardCreateModal);

    // Escape key closes modal
    createModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideBoardCreateModal();
    });
  }

  if (cancelCreateBtn) {
    cancelCreateBtn.addEventListener('click', hideBoardCreateModal);
  }

  setupModalCloseHandlers('board-create-modal', hideBoardCreateModal);

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('board-create-name');
      const trimmed = (nameInput?.value || '').trim();

      if (!trimmed) {
        await alertDialog({ title: 'Error', message: 'Board name cannot be empty.' });
        nameInput?.focus();
        return;
      }

      const board = createBoard(trimmed);
      setActiveBoardId(board.id);
      refreshBoardSelect(selectEl);
      refreshBrandText();
      renderBoard();
      hideBoardCreateModal();

      // Let other UI modules (e.g., Manage Boards modal) react without introducing
      // cross-module imports that can complicate bundling/chunking.
      document.dispatchEvent(new CustomEvent('kanban:boards-changed'));
    });
  }
}
