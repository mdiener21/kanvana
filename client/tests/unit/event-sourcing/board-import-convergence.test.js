/**
 * An imported board must reach the event log, so a second device signed in to
 * the same account can rebuild it from catch-up alone. The import used to write
 * columns, tasks, labels and settings straight into the read model after
 * createBoard(), so only the board row and the default columns were synced.
 */

import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _flushPersistsForTesting,
  ensureBoardsInitialized,
  getActiveBoardId,
  loadColumns,
  loadLabels,
  loadTasks,
  loadSettings,
} from '../../../src/modules/storage.js';
import { importTasks } from '../../../src/modules/importexport.js';
import { on, off, EVENT_EMITTED } from '../../../src/modules/events.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

vi.mock('../../../src/modules/dialog.js', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
  alertDialog: vi.fn(() => Promise.resolve(true))
}));

const DB_NAME = 'kanvana-db';

const EXPORT_FILE = {
  boardName: 'Imported Board',
  columns: [
    { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
    { id: 'doing', name: 'Doing', color: '#f59e0b', order: 2 },
    { id: 'done', name: 'Done', color: '#16a34a', order: 3 }
  ],
  tasks: [
    { id: 'task-1', title: 'First', column: 'todo', labels: ['label-1'], priority: 'high' },
    { id: 'task-2', title: 'Second', column: 'doing', labels: [], priority: 'low' }
  ],
  labels: [{ id: 'label-1', name: 'Bug', color: '#ff0000' }],
  settings: { showPriority: false }
};

let previousFileReader;
let importFinished;

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB(DB_NAME);
  previousFileReader = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsText(file) {
      Promise.resolve(this.onload({ target: { result: file.text } })).then(() => importFinished());
    }
  };
});

afterEach(() => {
  globalThis.FileReader = previousFileReader;
});

function importFile(data) {
  const text = JSON.stringify(data);
  return new Promise((resolve) => {
    importFinished = resolve;
    importTasks({ name: 'board.json', size: text.length, type: 'application/json', text });
  });
}

test('a board import emits events a second device can rebuild the whole board from', async () => {
  await initStorage();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();

  const events = [];
  const handler = (e) => events.push(e.detail);
  on(EVENT_EMITTED, handler);
  await importFile(EXPORT_FILE);
  await _flushPersistsForTesting();
  off(EVENT_EMITTED, handler);

  const boardId = getActiveBoardId();
  const localTasks = loadTasks();
  expect(localTasks.map((t) => t.title).sort()).toEqual(['First', 'Second']);

  // Replay as a second device's catch-up would.
  const remote = applyEvents(createProjectionState({}), events.filter((e) => e.board_id === boardId));

  expect(remote.boards.map((b) => b.name)).toEqual(['Imported Board']);
  expect(new Set(remote.columns.map((c) => c.id))).toEqual(new Set(loadColumns().map((c) => c.id)));
  expect(new Set(remote.labels.map((l) => l.id))).toEqual(new Set(loadLabels().map((l) => l.id)));
  expect(new Set(remote.tasks.map((t) => t.id))).toEqual(new Set(localTasks.map((t) => t.id)));
  expect(remote.settings.showPriority).toBe(false);
  expect(loadSettings().showPriority).toBe(false);
});
