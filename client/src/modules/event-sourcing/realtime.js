// Inbound sync: PocketBase realtime SSE subscription + catch-up pull (issue #114,
// PRD §4.8), both run by the sync session. Every remote event goes through the
// same ingest interface as local events (#177), so the projector's id dedup
// makes echoes and catch-up/SSE overlap no-ops. Remote events are persisted as
// already-synced so the outbound queue never pushes them back.

import { openStore, writeIfDataCurrent, KV_STORE } from '../idb-store.js';
import { getPb, isAuthenticated, getUser } from '../sync.js';
import { compareHlc, laterHlc } from './hlc.js';
import { EVENT_ORIGIN, adoptSnapshot, ingestEvent, ingestRemoteBatch } from './ingest.js';
import { snapshotKeyForEvent } from './snapshot.js';
import { downloadAllSnapshots } from './snapshot-sync.js';
import { EVENT_SCOPE } from '../constants.js';

const LAST_SEEN_PREFIX = 'kanvana:sync:lastSeenHlc:';
const STOPPED_PULL_WAIT_MS = 3000;

let _unsubscribe = null;
let _connectUnsubscribe = null;
let _starting = null;
let _catchingUp = null;
let _onConnect = null;
let _pullGeneration = 0;
let _arrivals = [];
let _applyingArrivals = false;

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
  await writeIfDataCurrent(KV_STORE, (store) => store.put(hlc, LAST_SEEN_PREFIX + key));
}

// Messages landing while earlier ones are being stored join one batch, so a burst does not redraw per event (#142).
export function applyRemoteEvent(record) {
  return new Promise((resolve, reject) => {
    _arrivals.push({ record, resolve, reject });
    applyArrivals();
  });
}

async function applyArrivals() {
  if (_applyingArrivals) return;
  _applyingArrivals = true;
  while (_arrivals.length) {
    const burst = _arrivals;
    _arrivals = [];
    try {
      if (burst.length === 1) {
        await ingestEvent(recordToEvent(burst[0].record), { origin: EVENT_ORIGIN.REMOTE, receivedAt: burst[0].record.created });
      } else {
        await ingestRemoteBatch(burst.map(({ record }) => ({ event: recordToEvent(record), receivedAt: record.created })));
      }
      burst.forEach(({ resolve }) => resolve());
    } catch (err) {
      burst.forEach(({ reject }) => reject(err));
    }
  }
  _applyingArrivals = false;
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
  // In one tick the SDK just closes the connection; one at a time it POSTs the remaining topics, which fails once signed out.
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

// A running pull may predate this request or have been cut short by a stop, so this one starts after it.
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

// A stopped pull only outlives the stop by its current write or an ignored request; the cap covers a hung request.
export async function waitForStoppedPull() {
  await stopRealtime();
  if (!_catchingUp) return;
  let timer;
  const capped = new Promise((res) => { timer = setTimeout(res, STOPPED_PULL_WAIT_MS); });
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
