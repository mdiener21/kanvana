// One-shot migration for state that predates the event log (LWW → event sourcing,
// 2026-06-07). Events are only emitted going forward, so boards/tasks already in
// IDB when event sourcing landed had no events and were invisible to sync — a new
// device replaying the log saw nothing, while the header still read "Live ●"
// because the outbound queue was legitimately empty.
//
// Emits a synthetic *.created event for every entity that doesn't already have one
// in the local event store, in board → column → label → task order so a replaying
// device builds each board before populating it. Projection is a no-op (the
// reducer's create handlers dedup on entity id), so this only fills the log.

import { openStore, EVENTS_STORE, KV_STORE } from '../idb-store.js';
import { scheduleDomainEvent } from './emitter.js';

export const BACKFILL_FLAG_KEY = 'kanvana:migrations:eventBackfill:v1';

// Column ids are only unique within a board ('done' exists on every board), so
// the dedup key is board-scoped.
function dedupKey(boardId, entityId) {
  return `${boardId}::${entityId}`;
}

export async function backfillEventLog({ boards, columnsFor, labelsFor, tasksFor, settingsFor }) {
  const db = await openStore();
  if (await db.get(KV_STORE, BACKFILL_FLAG_KEY)) return { skipped: true, emitted: 0 };

  const alreadyLogged = new Set();
  for (const event of await db.getAll(EVENTS_STORE)) {
    if (typeof event?.type === 'string' && event.type.endsWith('.created') && event.entity_id) {
      alreadyLogged.add(dedupKey(event.board_id, event.entity_id));
    }
  }

  let emitted = 0;
  function emitOnce(boardId, entityId, input) {
    const key = dedupKey(boardId, entityId);
    if (!entityId || alreadyLogged.has(key)) return;
    alreadyLogged.add(key);
    scheduleDomainEvent(input);
    emitted += 1;
  }

  for (const board of boards) {
    emitOnce(board.id, board.id, {
      type: 'board.created', boardId: board.id, entityId: board.id, payload: { board }
    });
    for (const column of columnsFor(board.id)) {
      emitOnce(board.id, column.id, {
        type: 'column.created', boardId: board.id, entityId: column.id, payload: { column }
      });
    }
    for (const label of labelsFor(board.id)) {
      emitOnce(board.id, label.id, {
        type: 'label.created', boardId: board.id, entityId: label.id, payload: { label }
      });
    }
    for (const task of tasksFor(board.id)) {
      emitOnce(board.id, task.id, {
        type: 'task.created', boardId: board.id, entityId: task.id, payload: { task }
      });
    }
    const settings = settingsFor(board.id);
    if (settings && Object.keys(settings).length > 0) {
      scheduleDomainEvent({
        type: 'settings.updated', boardId: board.id, entityId: board.id, payload: { fields: settings }
      });
      emitted += 1;
    }
  }

  await db.put(KV_STORE, { at: new Date().toISOString(), emitted }, BACKFILL_FLAG_KEY);
  return { skipped: false, emitted };
}
