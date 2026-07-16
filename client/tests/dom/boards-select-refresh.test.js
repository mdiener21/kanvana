import { vi, describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/dom';

// Mutable board list standing in for storage's in-memory `state.boards`.
// A remote board.created mutates this then fires DATA_CHANGED (mirrors
// projectDomainEvent in storage.js).
const boardsState = vi.hoisted(() => ({
  list: [{ id: 'board-1', name: 'Work' }],
  activeId: 'board-1',
}));

vi.mock('../../src/modules/storage.js', () => ({
  ensureBoardsInitialized: vi.fn(),
  listBoards: vi.fn(() => boardsState.list),
  createBoard: vi.fn(),
  getActiveBoardId: vi.fn(() => boardsState.activeId),
  setActiveBoardId: vi.fn((id) => { boardsState.activeId = id; }),
  getActiveBoardName: vi.fn(
    () => boardsState.list.find((b) => b.id === boardsState.activeId)?.name || ''
  ),
  saveColumns: vi.fn(),
  saveTasks: vi.fn(),
  saveLabels: vi.fn(),
  loadSettings: vi.fn(() => ({})),
  saveSettings: vi.fn(),
}));

vi.mock('../../src/modules/modals.js', () => ({ setupModalCloseHandlers: vi.fn() }));
vi.mock('../../src/modules/dialog.js', () => ({ alertDialog: vi.fn(async () => undefined) }));
vi.mock('../../src/modules/board-serializer.js', () => ({ normalizeBoardModelIds: vi.fn((x) => x) }));

// events.js and normalize.js are kept real: the test relies on the real
// on/emit bus to verify the subscription is wired.
import { initializeBoardsUI } from '../../src/modules/boards.js';
import { emit, DATA_CHANGED } from '../../src/modules/events.js';

const FIXTURE = `
  <span id="brand-text" class="brand-text">Work</span>
  <select id="board-select"></select>
`;

beforeEach(() => {
  boardsState.list = [{ id: 'board-1', name: 'Work' }];
  boardsState.activeId = 'board-1';
  document.body.innerHTML = FIXTURE;
  vi.clearAllMocks();
});

describe('#board-select refresh on DATA_CHANGED', () => {
  it('rebuilds the dropdown when a remote board.created adds a board', async () => {
    initializeBoardsUI();
    const select = document.getElementById('board-select');
    expect(select.options.length).toBe(1);

    // Remote board.created lands: state.boards grows, then DATA_CHANGED fires.
    boardsState.list.push({ id: 'board-2', name: 'Remote' });
    emit(DATA_CHANGED);

    await waitFor(() => {
      expect([...select.options].map((o) => o.value)).toContain('board-2');
    });
    expect(select.options.length).toBe(2);
  });

  it('updates an option label when a board is renamed remotely', async () => {
    initializeBoardsUI();
    const select = document.getElementById('board-select');
    expect(select.options[0].textContent).toBe('Work');

    boardsState.list[0].name = 'Renamed';
    emit(DATA_CHANGED);

    await waitFor(() => {
      expect(select.options[0].textContent).toBe('Renamed');
    });
  });
});
