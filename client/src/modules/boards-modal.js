// Boards manager, rename, and create modal — extracted from modals.js

import {
  ensureBoardsInitialized,
  listBoards,
  getActiveBoardId,
  setActiveBoardId,
  getActiveBoardName,
  renameBoard,
  deleteBoard as deleteBoardById
} from './storage.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { renderIcons } from './icons.js';
import { exportBoard } from './importexport.js';
import { emit, DATA_CHANGED } from './events.js';
import { DEFAULT_APP_KEYBINDINGS, matchesKey } from './constants.js';

let editingBoardId = null;
let keyboardNavIndex = -1;

function renderBoardsSelect() {
  const selectEl = document.getElementById('board-select');
  if (!selectEl) return;

  const boards = listBoards();
  const active = getActiveBoardId();
  selectEl.innerHTML = '';

  boards.forEach((b) => {
    const option = document.createElement('option');
    option.value = b.id;
    option.textContent = (typeof b.name === 'string' && b.name.trim()) ? b.name.trim() : 'Untitled board';
    selectEl.appendChild(option);
  });

  if (active) selectEl.value = active;

  const brandEl = document.getElementById('brand-text') || document.querySelector('.brand-text');
  if (brandEl) brandEl.textContent = getActiveBoardName();
}

function renderBoardsList() {
  ensureBoardsInitialized();
  const container = document.getElementById('boards-list');
  if (!container) return;

  container.innerHTML = '';
  const boards = listBoards();
  const activeId = getActiveBoardId();

  boards.forEach((board) => {
    const item = document.createElement('div');
    item.classList.add('label-item');

    const nameWrap = document.createElement('div');
    nameWrap.classList.add('board-name-wrap');

    const nameEl = document.createElement('span');
    nameEl.textContent = (board.name || '').toString();
    nameWrap.appendChild(nameEl);

    if (board.id === activeId) {
      const activeBadge = document.createElement('span');
      activeBadge.classList.add('task-label', 'board-active-badge');
      activeBadge.textContent = 'Active';
      nameWrap.appendChild(activeBadge);
    }

    const actions = document.createElement('div');
    actions.classList.add('label-actions');

    const switchBtn = document.createElement('button');
    switchBtn.classList.add('btn-small');
    switchBtn.textContent = 'Open';
    switchBtn.title = 'Open board';
    switchBtn.addEventListener('click', async () => {
      setActiveBoardId(board.id);
      renderBoardsSelect();
      renderBoardsList();
      emit(DATA_CHANGED);
      hideBoardsModal();
    });

    const exportBtn = document.createElement('button');
    exportBtn.classList.add('btn-small');
    exportBtn.type = 'button';
    exportBtn.title = 'Export board';
    exportBtn.setAttribute('aria-label', `Export board ${String(board.name || 'Untitled board')}`);
    const exportIcon = document.createElement('span');
    exportIcon.dataset.lucide = 'download';
    exportBtn.appendChild(exportIcon);
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      exportBoard(board.id);
    });

    const editBtn = document.createElement('button');
    editBtn.classList.add('btn-small');
    const editIcon = document.createElement('span');
    editIcon.dataset.lucide = 'pencil';
    editBtn.appendChild(editIcon);
    editBtn.title = 'Rename board';
    editBtn.addEventListener('click', () => showBoardRenameModal(board.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('btn-small', 'btn-danger');
    const deleteIcon = document.createElement('span');
    deleteIcon.dataset.lucide = 'trash-2';
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.title = 'Delete board';
    deleteBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete Board',
        message: `Do you really want to delete the board "${board.name}"? This cannot be undone.`,
        confirmText: 'Delete'
      });
      if (!ok) return;
      const deleted = deleteBoardById(board.id);
      if (!deleted) {
        await alertDialog({
          title: 'Unable to Delete',
          message: 'Unable to delete board (you may be trying to delete the last board).'
        });
        return;
      }
      renderBoardsSelect();
      renderBoardsList();
      emit(DATA_CHANGED);
    });

    actions.appendChild(switchBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(nameWrap);
    item.appendChild(actions);
    container.appendChild(item);
  });

  renderIcons();
}

export function showBoardsModal() {
  keyboardNavIndex = -1;
  renderBoardsList();
  const modal = document.getElementById('boards-modal');
  modal?.classList.remove('hidden');
}

function hideBoardsModal() {
  keyboardNavIndex = -1;
  const modal = document.getElementById('boards-modal');
  modal?.classList.add('hidden');
}

function updateBoardKeyboardFocus(items) {
  items.forEach((item, i) => {
    item.classList.toggle('keyboard-focused', i === keyboardNavIndex);
  });
  items[keyboardNavIndex]?.scrollIntoView?.({ block: 'nearest' });
}

export function refreshBoardsModalList() {
  const modal = document.getElementById('boards-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  renderBoardsList();
}

function showBoardRenameModal(boardId) {
  ensureBoardsInitialized();
  const board = listBoards().find((b) => b.id === boardId);
  if (!board) return;

  editingBoardId = boardId;
  const modal = document.getElementById('board-rename-modal');
  const input = document.getElementById('board-rename-name');
  const title = document.getElementById('board-rename-modal-title');
  const submitBtn = document.getElementById('board-rename-submit-btn');

  if (title) title.textContent = 'Rename Board';
  if (submitBtn) submitBtn.textContent = 'Save';
  if (input) input.value = (board.name || '').toString();

  modal?.classList.remove('hidden');
  input?.focus();
}

function hideBoardRenameModal() {
  const modal = document.getElementById('board-rename-modal');
  modal?.classList.add('hidden');
  editingBoardId = null;
}

export function initializeBoardsModalHandlers(setupModalCloseHandlers) {
  document.addEventListener('kanban:boards-changed', () => {
    refreshBoardsModalList();
  });

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
    const modal = document.getElementById('boards-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const renameModal = document.getElementById('board-rename-modal');
    if (renameModal && !renameModal.classList.contains('hidden')) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;

    const items = Array.from(document.querySelectorAll('#boards-list .label-item'));
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      keyboardNavIndex = Math.min(keyboardNavIndex + 1, items.length - 1);
      updateBoardKeyboardFocus(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      keyboardNavIndex = Math.max(keyboardNavIndex - 1, 0);
      updateBoardKeyboardFocus(items);
    } else if (e.key === 'Enter' && keyboardNavIndex >= 0) {
      e.preventDefault();
      const boards = listBoards();
      const board = boards[keyboardNavIndex];
      if (board) {
        setActiveBoardId(board.id);
        renderBoardsSelect();
        renderBoardsList();
        emit(DATA_CHANGED);
        hideBoardsModal();
      }
    }
  });

  document.getElementById('manage-boards-btn')?.addEventListener('click', showBoardsModal);
  document.getElementById('add-board-btn')?.addEventListener('click', async () => {
    document.dispatchEvent(new CustomEvent('kanban:open-board-create'));
  });
  document.getElementById('boards-import-btn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Import Board (New Board)',
      message:
        'Import will CREATE A NEW BOARD and switch to it. Your current active board will not be overwritten.\n\nContinue with import?',
      confirmText: 'Import'
    });
    if (!ok) return;
    document.getElementById('import-file')?.click();
  });
  setupModalCloseHandlers('boards-modal', hideBoardsModal);

  // Board rename modal
  document.getElementById('board-rename-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingBoardId) return;

    const input = document.getElementById('board-rename-name');
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
    renderBoardsSelect();
    renderBoardsList();
    renderIcons();
  });

  setupModalCloseHandlers('board-rename-modal', hideBoardRenameModal);
}

export { hideBoardsModal, hideBoardRenameModal };
