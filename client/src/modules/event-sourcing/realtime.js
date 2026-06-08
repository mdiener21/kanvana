// Inbound sync: PocketBase realtime SSE subscription + launch/reconnect
// catch-up pull (issue #114, PRD §4.8). Every remote event runs through the
// same projection pipeline as local events (emit EVENT_EMITTED), so the
// reducer's UUID dedup makes echoes and catch-up/SSE overlap no-ops for free.
// Remote events are persisted as already-synced so the outbound queue never
// pushes them back.

import { emit, EVENT_EMITTED } from '../events.js';
import { persistEvent, openStore, KV_STORE } from '../idb-store.js';
import { getPb, isAuthenticated, getUser } from '../sync.js';
import { observeRemote, compareHlc } from './hlc.js';
import { GLOBAL_SNAPSHOT_KEY } from './snapshot.js';

const LAST_SEEN_PREFIX = 'kanvana:sync:lastSeenHlc:';

let _unsubscribe = null;
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

function scopeKey(event) {
  return event.scope === 'global' ? GLOBAL_SNAPSHOT_KEY : (event.board_id || '');
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
  const pb = getPb();
  const ownerId = getUser()?.id;
  _unsubscribe = await pb.collection('events').subscribe('*', (e) => {
    if (e.action === 'create') applyRemoteEvent(e.record);
  }, { filter: `owner = "${ownerId}"` });
}

export async function stopRealtime() {
  if (!_unsubscribe) return;
  const unsub = _unsubscribe;
  _unsubscribe = null;
  await unsub();
}

// Catch-up pull: owner-scoped events newer than lastSeenHlc, applied in HLC
// order; lastSeenHlc advances per scope once the batch is drained. PB can't
// range-filter the JSON hlc field, so we fetch owner-scoped and filter by HLC
// client-side (the reducer re-sorts anyway; server order is irrelevant).
export async function catchUp() {
  if (!isAuthenticated()) return;
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

  for (const event of events) {
    const key = scopeKey(event);
    if (!seenByKey.has(key)) seenByKey.set(key, await getLastSeen(key));
    const seen = seenByKey.get(key);
    if (seen && compareHlc(event.hlc, seen) <= 0) continue;
    await ingest(event);
    const max = maxByKey.get(key);
    if (!max || compareHlc(event.hlc, max) > 0) maxByKey.set(key, event.hlc);
  }

  for (const [key, hlc] of maxByKey) await setLastSeen(key, hlc);
}

async function onAuthChanged() {
  if (isAuthenticated()) {
    await startRealtime();
    await catchUp();
  } else {
    await stopRealtime();
  }
}

async function onOnline() {
  if (!isAuthenticated()) return;
  await startRealtime();
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
  if (_unsubscribe) { try { await _unsubscribe(); } catch { /* ignore */ } }
  _unsubscribe = null;
}

// True when the SSE subscription is live (used by the header sync indicator, #115).
export function isRealtimeActive() {
  return !!_unsubscribe;
}

export { recordToEvent, LAST_SEEN_PREFIX };
