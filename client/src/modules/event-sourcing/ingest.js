// The single entry point of the event log (#177): local mutations and remote
// events (SSE and catch-up) both pass through ingestEvent(). Origin only decides
// the `synced` flag and whether the remote HLC is observed first; validation,
// projection, DATA_CHANGED and persistence are shared.

import { DATA_CHANGED, EVENT_EMITTED, emit } from '../events.js';
import { EVENTS_STORE, flushPendingPersists, getDbRef, persistEvent } from '../idb-store.js';
import { observeRemote } from './hlc.js';

export const EVENT_ORIGIN = Object.freeze({ LOCAL: 'local', REMOTE: 'remote' });

let projector = null;

// The read-model projector (ADR-0005) connects itself once storage has loaded.
// Until then events are only persisted, which is what boot-time backfill needs.
export function connectProjector(project) {
  projector = project;
  return () => {
    if (projector === project) projector = null;
  };
}

function validate(event) {
  return Boolean(event?.id);
}

// Local events project synchronously, before this returns, so the caller's
// render sees them (ADR-0005 instant UI). The returned promise settles once
// the event is persisted; it rejects if persistence fails.
export function ingestEvent(event, { origin = EVENT_ORIGIN.LOCAL } = {}) {
  if (!validate(event)) return Promise.resolve();
  if (origin === EVENT_ORIGIN.REMOTE) return ingestRemote(event);
  return commit(event, origin);
}

// A remote event already in the event store was applied before, maybe before
// a reload; the store, unlike session memory, survives one (#178). Events a
// snapshot has collected are answered by the projector from the snapshot.
async function ingestRemote(event) {
  if (await isStored(event.id)) return;
  if (event.hlc) await observeRemote(event.hlc);
  return commit(event, EVENT_ORIGIN.REMOTE);
}

async function isStored(id) {
  const db = getDbRef();
  return Boolean(db && await db.get(EVENTS_STORE, id));
}

function commit(event, origin) {
  if (projector?.(event)) emit(DATA_CHANGED, { event });
  emit(EVENT_EMITTED, event);
  if (!getDbRef()) return Promise.resolve();
  return persistEvent({ ...event, synced: origin === EVENT_ORIGIN.REMOTE }).then(() => flushPendingPersists());
}
