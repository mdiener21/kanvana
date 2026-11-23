// Boards manager, rename, and create modal — extracted from modals.js

import {
  ensureBoardsInitialized,
  listBoards,
  getActiveBoardId,
  renameBoard,
  deleteBoard as deleteBoardById
} from './storage.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { renderIcons } from './icons.js';
import { selectBoard } from './board-selection.js';
import { exportBoard } from './importexport.js';
import { BOARDS_CHANGED, DATA_CHANGED, emit, on } from './events.js';
import { DEFAULT_APP_KEYBINDINGS, matchesKey } from './constants.js';
import { $id, h } from './dom.js';

let editingBoardId = null;

function renderBoardsList() {
  ensureBoardsInitialized();
  const container = $id('boards-list');
  if (!container) return;

  container.innerHTML = '';
  const boards = listBoards();
  const activeId = getActiveBoardId();

  boards.forEach((board) => {
    const nameWrap = h('div', { class: 'board-name-wrap' },
      h('span', {}, (board.name || '').toString()),
      board.id === activeId ? h('span', { class: 'task-label board-active-badge' }, 'Active') : null
    );

    const switchBtn = h('button', {
      class: 'btn-small', title: 'Open board',
      onClick: () => openBoard(board.id)
    }, 'Open');

    const exportBtn = h('button', {
      class: 'btn-small', type: 'button', title: 'Export board',
      'aria-label': `Export board ${String(board.name || 'Untitled board')}`,
      onClick: (e) => { e.preventDefault(); e.stopPropagation(); exportBoard(board.id); }
    }, h('span', { 'data-lucide': 'download' }));

    const editBtn = h('button', {
      class: 'btn-small', title: 'Rename board',
      onClick: () => showBoardRenameModal(board.id)
    }, h('span', { 'data-lucide': 'pencil' }));

    const deleteBtn = h('button', {
      class: 'btn-small btn-danger', title: 'Delete board',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Delete Board',
          message: `Do you really want to delete the board "${board.name}"? This cannot be undone.`,
          confirmText: 'Delete'
        });
        if (!ok) return;
        const deleted = deleteBoardById(board.id);
        if (!deleted) {
          await alertDialog({ title: 'Unable to Delete', message: 'Unable to delete board (you may be trying to delete the last board).' });
          return;
        }
        renderBoardsList();
        emit(DATA_CHANGED);
      }
    }, h('span', { 'data-lucide': 'trash-2' }));

    container.appendChild(h('div', { class: 'label-item', 'data-board-id': board.id },
      nameWrap,
      h('div', { class: 'label-actions' }, switchBtn, exportBtn, editBtn, deleteBtn)
    ));
  });

  renderIcons();
}

export function showBoardsModal() {
  renderBoardsList();
  const modal = $id('boards-modal');
  modal?.classList.remove('hidden');
}

function hideBoardsModal() {
  const modal = $id('boards-modal');
  modal?.classList.add('hidden');
}

function openBoard(boardId) {
  if (!selectBoard(boardId)) {
    renderBoardsList();
    return;
  }
  hideBoardsModal();
}

function updateBoardKeyboardFocus(items, index) {
  items.forEach((item, i) => {
    item.classList.toggle('keyboard-focused', i === index);
  });
  items[index]?.scrollIntoView?.({ block: 'nearest' });
}

export function refreshBoardsModalList() {
  const modal = $id('boards-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  renderBoardsList();
}

function showBoardRenameModal(boardId) {
  ensureBoardsInitialized();
  const board = listBoards().find((b) => b.id === boardId);
  if (!board) return;

  editingBoardId = boardId;
  const modal = $id('board-rename-modal');
  const input = $id('board-rename-name');
  const title = $id('board-rename-modal-title');
  const submitBtn = $id('board-rename-submit-btn');

  if (title) title.textContent = 'Rename Board';
  if (submitBtn) submitBtn.textContent = 'Save';
  if (input) input.value = (board.name || '').toString();

  modal?.classList.remove('hidden');
  input?.focus();
}

function hideBoardRenameModal() {
  const modal = $id('board-rename-modal');
  modal?.classList.add('hidden');
  editingBoardId = null;
}

export function initializeBoardsModalHandlers(setupModalCloseHandlers) {
  on(BOARDS_CHANGED, refreshBoardsModalList);

  // Event delegation: brand-text click survives DOM resets.
  document.addEventListener('click', (e) => {
    if (e.target?.id === 'brand-text' || e.target?.closest?.('#brand-text')) {
      showBoardsModal();
    }
  });

  // Global boards shortcut — ignored when typing in form elements.
  document.addEventListener('keydown', (e) => {
    if (matchesKey(e, DEFAULT_APP_KEYBINDINGS.openBoardsModal)) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      showBoardsModal();
    }
  });

  // Arrow key navigation + Enter to activate board when modal is open.
  document.addEventListener('keydown', (e) => {
    const modal = $id('boards-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const renameModal = $id('board-rename-modal');
    if (renameModal && !renameModal.classList.contains('hidden')) return;
    const { boardsSelectNext, boardsSelectPrevious, boardsOpenSelected } = DEFAULT_APP_KEYBINDINGS;
    const next = matchesKey(e, boardsSelectNext);
    const previous = matchesKey(e, boardsSelectPrevious);
    const open = matchesKey(e, boardsOpenSelected);
    if (!next && !previous && !open) return;

    const items = Array.from(document.querySelectorAll('#boards-list .label-item'));
    if (!items.length) return;

    const index = items.findIndex((item) => item.classList.contains('keyboard-focused'));
    if (next || previous) {
      e.preventDefault();
      const targetIndex = next ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0);
      updateBoardKeyboardFocus(items, targetIndex);
    } else if (index >= 0) {
      e.preventDefault();
      openBoard(items[index].dataset.boardId);
    }
  });

  $id('manage-boards-btn')?.addEventListener('click', showBoardsModal);
  $id('add-board-btn')?.addEventListener('click', async () => {
    document.dispatchEvent(new CustomEvent('kanban:open-board-create'));
  });
  $id('boards-import-btn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Import Board (New Board)',
      message:
        'Import will CREATE A NEW BOARD and switch to it. Your current active board will not be overwritten.\n\nContinue with import?',
      confirmText: 'Import'
    });
    if (!ok) return;
    $id('import-file')?.click();
  });
  setupModalCloseHandlers('boards-modal', hideBoardsModal);

  // Board rename modal
  $id('board-rename-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingBoardId) return;

    const input = $id('board-rename-name');
    const name = (input?.value || '').trim();
    if (!name) {
      await alertDialog({ title: 'Error', message: 'Board name cannot be empty.' });
      return;
    }

    if (!renameBoard(editingBoardId, name)) {
      await alertDialog({ title: 'Error', message: 'Unable to rename board.' });
      return;
    }

    hideBoardRenameModal();
    renderBoardsList();
  });

  setupModalCloseHandlers('board-rename-modal', hideBoardRenameModal);
}

export { hideBoardsModal, hideBoardRenameModal };
