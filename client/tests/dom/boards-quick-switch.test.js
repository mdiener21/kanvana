import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/dom';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../src/modules/storage.js', () => ({
  ensureBoardsInitialized: vi.fn(),
  listBoards: vi.fn(() => [
    { id: 'board-1', name: 'Work' },
    { id: 'board-2', name: 'Personal' },
  ]),
  getActiveBoardId: vi.fn(() => 'board-1'),
  setActiveBoardId: vi.fn(),
  getActiveBoardName: vi.fn(() => 'Work'),
  renameBoard: vi.fn(() => true),
  deleteBoard: vi.fn(() => true),
}));

vi.mock('../../src/modules/dialog.js', () => ({
  confirmDialog: vi.fn(async () => false),
  alertDialog: vi.fn(async () => undefined),
}));

vi.mock('../../src/modules/icons.js', () => ({
  renderIcons: vi.fn(),
}));

vi.mock('../../src/modules/importexport.js', () => ({
  exportBoard: vi.fn(),
}));

vi.mock('../../src/modules/events.js', () => ({
  emit: vi.fn(),
  DATA_CHANGED: 'data:changed',
}));

import { initializeBoardsModalHandlers } from '../../src/modules/boards-modal.js';
import { setActiveBoardId } from '../../src/modules/storage.js';
import { emit } from '../../src/modules/events.js';

// ── HTML fixture ──────────────────────────────────────────────────────────────

const FIXTURE = `
  <span id="brand-text" class="brand-text">Work</span>
  <button id="manage-boards-btn" type="button">Manage Boards</button>
  <button id="add-board-btn" type="button">Add Board</button>
  <button id="boards-import-btn" type="button">Import</button>
  <input id="import-file" type="file">
  <select id="board-select"></select>
  <div id="boards-modal" class="hidden">
    <div class="modal-backdrop"></div>
    <div id="boards-list"></div>
    <button id="boards-modal-close-btn" type="button">X</button>
  </div>
  <div id="board-rename-modal" class="hidden">
    <div class="modal-backdrop"></div>
    <form id="board-rename-form">
      <h2 id="board-rename-modal-title">Rename Board</h2>
      <input id="board-rename-name">
      <button type="submit" id="board-rename-submit-btn">Save</button>
      <button id="board-rename-cancel-btn" type="button">Cancel</button>
    </form>
  </div>
`;

// Register document-level handlers once. tests/dom/setup.js clears
// document.body.innerHTML in its own beforeEach, but document-level
// listeners survive that — so we only register them once here.
// All handlers in boards-modal.js use event delegation or getElementById
// at call-time, so they work correctly after the DOM is restored.
beforeAll(() => {
  document.body.innerHTML = FIXTURE;
  initializeBoardsModalHandlers(() => {});
});

// Restore DOM (setup.js clears it) and reset state before every test.
beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  document.getElementById('boards-modal').classList.add('hidden');
  document.getElementById('board-rename-modal').classList.add('hidden');
  vi.clearAllMocks();
});

// ── Cycle 1: click brand-text opens boards modal ──────────────────────────────

describe('click brand-text', () => {
  it('opens the boards modal', () => {
    const brandText = document.getElementById('brand-text');
    const modal = document.getElementById('boards-modal');

    expect(modal.classList.contains('hidden')).toBe(true);
    fireEvent.click(brandText);
    expect(modal.classList.contains('hidden')).toBe(false);
  });
});

// ── Cycle 2: Ctrl+B opens boards modal ───────────────────────────────────────

describe('Ctrl+B shortcut', () => {
  it('opens the boards modal', () => {
    const modal = document.getElementById('boards-modal');

    expect(modal.classList.contains('hidden')).toBe(true);
    fireEvent.keyDown(document, { key: 'B', ctrlKey: true });
    expect(modal.classList.contains('hidden')).toBe(false);
  });

  it('does not open the boards modal with the old Shift+B shortcut', () => {
    const modal = document.getElementById('boards-modal');

    expect(modal.classList.contains('hidden')).toBe(true);
    fireEvent.keyDown(document, { key: 'B', shiftKey: true });
    expect(modal.classList.contains('hidden')).toBe(true);
  });

  // ── Cycle 3: Ctrl+B ignored when input focused ────────────────────────────

  it('does not open the modal when an input is focused', () => {
    const modal = document.getElementById('boards-modal');
    const input = document.getElementById('board-rename-name');

    input.focus();
    fireEvent.keyDown(document, { key: 'B', ctrlKey: true });
    expect(modal.classList.contains('hidden')).toBe(true);
  });
});

// ── Cycle 4 & 5: keyboard navigation inside the open boards modal ─────────────

describe('keyboard navigation in open boards modal', () => {
  it('ArrowDown adds keyboard-focused to the first item on first press', () => {
    // Open modal first (resets keyboardNavIndex to -1)
    fireEvent.click(document.getElementById('brand-text'));

    const items = document.querySelectorAll('#boards-list .label-item');
    expect(items.length).toBe(2);

    fireEvent.keyDown(document, { key: 'ArrowDown' });

    expect(items[0].classList.contains('keyboard-focused')).toBe(true);
    expect(items[1].classList.contains('keyboard-focused')).toBe(false);
  });

  it('ArrowDown then ArrowDown moves focus to second item', () => {
    fireEvent.click(document.getElementById('brand-text'));

    const items = document.querySelectorAll('#boards-list .label-item');
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });

    expect(items[0].classList.contains('keyboard-focused')).toBe(false);
    expect(items[1].classList.contains('keyboard-focused')).toBe(true);
  });

  it('ArrowUp does not go below index 0', () => {
    fireEvent.click(document.getElementById('brand-text'));

    const items = document.querySelectorAll('#boards-list .label-item');
    // Start at -1; ArrowUp should stay at 0 (clamps to 0)
    fireEvent.keyDown(document, { key: 'ArrowDown' }); // → 0
    fireEvent.keyDown(document, { key: 'ArrowUp' });   // → still 0

    expect(items[0].classList.contains('keyboard-focused')).toBe(true);
  });

  it('does not navigate when modal is closed', () => {
    // Modal is hidden; ArrowDown should be a no-op
    const items = document.querySelectorAll('#boards-list .label-item');
    // Clear any focused class first
    items.forEach((el) => el.classList.remove('keyboard-focused'));

    fireEvent.keyDown(document, { key: 'ArrowDown' });

    items.forEach((el) => {
      expect(el.classList.contains('keyboard-focused')).toBe(false);
    });
  });

  // ── Cycle 5: Enter activates the highlighted board ───────────────────────

  it('Enter on highlighted board activates it and closes the modal', () => {
    fireEvent.click(document.getElementById('brand-text'));

    fireEvent.keyDown(document, { key: 'ArrowDown' }); // index 0 = board-1

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(setActiveBoardId).toHaveBeenCalledWith('board-1');
    expect(emit).toHaveBeenCalled();
    expect(document.getElementById('boards-modal').classList.contains('hidden')).toBe(true);
  });

  it('Enter does nothing when no item is highlighted', () => {
    fireEvent.click(document.getElementById('brand-text'));
    // navIndex = -1, no ArrowDown pressed
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(setActiveBoardId).not.toHaveBeenCalled();
  });
});
