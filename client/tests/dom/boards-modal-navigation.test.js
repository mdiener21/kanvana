import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import markup from '../../src/index.html?raw';
import { initializeBoardsUI } from '../../src/modules/boards.js';
import { initializeBoardsModalHandlers } from '../../src/modules/boards-modal.js';
import { setupModalCloseHandlers } from '../../src/modules/modals.js';
import { _resetStorageForTesting, createBoard } from '../../src/modules/storage.js';

const byId = (id) => document.getElementById(id);

function boardRow(name) {
  return within(byId('boards-list')).getByText(name).closest('.label-item');
}

function expectActiveBoard(name) {
  expect(byId('board-select').selectedOptions[0]?.textContent).toBe(name);
  expect(byId('brand-text').textContent).toBe(name);
}

// Reattach the fixture between tests so the UI handlers are registered only once.
const fixture = document.createElement('div');

beforeAll(() => {
  const page = new DOMParser().parseFromString(markup, 'text/html');
  for (const id of ['brand-text', 'board-select', 'manage-boards-btn', 'boards-modal', 'board-rename-modal']) {
    fixture.append(page.getElementById(id));
  }
  document.body.append(fixture);
  initializeBoardsUI();
  initializeBoardsModalHandlers(setupModalCloseHandlers);
});

beforeEach(() => {
  document.body.append(fixture);
  _resetStorageForTesting();
  createBoard('Other');
  createBoard('Work');
  fireEvent.click(byId('manage-boards-btn'));
});

describe('Manage Boards navigation', () => {
  it('opens a board by click and updates the picker and title without replacing the options', () => {
    const firstOption = byId('board-select').options[0];
    expectActiveBoard('Work');

    fireEvent.click(within(boardRow('Default Board')).getByRole('button', { name: 'Open' }));

    expectActiveBoard('Default Board');
    expect(byId('boards-modal').classList.contains('hidden')).toBe(true);
    expect(byId('board-select').selectedOptions[0]).toBe(firstOption);
  });

  it('opens the keyboard-highlighted board and updates the picker and title without replacing the options', () => {
    const firstOption = byId('board-select').options[0];
    expectActiveBoard('Work');

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expectActiveBoard('Default Board');
    expect(byId('boards-modal').classList.contains('hidden')).toBe(true);
    expect(byId('board-select').selectedOptions[0]).toBe(firstOption);
  });

  it('renames the active board in the modal list, picker, and title with one title update', () => {
    const titleChanges = new MutationObserver(() => {});
    titleChanges.observe(byId('brand-text'), { childList: true });
    try {
      fireEvent.click(within(boardRow('Work')).getByTitle('Rename board'));
      fireEvent.input(byId('board-rename-name'), { target: { value: 'Studio' } });
      fireEvent.submit(byId('board-rename-form'));

      expectActiveBoard('Studio');
      expect(within(boardRow('Studio')).getByText('Active')).toBeTruthy();
      expect(titleChanges.takeRecords()).toHaveLength(1);
    } finally {
      titleChanges.disconnect();
    }
  });

  it('selects the first remaining board after deleting the active board', async () => {
    fireEvent.click(within(boardRow('Work')).getByTitle('Delete board'));
    fireEvent.click(byId('dialog-confirm-btn'));

    await waitFor(() => expectActiveBoard('Default Board'));
    expect([...byId('board-select').options].map((option) => option.textContent)).toEqual([
      'Default Board',
      'Other'
    ]);
    const list = within(byId('boards-list'));
    expect(list.queryByText('Work')).toBeNull();
    expect(within(boardRow('Default Board')).getByText('Active')).toBeTruthy();
  });

  it('refreshes the open list when an import notifies Manage Boards', () => {
    createBoard('Imported');
    document.dispatchEvent(new CustomEvent('kanban:boards-changed'));

    expectActiveBoard('Imported');
    expect(within(boardRow('Imported')).getByText('Active')).toBeTruthy();
    expect(byId('boards-modal').classList.contains('hidden')).toBe(false);
  });
});
