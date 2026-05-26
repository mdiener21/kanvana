import { beforeEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import { openStore } from '../../../src/modules/idb-store.js';
import { emitDomainEvent } from '../../../src/modules/event-sourcing/emitter.js';

const DB_NAME = 'kanvana-db';

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB(DB_NAME);
});

test('emitDomainEvent stores an unsynced immutable event row', async () => {
  const event = await emitDomainEvent({
    type: 'task.updated',
    boardId: 'board-a',
    entityId: 'task-a',
    payload: { fields: { title: 'After' } }
  });

  const db = await openStore();
  await expect(db.get('events', event.id)).resolves.toMatchObject({
    ...event,
    synced: false
  });
});
