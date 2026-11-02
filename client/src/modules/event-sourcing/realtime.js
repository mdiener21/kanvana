// Inbound sync: PocketBase realtime SSE subscription + catch-up pull (issue #114,
// PRD §4.8), both run by the sync session. Every remote event goes through the
// same ingest interface as local events (#177), so the projector's id dedup
// makes echoes and catch-up/SSE overlap no-ops. Remote events are persisted as
// already-synced so the outbound queue never pushes them back.

import { openStore, KV_STORE } from '../idb-store.js';
import { getPb, isAuthenticated, getUser } from '../sync.js';
import { compareHlc, laterHlc } from './hlc.js';
import { EVENT_ORIGIN, adoptSnapshot, ingestEvent, ingestRemoteBatch } from './ingest.js';
import { snapshotKeyForEvent } from './snapshot.js';
import { downloadAllSnapshots } from './snapshot-sync.js';
import { EVENT_SCOPE } from '../constants.js';

const LAST_SEEN_PREFIX = 'kanvana:sync:lastSeenHlc:';

let _unsubscribe = null;
let _connectUnsubscribe = null;
let _starting = null;
let _catchingUp = null;
let _onConnect = null;
let _pullGeneration = 0;

function recordToEvent(r) {
  return {
    id: r.local_id,
    type: r.event_type,
    hlc: r.hlc,
    at: r.at,
    actor: { type: r.actor_type ?? 'human', id: r.actor_id ?? null },
    scope: r.scope ?? EVENT_SCOPE.BOARD,
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

export async function applyRemoteEvent(record) {
  await ingestEvent(recordToEvent(record), { origin: EVENT_ORIGIN.REMOTE, receivedAt: record.created });
}

// `onConnect` fires on every SSE connect, the initial one and each automatic reconnect.
export async function startRealtime({ onConnect } = {}) {
  if (_unsubscribe || !isAuthenticated()) return;
  _onConnect = onConnect ?? null;
  if (_starting) return _starting;
  _starting = subscribeRealtime().finally(() => { _starting = null; });
  return _starting;
}

async function subscribeRealtime() {
  const pb = getPb();
  const ownerId = getUser()?.id;
  _connectUnsubscribe = await pb.realtime.subscribe('PB_CONNECT', () => _onConnect?.());
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
  _pullGeneration += 1;
  if (_starting) { try { await _starting; } catch {} }
  const unsubscribes = [_connectUnsubscribe, _unsubscribe].filter(Boolean);
  _connectUnsubscribe = null;
  _unsubscribe = null;
  // Started in one tick, the SDK sees no topics left and just closes the connection.
  // One at a time, it would POST the remaining topics first, which fails once signed out.
  await Promise.all(unsubscribes.map((unsubscribe) => unsubscribe()));
}

// For a device that joined after server cleanup, the snapshot is the only surviving history.
async function hydrateFromRemoteSnapshots(isStale) {
  for (const snapshot of await downloadAllSnapshots()) {
    if (isStale()) return;
    const seen = await getLastSeen(snapshot.key);
    if (seen && compareHlc(snapshot.hlc, seen) <= 0) continue;
    await adoptSnapshot(snapshot.key, snapshot.state, snapshot.hlc);
    await setLastSeen(snapshot.key, snapshot.hlc);
  }
}

export async function catchUp() {
  if (!isAuthenticated()) return;
  if (_catchingUp) return _catchingUp;
  _catchingUp = pullRemoteState().finally(() => { _catchingUp = null; });
  return _catchingUp;
}

// A pull already running may have read the server before this was asked for, or may
// have been cut short by a stop, so this one starts fresh after it.
export async function catchUpAfterPending() {
  if (_catchingUp) await _catchingUp.catch(() => {});
  await catchUp();
}

async function pullRemoteState() {
  const generation = _pullGeneration;
  const isStale = () => generation !== _pullGeneration;
  await hydrateFromRemoteSnapshots(isStale);
  if (isStale()) return;
  const pb = getPb();
  const ownerId = getUser()?.id;
  const records = await pb.collection('events').getFullList({
    filter: `owner = "${ownerId}"`,
    requestKey: null,
  });
  if (isStale()) return;

  // A rejected event must not advance a watermark (#181).
  const fresh = await ingestRemoteBatch(records.map((record) => ({ event: recordToEvent(record), receivedAt: record.created })));

  const maxByKey = new Map();
  for (const event of fresh) {
    const key = snapshotKeyForEvent(event);
    maxByKey.set(key, laterHlc(maxByKey.get(key), event.hlc));
  }

  for (const [key, hlc] of maxByKey) {
    const seen = await getLastSeen(key);
    if (!seen || compareHlc(hlc, seen) > 0) await setLastSeen(key, hlc);
  }
}

// A stopped pull checks for that between steps, so it only outlives the stop by the local
// write in progress or a request whose result it will ignore; the cap covers a hung request.
export async function waitForStoppedPull(capMs = 3000) {
  await stopRealtime();
  if (!_catchingUp) return;
  let timer;
  const capped = new Promise((res) => { timer = setTimeout(res, capMs); });
  await Promise.race([_catchingUp.catch(() => {}), capped]);
  clearTimeout(timer);
}

export async function _resetRealtimeForTesting() {
  await stopRealtime();
  if (_catchingUp) await _catchingUp.catch(() => {});
}

// True when the SSE subscription is live (used by the header sync indicator, #115).
export function isRealtimeActive() {
  return !!_unsubscribe;
}

export { recordToEvent, LAST_SEEN_PREFIX };
