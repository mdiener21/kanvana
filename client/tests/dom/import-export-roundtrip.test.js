/**
 * Export reads a board through the one normalised board read (#333), so a legacy board
 * exports normalised tasks, and importing that file gives back the same board.
 */

import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteDB } from 'idb';
import { initStorage, listBoards, loadBoard } from '../../src/modules/storage.js';
import { openStore, keyFor, KV_STORE, READ_MODEL_STORE } from '../../src/modules/idb-store.js';
import { exportBoard, importTasks } from '../../src/modules/importexport.js';
import { alertDialog } from '../../src/modules/dialog.js';

vi.mock('../../src/modules/dialog.js', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
  alertDialog: vi.fn(() => Promise.resolve(true))
}));

const LEGACY_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '66666666-6666-4666-8666-666666666666';
const TODO_ID = '22222222-2222-4222-8222-222222222222';
const DONE_ID = '33333333-3333-4333-8333-333333333333';

let exported;

beforeEach(async () => {
  await deleteDB('kanvana-db');
  exported = null;
  URL.createObjectURL = vi.fn((blob) => { exported = blob; return 'blob:export'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); // jsdom cannot download
  vi.mocked(alertDialog).mockClear();
});

afterEach(() => {
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  vi.restoreAllMocks();
});

// A board as an older version left it, read cross-board: another board is active.
async function seedLegacyBoard() {
  const db = await openStore();
  await db.put(KV_STORE, [
    { id: LEGACY_ID, name: 'Legacy', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: OTHER_ID, name: 'Other', createdAt: '2024-01-02T00:00:00.000Z' }
  ], 'kanbanBoards');
  await db.put(KV_STORE, OTHER_ID, 'kanbanActiveBoardId');
  await db.put(READ_MODEL_STORE, [
    { id: TODO_ID, name: 'To Do', order: 1, color: '#3b82f6' },
    { id: DONE_ID, name: 'Done', order: 2, color: '#16a34a', role: 'done' }
  ], `${LEGACY_ID}:columns`);
  await db.put(READ_MODEL_STORE, [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Urgent', color: '#ff0000' }], `${LEGACY_ID}:labels`);
  await db.put(READ_MODEL_STORE, [
    { id: '44444444-4444-4444-8444-444444444444', title: 'Open', column: TODO_ID, order: 1, priority: 'Bogus', creationDate: '2024-02-01T00:00:00.000Z', doneDate: '2024-02-03T00:00:00.000Z', labels: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
    { id: '55555555-5555-4555-8555-555555555555', title: 'Finished', column: DONE_ID, order: 2, priority: 'High', creationDate: '2024-03-01T00:00:00.000Z', changeDate: '2024-03-05T00:00:00.000Z' },
    { id: '77777777-7777-4777-8777-777777777777', title: 'Undated', column: TODO_ID, order: 3 }
  ], `${LEGACY_ID}:tasks`);
  await db.put(KV_STORE, { showAge: false, notificationDays: 7 }, keyFor(LEGACY_ID, 'settings'));
}

async function exportedJson() {
  return JSON.parse(await exported.text());
}

async function importFile(json) {
  const before = new Set(listBoards().map((board) => board.id));
  importTasks(new File([JSON.stringify(json)], 'legacy.json', { type: 'application/json' }));
  await vi.waitFor(() => expect(alertDialog).toHaveBeenCalled());
  expect(vi.mocked(alertDialog).mock.calls[0][0].title).toBe('Import Complete');
  return listBoards().find((board) => !before.has(board.id));
}

// What a board shows, without the ids an import may remap.
function shown(board) {
  const columnName = new Map(board.columns.map((column) => [column.id, column.name]));
  const labelName = new Map(board.labels.map((label) => [label.id, label.name]));
  return {
    columns: board.columns.map(({ name, color, order, role }) => ({ name, color, order, role })),
    labels: board.labels.map(({ name, color }) => ({ name, color })),
    tasks: board.tasks.map((task) => ({
      title: task.title,
      priority: task.priority,
      column: columnName.get(task.column),
      labels: (task.labels || []).map((id) => labelName.get(id)),
      doneDate: task.doneDate,
      columnHistory: task.columnHistory.map((entry) => ({ column: columnName.get(entry.column), at: entry.at }))
    })),
    settings: board.settings
  };
}

test('a legacy board exports normalised tasks', async () => {
  await seedLegacyBoard();
  await initStorage();

  exportBoard(LEGACY_ID);
  const { tasks } = await exportedJson();

  expect(tasks.map((task) => task.priority)).toEqual(['none', 'high', 'none']);
  expect(tasks[0].doneDate).toBeUndefined();
  expect(tasks[1].doneDate).toBe('2024-03-05T00:00:00.000Z');
  expect(tasks[0].columnHistory).toEqual([{ column: TODO_ID, at: '2024-02-01T00:00:00.000Z' }]);
  expect(tasks[2].columnHistory).toEqual(loadBoard(LEGACY_ID).tasks[2].columnHistory);
});

test('export then import gives back the same board', async () => {
  await seedLegacyBoard();
  await initStorage();

  exportBoard(LEGACY_ID);
  const imported = await importFile(await exportedJson());

  expect(imported.name).toBe('Legacy');
  expect(shown(loadBoard(imported.id))).toEqual(shown(loadBoard(LEGACY_ID)));
});
