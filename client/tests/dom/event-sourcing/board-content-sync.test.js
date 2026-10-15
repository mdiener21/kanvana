import { afterEach, beforeEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { initializeBoardsUI } from '../../../src/modules/boards.js';
import { getUnsyncedEvents } from '../../../src/modules/idb-store.js';
import {
  initStorage, getActiveBoardId, setActiveBoardId, loadColumns, loadColumnsForBoard, loadTasksForBoard,
  _flushPersistsForTesting, _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import { applyRemoteEvent } from '../../../src/modules/event-sourcing/realtime.js';
import { compareHlc } from '../../../src/modules/event-sourcing/hlc.js';

beforeEach(async () => {
  await deleteDB('kanvana-db');
  await initStorage();
});

afterEach(async () => {
  await _flushPersistsForTesting();
  _resetStorageForTesting();
});

async function createTemplateBoardAndCaptureEvents() {
  document.body.innerHTML = `
    <select id="board-select"></select>
    <div id="board-create-modal">
      <form id="board-create-form">
        <input id="board-create-name" value="db">
        <select id="board-create-template"></select>
      </form>
    </div>`;
  initializeBoardsUI();
  document.getElementById('board-create-template').value = 'Product-Development-Board-Template';
  document.getElementById('board-create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const boardId = getActiveBoardId();
  await _flushPersistsForTesting();
  const outbound = (await getUnsyncedEvents())
    .filter(event => event.board_id === boardId)
    .sort((a, b) => compareHlc(a.hlc, b.hlc));

  document.body.innerHTML = '';
  _resetStorageForTesting();
  await deleteDB('kanvana-db');
  await initStorage();
  return { boardId, outbound };
}

function applyFromServer(event) {
  return applyRemoteEvent({
    local_id: event.id, event_type: event.type, board: event.board_id,
    entity_id: event.entity_id, scope: event.scope, hlc: event.hlc,
    at: event.at, payload: event.payload, actor_type: 'agent', actor_id: 'claude-opus-5-5',
  });
}

test('a template board reaches a fresh device with its custom columns and tasks', async () => {
  const { boardId, outbound } = await createTemplateBoardAndCaptureEvents();
  for (const event of outbound) await applyFromServer(event);

  expect(loadColumnsForBoard(boardId).map(column => column.name)).toEqual([
    'Idea Backlog', 'Planned', 'In Development', 'Testing', 'Ready for Release', 'Shipped',
  ]);
  const tasks = loadTasksForBoard(boardId);
  expect(tasks).toHaveLength(5);
  const development = loadColumnsForBoard(boardId).find(column => column.name === 'In Development');
  expect(tasks.find(task => task.title === 'Feature: Board export improvements').column).toBe(development.id);
});

test('rendering a board while its columns are still arriving does not add a second Done column', async () => {
  const { boardId, outbound } = await createTemplateBoardAndCaptureEvents();
  for (const event of outbound) {
    await applyFromServer(event);
    setActiveBoardId(boardId);
    loadColumns();
  }

  expect(loadColumnsForBoard(boardId).map(column => column.name)).toEqual([
    'Idea Backlog', 'Planned', 'In Development', 'Testing', 'Ready for Release', 'Shipped',
  ]);
});
