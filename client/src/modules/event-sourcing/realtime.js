// Inbound sync: PocketBase realtime SSE subscription + launch/reconnect
// catch-up pull (issue #114, PRD §4.8). Every remote event runs through the
// same projection pipeline as local events (emit EVENT_EMITTED), so the
// reducer's UUID dedup makes echoes and catch-up/SSE overlap no-ops for free.
// Remote events are persisted as already-synced so the outbound queue never
// pushes them back.

import { emit, EVENT_EMITTED } from '../events.js';
import { persistEvent, openStore, KV_STORE, EVENTS_STORE } from '../idb-store.js';
import { getPb, isAuthenticated, getUser } from '../sync.js';
import { observeRemote, compareHlc } from './hlc.js';
import { snapshotKeyForEvent, saveSnapshot, loadSnapshot } from './snapshot.js';
import { downloadAllSnapshots } from './snapshot-sync.js';
import { hydrateFromSnapshotState } from '../storage.js';

const LAST_SEEN_PREFIX = 'kanvana:sync:lastSeenHlc:';

let _unsubscribe = null;
let _connectUnsubscribe = null;
let _starting = null;
let _catchingUp = null;
let _handlers = null;

function recordToEvent(r) {
  return {
    id: r.local_id,
    type: r.event_type,
    hlc: r.hlc,
    at: r.at,
    actor: { type: r.actor_type ?? 'human', id: r.actor_id ?? null },
    scope: r.scope ?? 'board',
    board_id: r.board || null,
    entity_id: r.entity_id ?? '',
    payload: r.payload ?? {},
  };
}

async function getLastSeen(key) {
  const db = await openStore();
  return (await db.get(KV_STORE, LAST_SEEN_PREFIX + key)) || null;
}

async function setLastSeen(key, hlc) {
  const db = await openStore();
  await db.put(KV_STORE, hlc, LAST_SEEN_PREFIX + key);
}

// Feed a remote event through the local projection pipeline.
async function ingest(event) {
  if (!event.id) return;
  if (event.hlc) await observeRemote(event.hlc);
  await persistEvent({ ...event, synced: true });
  emit(EVENT_EMITTED, event);
}

export async function applyRemoteEvent(record) {
  await ingest(recordToEvent(record));
}

export async function startRealtime() {
  if (_unsubscribe || !isAuthenticated()) return;
  if (_starting) return _starting;
  _starting = subscribeRealtime().finally(() => { _starting = null; });
  return _starting;
}

async function subscribeRealtime() {
  const pb = getPb();
  const ownerId = getUser()?.id;
  _connectUnsubscribe = await pb.realtime.subscribe('PB_CONNECT', () => {
    catchUpAfterPending().catch(err => console.error('[Kanvana] Realtime reconnect catch-up failed', err));
  });
  try {
    _unsubscribe = await pb.collection('events').subscribe('*', (e) => {
      if (e.action === 'create') applyRemoteEvent(e.record);
    }, { filter: `owner = "${ownerId}"` });
  } catch (err) {
    await _connectUnsubscribe();
    _connectUnsubscribe = null;
    throw err;
  }
}

export async function stopRealtime() {
  if (_starting) { try { await _starting; } catch {} }
  if (_connectUnsubscribe) {
    await _connectUnsubscribe();
    _connectUnsubscribe = null;
  }
  if (!_unsubscribe) return;
  const unsub = _unsubscribe;
  _unsubscribe = null;
  await unsub();
}

// Catch-up pulls all owner-scoped events in HLC order. Only snapshots cover
// earlier history; a watermark cannot exclude delayed events from other devices.
// Adopt any server snapshot newer than what this device has already seen, before
// replaying events. uploadSnapshot() deletes the events a snapshot covers, so for
// a device that joined afterwards the snapshot is the only surviving history.
// The saved snapshot's HLC excludes events already represented by its state.
async function hydrateFromRemoteSnapshots() {
  for (const snapshot of await downloadAllSnapshots()) {
    const seen = await getLastSeen(snapshot.key);
    if (seen && compareHlc(snapshot.hlc, seen) <= 0) continue;
    await saveSnapshot(snapshot.key, snapshot.state, snapshot.hlc);
    hydrateFromSnapshotState(snapshot.key, snapshot.state);
    await setLastSeen(snapshot.key, snapshot.hlc);
  }
}

export async function catchUp() {
  if (!isAuthenticated()) return;
  if (_catchingUp) return _catchingUp;
  _catchingUp = pullRemoteState().finally(() => { _catchingUp = null; });
  return _catchingUp;
}

async function catchUpAfterPending() {
  if (_catchingUp) await _catchingUp;
  await catchUp();
}

async function pullRemoteState() {
  await hydrateFromRemoteSnapshots();
  const pb = getPb();
  const ownerId = getUser()?.id;
  const records = await pb.collection('events').getFullList({
    filter: `owner = "${ownerId}"`,
    requestKey: null,
  });

  const events = records
    .map(recordToEvent)
    .filter(e => e.id && e.hlc)
    .sort((a, b) => compareHlc(a.hlc, b.hlc));

  const seenByKey = new Map();
  const maxByKey = new Map();
  const db = await openStore();

  for (const event of events) {
    const key = snapshotKeyForEvent(event);
    if (!seenByKey.has(key)) seenByKey.set(key, (await loadSnapshot(key))?.hlc);
    const seen = seenByKey.get(key);
    // A later HLC arriving first does not cover missing earlier events. Only a
    // snapshot covers history; otherwise deduplicate by the persisted event id.
    if (seen && compareHlc(event.hlc, seen) <= 0) continue;
    if (await db.get(EVENTS_STORE, event.id)) continue;
    await ingest(event);
    const max = maxByKey.get(key);
    if (!max || compareHlc(event.hlc, max) > 0) maxByKey.set(key, event.hlc);
  }

  for (const [key, hlc] of maxByKey) {
    const seen = await getLastSeen(key);
    if (!seen || compareHlc(hlc, seen) > 0) await setLastSeen(key, hlc);
  }
}

async function onAuthChanged() {
  if (isAuthenticated()) {
    await onOnline();
  } else {
    await stopRealtime();
  }
}

async function onOnline() {
  if (!isAuthenticated()) return;
  await Promise.all([catchUp(), startRealtime()]);
  await catchUp();
}

export function initRealtime() {
  if (typeof window === 'undefined' || _handlers) return;
  _handlers = {
    auth: () => { onAuthChanged().catch(err => console.error('[Kanvana] Realtime auth handler failed', err)); },
    online: () => { onOnline().catch(err => console.error('[Kanvana] Realtime online handler failed', err)); },
  };
  window.addEventListener('auth-changed', _handlers.auth);
  window.addEventListener('online', _handlers.online);
  if (isAuthenticated()) _handlers.online();
}

export async function _resetRealtimeForTesting() {
  if (_handlers && typeof window !== 'undefined') {
    window.removeEventListener('auth-changed', _handlers.auth);
    window.removeEventListener('online', _handlers.online);
  }
  _handlers = null;
  await stopRealtime();
  if (_catchingUp) await _catchingUp;
}

// True when the SSE subscription is live (used by the header sync indicator, #115).
export function isRealtimeActive() {
  return !!_unsubscribe;
}

export { recordToEvent, LAST_SEEN_PREFIX };
