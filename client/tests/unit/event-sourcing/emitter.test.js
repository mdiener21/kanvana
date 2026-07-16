import { beforeEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import { openStore } from '../../../src/modules/idb-store.js';
import { EVENT_EMITTED, on, off } from '../../../src/modules/events.js';
import { scheduleDomainEvent, _flushDomainEventsForTesting } from '../../../src/modules/event-sourcing/emitter.js';

const DB_NAME = 'kanvana-db';

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB(DB_NAME);
});

test('scheduleDomainEvent persists an unsynced immutable event row', async () => {
  // The store must be open so getDbRef() is set and the event is persisted.
  await openStore();

  let captured;
  const handler = (customEvent) => { captured = customEvent.detail; };
  on(EVENT_EMITTED, handler);
  scheduleDomainEvent({
    type: 'task.updated',
    boardId: 'board-a',
    entityId: 'task-a',
    payload: { fields: { title: 'After' } }
  });
  off(EVENT_EMITTED, handler);
  await _flushDomainEventsForTesting();

  const db = await openStore();
  await expect(db.get('events', captured.id)).resolves.toMatchObject({
    ...captured,
    synced: false
  });
});
