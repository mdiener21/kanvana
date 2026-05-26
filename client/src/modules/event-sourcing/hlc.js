import { openStore, KV_STORE } from '../idb-store.js';

export const HLC_NODE_KEY = 'kanvana:hlc:node';
export const MAX_DRIFT_MS = 60_000;

let current = {
  wallTime: 0,
  counter: 0,
  nodeId: null
};

async function ensureNodeId() {
  const db = await openStore();
  const stored = await db.get(KV_STORE, HLC_NODE_KEY);
  if (typeof stored === 'string' && stored) {
    current.nodeId = stored;
    return stored;
  }

  if (current.nodeId) {
    await db.put(KV_STORE, current.nodeId, HLC_NODE_KEY);
    return current.nodeId;
  }

  const nodeId = crypto.randomUUID();
  await db.put(KV_STORE, nodeId, HLC_NODE_KEY);
  current.nodeId = nodeId;
  return nodeId;
}

export async function initHlc() {
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

export async function observeRemote(remoteHlc) {
  const nodeId = await ensureNodeId();
  const now = Date.now();
  const remoteWall = Number.isFinite(remoteHlc?.wallTime) ? remoteHlc.wallTime : 0;
  const remoteCounter = Number.isFinite(remoteHlc?.counter) ? remoteHlc.counter : 0;
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

export function _resetHlcForTesting() {
  current = { wallTime: 0, counter: 0, nodeId: null };
}

export function _setHlcForTesting(next) {
  current = {
    wallTime: Number.isFinite(next?.wallTime) ? next.wallTime : 0,
    counter: Number.isFinite(next?.counter) ? next.counter : 0,
    nodeId: typeof next?.nodeId === 'string' ? next.nodeId : null
  };
}
