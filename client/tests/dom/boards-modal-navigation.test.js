import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import markup from '../../src/index.html?raw';
import { initializeBoardsUI } from '../../src/modules/boards.js';
import { initializeBoardsModalHandlers } from '../../src/modules/boards-modal.js';
import { importTasks } from '../../src/modules/importexport.js';
import { setupModalCloseHandlers } from '../../src/modules/modals.js';
import { _resetStorageForTesting, createBoard } from '../../src/modules/storage.js';
import { EVENT_ORIGIN, ingestEvent } from '../../src/modules/event-sourcing/ingest.js';

const byId = (id) => document.getElementById(id);

function boardRow(name) {
  return within(byId('boards-list')).getByText(name).closest('.label-item');
}

function expectActiveBoard(name) {
  expect(byId('board-select').selectedOptions[0]?.textContent).toBe(name);
  expect(byId('brand-text').textContent).toBe(name);
}

// Reattach the fixture between tests so the UI handlers are registered only once.
let otherBoard;
const fixture = document.createElement('div');

beforeAll(() => {
  const page = new DOMParser().parseFromString(markup, 'text/html');
  for (const id of [
    'brand-text', 'board-select', 'manage-boards-btn', 'boards-modal', 'board-rename-modal', 'board-create-modal'
  ]) {
    fixture.append(page.getElementById(id));
  }
  document.body.append(fixture);
  initializeBoardsUI();
  initializeBoardsModalHandlers(setupModalCloseHandlers);
});

beforeEach(() => {
  document.body.append(fixture);
  _resetStorageForTesting();
  otherBoard = createBoard('Other');
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

  it('keeps the current board when the highlighted board is deleted remotely', async () => {
    const picker = byId('board-select');
    fireEvent.change(picker, { target: { value: picker.options[0].value } });
    expectActiveBoard('Default Board');
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(boardRow('Other').classList.contains('keyboard-focused')).toBe(true);
    await ingestEvent({
      id: crypto.randomUUID(),
      type: 'board.deleted',
      hlc: { wallTime: Date.now() + 1_000, counter: 0, nodeId: 'remote' },
      at: new Date().toISOString(),
      actor: { type: 'human', id: null },
      scope: 'board',
      board_id: otherBoard.id,
      entity_id: otherBoard.id,
      payload: {}
    }, { origin: EVENT_ORIGIN.REMOTE });

    fireEvent.keyDown(document, { key: 'Enter' });

    expectActiveBoard('Default Board');
    expect(byId('boards-modal').classList.contains('hidden')).toBe(false);
    expect(within(byId('boards-list')).queryByText('Other')).toBeNull();
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

  it('refreshes the open list after creating a board', () => {
    fireEvent.click(byId('add-board-btn'));
    fireEvent.input(byId('board-create-name'), { target: { value: 'New board' } });
    fireEvent.submit(byId('board-create-form'));

    expectActiveBoard('New board');
    expect(within(boardRow('New board')).getByText('Active')).toBeTruthy();
    expect(byId('boards-modal').classList.contains('hidden')).toBe(false);
  });

  it('refreshes the open list after confirming a JSON board import', async () => {
    const data = {
      boardName: 'Imported',
      columns: [{ id: 'todo', name: 'To Do', color: '#3583ff', order: 1 }],
      tasks: [{ id: 't1', title: 'Imported task', column: 'todo' }]
    };
    const file = new File([JSON.stringify(data)], 'board.json', { type: 'application/json' });
    importTasks(file);

    await waitFor(() => expect(byId('dialog-modal-title')?.textContent).toBe('Review Import'));
    expectActiveBoard('Work');
    fireEvent.click(byId('dialog-confirm-btn'));

    await waitFor(() => expect(byId('dialog-modal-title').textContent).toBe('Import Complete'));
    expectActiveBoard('Imported');
    expect(within(boardRow('Imported')).getByText('Active')).toBeTruthy();
    expect(byId('boards-modal').classList.contains('hidden')).toBe(false);
    fireEvent.click(byId('dialog-confirm-btn'));
  });
});
