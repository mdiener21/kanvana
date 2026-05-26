import { emit, EVENT_EMITTED } from '../events.js';
import { getDbRef, persistEvent } from '../idb-store.js';
import { generateUUID } from '../utils.js';
import { emitLocal } from './hlc.js';

const DEFAULT_ACTOR = { type: 'human', id: null };
const pendingDomainEvents = new Set();

export async function emitDomainEvent({ type, scope = 'board', boardId = null, entityId = '', payload = {}, actor = DEFAULT_ACTOR }) {
  const event = {
    id: generateUUID(),
    type,
    hlc: await emitLocal(),
    at: new Date().toISOString(),
    actor,
    scope,
    board_id: scope === 'board' ? boardId : null,
    entity_id: entityId,
    payload
  };
  await persistEvent(event);
  emit(EVENT_EMITTED, event);
  return event;
}

export function scheduleDomainEvent(input) {
  if (!getDbRef()) return;
  const pending = emitDomainEvent(input).catch((err) => {
    console.error('[Kanvana] Event emission failed', err);
  });
  pendingDomainEvents.add(pending);
  pending.finally(() => pendingDomainEvents.delete(pending));
}

export async function _flushDomainEventsForTesting() {
  await Promise.all([...pendingDomainEvents]);
}
