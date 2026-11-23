import { afterEach, beforeEach, expect, test } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { deleteDB } from 'idb';
import { importTasks } from '../../../src/modules/importexport.js';
import { scheduleDomainEvent } from '../../../src/modules/event-sourcing/emitter.js';
import { initializeBoardsUI } from '../../../src/modules/boards.js';
import { getUnsyncedEvents } from '../../../src/modules/idb-store.js';
import {
  initStorage,
  createBoard,
  getActiveBoardId,
  setActiveBoardId,
  loadColumns,
  loadTasks,
  _flushPersistsForTesting,
  _resetStorageForTesting,
  _loadStoredBoardForTesting
} from '../../../src/modules/storage.js';
import { applyRemoteEvent } from '../../../src/modules/event-sourcing/realtime.js';
import { compareHlc } from '../../../src/modules/event-sourcing/hlc.js';
import { emit, DATA_CHANGED } from '../../../src/modules/events.js';

beforeEach(async () => {
  await deleteDB('kanvana-db');
  await initStorage();
});

afterEach(async () => {
  await _flushPersistsForTesting();
  _resetStorageForTesting();
});

function mountBoardNavigation() {
  document.body.innerHTML = `
    <span id="brand-text"></span>
    <select id="board-select"></select>
    <div id="board-create-modal">
      <form id="board-create-form">
        <input id="board-create-name" value="db">
        <select id="board-create-template"></select>
      </form>
    </div>`;
  initializeBoardsUI();
  return {
    select: document.getElementById('board-select'),
    title: document.getElementById('brand-text')
  };
}

function submitBoard(name, template = '') {
  document.getElementById('board-create-name').value = name;
  document.getElementById('board-create-template').value = template;
  document.getElementById('board-create-form').dispatchEvent(new Event('submit', { cancelable: true }));
}

const PRODUCT_TEMPLATE = 'Product-Development-Board-Template';

async function createTemplateBoardAndCaptureEvents() {
  mountBoardNavigation();
  submitBoard('db', PRODUCT_TEMPLATE);
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

  expect(_loadStoredBoardForTesting(boardId).columns.map(column => column.name)).toEqual([
    'Idea Backlog', 'Planned', 'In Development', 'Testing', 'Ready for Release', 'Shipped',
  ]);
  const tasks = _loadStoredBoardForTesting(boardId).tasks;
  expect(tasks).toHaveLength(5);
  const development = _loadStoredBoardForTesting(boardId).columns.find(column => column.name === 'In Development');
  expect(tasks.find(task => task.title === 'Feature: Board export improvements').column).toBe(development.id);
});

test('rendering a board while its columns are still arriving does not add a second Done column', async () => {
  const { boardId, outbound } = await createTemplateBoardAndCaptureEvents();
  for (const event of outbound) {
    await applyFromServer(event);
    setActiveBoardId(boardId);
    loadColumns();
  }

  expect(_loadStoredBoardForTesting(boardId).columns.map(column => column.name)).toEqual([
    'Idea Backlog', 'Planned', 'In Development', 'Testing', 'Ready for Release', 'Shipped',
  ]);
});

test('an active board change updates the selection and title without replacing options', () => {
  const originalId = createBoard('First board').id;
  const second = createBoard('Second board');
  const { select, title } = mountBoardNavigation();
  const options = [...select.options];
  expect(select.value).toBe(second.id);

  setActiveBoardId(originalId);
  emit(DATA_CHANGED);

  expect(select.value).toBe(originalId);
  expect(title.textContent).toBe('First board');
  expect(select.options[0]).toBe(options[0]);
});

test.each([
  ['blank', ''],
  ['templated', PRODUCT_TEMPLATE]
])('creating a %s board selects it and updates the page title', (_, template) => {
  createBoard('Previous board');
  const { select, title } = mountBoardNavigation();

  submitBoard('New board', template);

  expect(select.selectedOptions[0].textContent).toBe('New board');
  expect(title.textContent).toBe('New board');
});

test('confirming an import selects the imported board and updates the page title', async () => {
  createBoard('Previous board');
  const { select, title } = mountBoardNavigation();
  const board = { boardName: 'Imported board', tasks: [], columns: [] };
  importTasks(new File([JSON.stringify(board)], 'board.json', { type: 'application/json' }));

  const dialogTitle = () => document.getElementById('dialog-modal-title')?.textContent;
  await waitFor(() => expect(dialogTitle()).toBe('Review Import'));
  expect(select.selectedOptions[0].textContent).toBe('Previous board');
  document.getElementById('dialog-confirm-btn').click();

  await waitFor(() => expect(dialogTitle()).toBe('Import Complete'));
  expect(select.selectedOptions[0].textContent).toBe('Imported board');
  expect(title.textContent).toBe('Imported board');
  document.getElementById('dialog-confirm-btn').click();
});

test('the picker and title reflect projected remote board names in HLC order', async () => {
  const local = createBoard('Local board');
  const { select, title } = mountBoardNavigation();
  const remoteId = 'b0a4d000-0000-4000-8000-000000000353';
  const at = new Date().toISOString();
  const remoteEvent = (counter, type, payload) => applyFromServer({
    id: crypto.randomUUID(), type, board_id: remoteId, entity_id: remoteId, scope: 'board',
    hlc: { wallTime: Date.parse(at), counter, nodeId: 'remote' }, at, payload
  });

  await remoteEvent(1, 'board.created', { board: { id: remoteId, name: 'Remote board' } });
  expect([...select.options].map(option => option.textContent)).toContain('Remote board');
  expect(select.value).toBe(local.id);
  expect(title.textContent).toBe('Local board');

  select.value = remoteId;
  select.dispatchEvent(new Event('change'));
  await remoteEvent(3, 'board.updated', { fields: { name: 'Latest name' } });
  expect(select.selectedOptions[0].textContent).toBe('Latest name');
  expect(title.textContent).toBe('Latest name');

  await remoteEvent(2, 'board.updated', { fields: { name: 'Earlier name' } });
  expect(select.value).toBe(remoteId);
  expect(select.selectedOptions[0].textContent).toBe('Latest name');
  expect(title.textContent).toBe('Latest name');
});

test('editing a task preserves the picker options', () => {
  const { select } = mountBoardNavigation();
  submitBoard('Template board', PRODUCT_TEMPLATE);
  const option = select.selectedOptions[0];
  const task = loadTasks()[0];

  scheduleDomainEvent({
    type: 'task.updated', boardId: select.value, entityId: task.id,
    payload: { fields: { title: 'Edited task' } }
  });

  expect(loadTasks().find(item => item.id === task.id).title).toBe('Edited task');
  expect(select.selectedOptions[0]).toBe(option);
});
