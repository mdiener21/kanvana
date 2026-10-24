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
  deleteBoard,
  listBoards
} from '../../../src/modules/storage.js';
import { getUnsyncedEvents } from '../../../src/modules/idb-store.js';
import { _flushDomainEventsForTesting } from '../../../src/modules/event-sourcing/emitter.js';
import { EVENT_ORIGIN, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';

const ingestRemote = (event) => ingestEvent(event, { origin: EVENT_ORIGIN.REMOTE });

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

  await ingestRemote(remoteEvent('board.created', REMOTE_BOARD, {
    board: { id: REMOTE_BOARD, name: 'Shared', createdAt: '2026-06-07T20:17:33.372Z' }
  }, 1));
  expect(listBoards().map((b) => b.name)).toContain('Shared');

  await ingestRemote(remoteEvent('board.deleted', REMOTE_BOARD, {}, 2));
  await _flushPersistsForTesting();

  expect(listBoards().map((b) => b.name)).not.toContain('Shared');
  expect(listBoards().map((b) => b.name)).toContain('Local board');
});

test('the tombstone survives a reload rather than resurrecting from IDB', async () => {
  createBoard('Local board');
  await ingestRemote(remoteEvent('board.created', REMOTE_BOARD, {
    board: { id: REMOTE_BOARD, name: 'Shared' }
  }, 1));
  await ingestRemote(remoteEvent('board.deleted', REMOTE_BOARD, {}, 2));
  await _flushPersistsForTesting();

  _resetStorageForTesting();
  await initStorage();

  expect(listBoards().map((b) => b.name)).not.toContain('Shared');
});

test('a board deleted on this device is removed on a second device through its events alone', async () => {
  createBoard('Keep');
  const doomed = createBoard('Doomed');
  await _flushDomainEventsForTesting();
  deleteBoard(doomed.id);
  await _flushDomainEventsForTesting();
  const outbound = await getUnsyncedEvents();
  expect(outbound.some((e) => e.type === 'board.deleted' && e.entity_id === doomed.id)).toBe(true);

  // Second device: an empty local store that receives the same event log from the server.
  _resetStorageForTesting();
  await deleteDB('kanvana-db');
  await initStorage();
  for (const event of outbound) await ingestRemote(event);
  await _flushPersistsForTesting();

  expect(listBoards().map((b) => b.name)).toContain('Keep');
  expect(listBoards().map((b) => b.name)).not.toContain('Doomed');
});
