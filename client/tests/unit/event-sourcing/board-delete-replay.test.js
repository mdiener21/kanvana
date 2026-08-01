/**
 * Regression: a device replaying the event log resurrected boards that had been
 * deleted on another device. deleteBoard() hard-removes locally, but the reducer's
 * applyBoardDeleted only sets a `deleted` tombstone — and listBoards() returned
 * every board regardless, unlike its loadTasks/Columns/LabelsForBoard siblings.
 */

import { test, expect, beforeEach } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  createBoard,
  listBoards
} from '../../../src/modules/storage.js';
import { emit, EVENT_EMITTED } from '../../../src/modules/events.js';

const REMOTE_BOARD = 'c0ffee00-0000-4000-8000-00000000beef';

function remoteEvent(type, entityId, payload, counter) {
  return {
    id: `evt-${type}-${counter}`,
    type,
    hlc: { wallTime: 5_000 + counter, counter, nodeId: 'remote-node' },
    at: '2026-06-07T20:17:33.372Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: REMOTE_BOARD,
    entity_id: entityId,
    payload
  };
}

beforeEach(async () => {
  _resetStorageForTesting();
  resetLocalStorage();
  await deleteDB('kanvana-db');
  await initStorage();
});

test('a board deleted elsewhere does not come back when its events replay', async () => {
  createBoard('Local board');

  emit(EVENT_EMITTED, remoteEvent('board.created', REMOTE_BOARD, {
    board: { id: REMOTE_BOARD, name: 'Shared', createdAt: '2026-06-07T20:17:33.372Z' }
  }, 1));
  expect(listBoards().map((b) => b.name)).toContain('Shared');

  emit(EVENT_EMITTED, remoteEvent('board.deleted', REMOTE_BOARD, {}, 2));
  await _flushPersistsForTesting();

  expect(listBoards().map((b) => b.name)).not.toContain('Shared');
  expect(listBoards().map((b) => b.name)).toContain('Local board');
});

test('the tombstone survives a reload rather than resurrecting from IDB', async () => {
  createBoard('Local board');
  emit(EVENT_EMITTED, remoteEvent('board.created', REMOTE_BOARD, {
    board: { id: REMOTE_BOARD, name: 'Shared' }
  }, 1));
  emit(EVENT_EMITTED, remoteEvent('board.deleted', REMOTE_BOARD, {}, 2));
  await _flushPersistsForTesting();

  _resetStorageForTesting();
  await initStorage();

  expect(listBoards().map((b) => b.name)).not.toContain('Shared');
});
