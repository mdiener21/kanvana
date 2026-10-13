import { generateUUID } from '../utils.js';
import { emitLocalSync } from './hlc.js';
import { EVENT_ORIGIN, ingestEvent } from './ingest.js';

const DEFAULT_ACTOR = { type: 'human', id: null };
const pendingDomainEvents = new Set();

function buildDomainEvent({ type, scope = 'board', boardId = null, entityId = '', payload = {}, actor = DEFAULT_ACTOR }) {
  return {
    id: generateUUID(),
    type,
    hlc: emitLocalSync(),
    at: new Date().toISOString(),
    actor,
    scope,
    board_id: scope === 'board' ? boardId : null,
    entity_id: entityId,
    payload
  };
}

export function scheduleDomainEvent(input) {
  const pending = ingestEvent(buildDomainEvent(input), { origin: EVENT_ORIGIN.LOCAL }).catch((err) => {
    console.error('[Kanvana] Event persistence failed', err);
  });
  pendingDomainEvents.add(pending);
  pending.finally(() => pendingDomainEvents.delete(pending));
  return pending;
}

export async function flushDomainEvents() {
  await Promise.all([...pendingDomainEvents]);
}

export const _flushDomainEventsForTesting = flushDomainEvents;
