import { openStore, KV_STORE } from '../idb-store.js';

export const HLC_NODE_KEY = 'kanvana:hlc:node';
export const MAX_DRIFT_MS = 60_000;

let current = {
  wallTime: 0,
  counter: 0,
  nodeId: null
};

// Set once current.nodeId is known to match the stored id. A transient id from
// emitLocalSync() leaves it unset, so the next call still reconciles with storage.
let nodeIdPersisted = false;

async function ensureNodeId() {
  if (nodeIdPersisted && current.nodeId) return current.nodeId;

  const db = await openStore();
  const stored = await db.get(KV_STORE, HLC_NODE_KEY);
  if (typeof stored === 'string' && stored) {
    current.nodeId = stored;
  } else {
    current.nodeId ||= crypto.randomUUID();
    await db.put(KV_STORE, current.nodeId, HLC_NODE_KEY);
  }
  nodeIdPersisted = true;
  return current.nodeId;
}

export async function initHlc() {
  nodeIdPersisted = false;
  await ensureNodeId();
}

export async function emitLocal() {
  const nodeId = await ensureNodeId();
  const now = Date.now();

  if (now - current.wallTime > MAX_DRIFT_MS && current.wallTime > 0) {
    console.warn('[Kanvana] HLC drift exceeded 60000ms; accepting local wall time.');
  }

  if (now > current.wallTime) {
    current.wallTime = now;
    current.counter = 0;
  } else {
    current.counter += 1;
  }

  return { wallTime: current.wallTime, counter: current.counter, nodeId };
}

// Synchronous local stamp. Requires the node id to already be in memory, which
// initHlc() guarantees at startup; if it is missing (e.g. a unit test that never
// ran initStorage) a transient id is generated so local projection still works.
// Persistence of the node id remains initHlc()'s job.
export function emitLocalSync() {
  if (!current.nodeId) {
    current.nodeId = crypto.randomUUID();
  }
  const now = Date.now();

  if (now - current.wallTime > MAX_DRIFT_MS && current.wallTime > 0) {
    console.warn('[Kanvana] HLC drift exceeded 60000ms; accepting local wall time.');
  }

  if (now > current.wallTime) {
    current.wallTime = now;
    current.counter = 0;
  } else {
    current.counter += 1;
  }

  return { wallTime: current.wallTime, counter: current.counter, nodeId: current.nodeId };
}

export async function observeRemote(remoteHlc) {
  const nodeId = await ensureNodeId();
  const now = Date.now();
  const claimedWall = Number.isFinite(remoteHlc?.wallTime) ? remoteHlc.wallTime : 0;
  // A remote clock far in the future (a skewed or hostile device) may pull the
  // local clock ahead by at most MAX_DRIFT_MS (#181).
  const maxWall = now + MAX_DRIFT_MS;
  const clamped = claimedWall > maxWall;
  if (clamped) console.warn('[Kanvana] Remote HLC is more than 60000ms ahead; clamping.');
  const remoteWall = clamped ? maxWall : claimedWall;
  const remoteCounter = !clamped && Number.isFinite(remoteHlc?.counter) ? remoteHlc.counter : 0;
  const newWall = Math.max(now, current.wallTime, remoteWall);

  if (now - current.wallTime > MAX_DRIFT_MS && current.wallTime > 0) {
    console.warn('[Kanvana] HLC drift exceeded 60000ms; accepting local wall time.');
  }

  if (newWall === current.wallTime && newWall === remoteWall) {
    current.counter = Math.max(current.counter, remoteCounter) + 1;
  } else if (newWall === current.wallTime) {
    current.counter += 1;
  } else if (newWall === remoteWall) {
    current.counter = remoteCounter + 1;
  } else {
    current.counter = 0;
  }

  current.wallTime = newWall;
  return { wallTime: current.wallTime, counter: current.counter, nodeId };
}

export function compareHlc(a, b) {
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

export function laterHlc(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return compareHlc(b, a) > 0 ? b : a;
}

export function _resetHlcForTesting() {
  current = { wallTime: 0, counter: 0, nodeId: null };
  nodeIdPersisted = false;
}

export function _setHlcForTesting(next) {
  nodeIdPersisted = false;
  current = {
    wallTime: Number.isFinite(next?.wallTime) ? next.wallTime : 0,
    counter: Number.isFinite(next?.counter) ? next.counter : 0,
    nodeId: typeof next?.nodeId === 'string' ? next.nodeId : null
  };
}
