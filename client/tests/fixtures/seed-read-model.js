// Seeds the Read Model through domain events, the path production uses (ADR-0005): the reducer stays its only writer.
// Local events project synchronously, so the seeded data is readable as soon as a call returns;
// `await _flushPersistsForTesting()` (or `flushDomainEvents()`) when a test also needs it in IDB.

import {
  ensureBoardsInitialized,
  getActiveBoardId,
  _loadStoredBoardForTesting
} from '../../src/modules/storage.js';
import { scheduleDomainEvent } from '../../src/modules/event-sourcing/emitter.js';
import { EVENT_SCOPE } from '../../src/modules/constants.js';

const SLICES = [
  { key: 'columns', entity: 'column', load: (boardId) => _loadStoredBoardForTesting(boardId).columns },
  { key: 'labels', entity: 'label', load: (boardId) => _loadStoredBoardForTesting(boardId).labels },
  { key: 'tasks', entity: 'task', load: (boardId) => _loadStoredBoardForTesting(boardId).tasks }
];

// Replaces the given slices (columns, labels, tasks) of a board, the active one by default, through events.
// Items missing from a given slice are deleted, known ids are overwritten field by field, the rest are created
// in list order; slices left out are not touched. Events cannot reorder known items, so asking for that throws:
// seed a new board (`createBoard()` makes it active) instead.
export function seedBoard(slices, { boardId } = {}) {
  ensureBoardsInitialized();
  const board = boardId ?? getActiveBoardId();
  for (const { key, entity, load } of SLICES) {
    if (slices[key] !== undefined) replaceSlice(board, entity, load, slices[key]);
  }
}

// Sets global settings through a global `settings.updated` event; fields merge over the current ones.
// Like every storage entry point, it starts the Read Model projecting, which seeds the default board on empty storage.
export function seedGlobalSettings(fields) {
  ensureBoardsInitialized();
  scheduleDomainEvent({ type: 'settings.updated', scope: EVENT_SCOPE.GLOBAL, entityId: 'global', payload: { fields } });
}

function replaceSlice(boardId, entity, load, items) {
  const emit = (type, entityId, payload) => scheduleDomainEvent({ type: `${entity}.${type}`, boardId, entityId, payload });
  const current = new Map(load(boardId).map((item) => [item.id, item]));
  const wanted = new Set(items.map((item) => item.id));

  for (const id of current.keys()) {
    if (!wanted.has(id)) emit('deleted', id, {});
  }
  for (const item of items) {
    const existing = current.get(item.id);
    if (existing) emit('updated', item.id, { fields: overwrite(existing, item) });
    else emit('created', item.id, { [entity]: { ...item } });
  }

  // A deleted column or label keeps its id, so creating it again is a no-op: bring it back instead.
  const live = new Set(load(boardId).map((item) => item.id));
  for (const item of items) {
    if (live.has(item.id)) continue;
    if (entity === 'task') throw new Error(`seedBoard: task ${item.id} was deleted on this board; seed it under a new id`);
    emit('updated', item.id, { fields: { ...item, deleted: undefined } });
  }

  // Events append new items and keep known ones in place; payloads and renders follow that order, so say when it differs.
  const seeded = load(boardId).map((item) => item.id).join(', ');
  const asked = items.map((item) => item.id).join(', ');
  if (seeded !== asked) {
    throw new Error(`seedBoard: events cannot reorder known ${entity}s (got order ${seeded}, asked ${asked}); seed a new board instead`);
  }
}

// Keys the new item lacks are cleared, so the result matches the item rather than a merge of both.
function overwrite(existing, item) {
  const cleared = Object.fromEntries(Object.keys(existing).filter((key) => key !== 'id' && !(key in item)).map((key) => [key, undefined]));
  return { ...cleared, ...item };
}
