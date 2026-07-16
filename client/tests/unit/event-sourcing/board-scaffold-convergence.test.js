/**
 * Board scaffolding must emit column.created / label.created events so a fresh
 * second device can reconstruct the board's columns and labels from the event
 * log alone (gaps A + B from the #114 convergence investigation).
 *
 * These tests need a live (fake) IDB because event emission is a no-op without
 * a DB ref (see emitter.js scheduleDomainEvent).
 */

import { test, expect, beforeEach } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _flushPersistsForTesting,
  createBoard,
  ensureBoardsInitialized,
  getActiveBoardId,
  loadColumns,
  loadLabels,
} from '../../../src/modules/storage.js';
import { on, off, EVENT_EMITTED } from '../../../src/modules/events.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

const DB_NAME = 'kanvana-db';

function captureEvents() {
  const events = [];
  const handler = (e) => events.push(e.detail);
  on(EVENT_EMITTED, handler);
  return { events, stop: () => off(EVENT_EMITTED, handler) };
}

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB(DB_NAME);
});

test('createBoard emits a column.created per default column and a label.created per default label', async () => {
  await initStorage();
  // Seed (and drain) the default board first so we only capture createBoard's own events.
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
  const cap = captureEvents();
  const board = createBoard('Test Board');
  await _flushPersistsForTesting();
  cap.stop();

  const ofType = (t) => cap.events.filter((e) => e.type === t);

  const columnIds = new Set(loadColumns().map((c) => c.id));
  const labelIds = new Set(loadLabels().map((l) => l.id));

  expect(ofType('board.created').map((e) => e.entity_id)).toEqual([board.id]);

  const columnEvents = ofType('column.created');
  expect(columnEvents.length).toBe(columnIds.size);
  expect(new Set(columnEvents.map((e) => e.entity_id))).toEqual(columnIds);

  const labelEvents = ofType('label.created');
  expect(labelEvents.length).toBe(labelIds.size);
  expect(new Set(labelEvents.map((e) => e.entity_id))).toEqual(labelIds);
});

test('a fresh device reconstructs createBoard columns and labels from the event log alone', async () => {
  await initStorage();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
  const cap = captureEvents();
  const board = createBoard('Test Board');
  await _flushPersistsForTesting();
  cap.stop();

  // Local truth, then replay the emitted events into an empty projection state
  // exactly as a second device's catch-up would.
  const expectedColumnIds = new Set(loadColumns().map((c) => c.id));
  const expectedLabelIds = new Set(loadLabels().map((l) => l.id));

  const remote = applyEvents(createProjectionState({}), cap.events);

  expect(remote.boards.map((b) => b.id)).toEqual([board.id]);
  expect(new Set(remote.columns.map((c) => c.id))).toEqual(expectedColumnIds);
  expect(new Set(remote.labels.map((l) => l.id))).toEqual(expectedLabelIds);
});

test('the default board uses a stable id across independent device initialisations', async () => {
  await initStorage();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
  const idA = getActiveBoardId();

  resetLocalStorage();
  await deleteDB(DB_NAME);
  await initStorage();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
  const idB = getActiveBoardId();

  expect(idB).toBe(idA);
});

test('two devices seeding the default board converge to one board with no duplicate columns or labels', async () => {
  // Device A seeds its default board.
  await initStorage();
  const capA = captureEvents();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
  capA.stop();

  // Device B (independent fresh storage) seeds its own default board.
  resetLocalStorage();
  await deleteDB(DB_NAME);
  await initStorage();
  const capB = captureEvents();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
  capB.stop();

  // The backend merges both event streams; a third device replays the union.
  const merged = applyEvents(createProjectionState({}), [...capA.events, ...capB.events]);

  expect(merged.boards.length).toBe(1);
  expect(merged.columns.length).toBe(3);
  expect(merged.labels.length).toBe(5);
});

test('createBoard does not double-apply its own scaffold events onto the local read-model', async () => {
  await initStorage();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();

  const board = createBoard('Test Board');
  // Live projection of createBoard's own events must dedup against the columns
  // it already wrote directly (matching entity ids), not append duplicates.
  await _flushPersistsForTesting();

  expect(loadColumns().length).toBe(3);
  expect(loadLabels().length).toBe(5);
  expect(board.id).toBeTruthy();
});
