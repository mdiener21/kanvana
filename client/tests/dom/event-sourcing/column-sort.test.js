// #184: sorting a Column emits events, so a rebuild and other devices keep the sort.
import { afterEach, beforeEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { EVENT_EMITTED, off, on } from '../../../src/modules/events.js';
import {
  initStorage, createBoard, setActiveBoardId, loadColumnsForBoard, loadTasksForBoard,
  _flushPersistsForTesting, _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import { addTask, sortColumnTasks } from '../../../src/modules/tasks.js';

let boardId;
let columnId;

beforeEach(async () => {
  _resetStorageForTesting();
  await deleteDB('kanvana-db');
  await initStorage();
  boardId = createBoard('Sort').id;
  setActiveBoardId(boardId);
  columnId = loadColumnsForBoard(boardId)[0].id;
  addTask('Low', '', 'low', '2026-12-03', columnId);
  addTask('Urgent', '', 'urgent', '2026-12-01', columnId);
  addTask('Medium', '', 'medium', '', columnId);
  addTask('High', '', 'high', '2026-12-02', columnId);
  await _flushPersistsForTesting();
});

afterEach(async () => {
  await _flushPersistsForTesting();
  _resetStorageForTesting();
});

function columnTitles() {
  return loadTasksForBoard(boardId)
    .filter((task) => task.column === columnId)
    .sort((a, b) => a.order - b.order)
    .map((task) => task.title);
}

function captureEmitted() {
  const events = [];
  const handler = (e) => events.push(e.detail);
  on(EVENT_EMITTED, handler);
  return { events, stop: () => off(EVENT_EMITTED, handler) };
}

test('sorting by priority emits a task.moved event and updates the read model before returning', () => {
  const capture = captureEmitted();
  sortColumnTasks(columnId, 'priority');
  capture.stop();

  expect(columnTitles()).toEqual(['Urgent', 'High', 'Medium', 'Low']);
  expect(capture.events.map((event) => event.type)).toEqual(['task.moved']);
  expect(capture.events[0]).toMatchObject({ board_id: boardId, entity_id: columnId });
});

test('sorting by due date puts tasks without a due date last', () => {
  sortColumnTasks(columnId, 'dueDate');

  expect(columnTitles()).toEqual(['Urgent', 'High', 'Low', 'Medium']);
});

test('sorting a column that is already sorted emits nothing', () => {
  sortColumnTasks(columnId, 'priority');
  const capture = captureEmitted();
  sortColumnTasks(columnId, 'priority');
  capture.stop();

  expect(capture.events).toEqual([]);
});
