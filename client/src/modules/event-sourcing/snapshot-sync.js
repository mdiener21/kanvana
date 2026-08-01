// Snapshot upload + PB-side GC (issue #112, PRD §4.6/§5.4).
// Pushes a locally-saved snapshot to PocketBase: pre-flight HLC check (skip if
// the server is already at an equal-or-higher snapshot), gzipped-JSON upload to
// the `snapshots` file field, post-upload arbitration sweep (delete losing
// snapshots per board), then server-side event GC (delete events covered by the
// snapshot HLC). Race-on-write: highest HLC wins, losers discarded (PRD #23).

import { getPb, isAuthenticated, getUser } from '../sync.js';
import { compareHlc } from './hlc.js';
import { serializeState, GLOBAL_SNAPSHOT_KEY, setAfterSnapshotSaved } from './snapshot.js';
import { createProjectionState } from '../reducer.js';

function boardIdFor(key) {
  return key === GLOBAL_SNAPSHOT_KEY ? '' : key;
}

function snapshotFilter(ownerId, boardId) {
  return `owner = "${ownerId}" && board_id = "${boardId}"`;
}

function eventFilter(ownerId, key) {
  return key === GLOBAL_SNAPSHOT_KEY
    ? `owner = "${ownerId}" && scope = "global"`
    : `owner = "${ownerId}" && board = "${key}"`;
}

export function buildSnapshotForm(ownerId, boardId, hlc, payloadBytes) {
  const form = new FormData();
  form.set('owner', ownerId);
  form.set('board_id', boardId);
  form.set('hlc', JSON.stringify(hlc));
  form.set('payload', new File([payloadBytes], 'snapshot.json.gz', { type: 'application/gzip' }));
  return form;
}

async function gunzipJson(buffer) {
  try {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(buffer));
    writer.close();
    return JSON.parse(await new Response(ds.readable).text());
  } catch {
    return null; // corrupt or truncated snapshot — fall back to event replay
  }
}

async function gzipJson(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export async function uploadSnapshot(key, state, hlc) {
  if (!isAuthenticated()) return { skipped: 'unauth' };

  const pb = getPb();
  const ownerId = getUser()?.id;
  const boardId = boardIdFor(key);

  const existing = await pb.collection('snapshots').getFullList({
    filter: snapshotFilter(ownerId, boardId),
    requestKey: null,
  });

  // Pre-flight (AC-009): skip if the server already covers this HLC.
  const covered = existing.some(s => s.hlc && compareHlc(s.hlc, hlc) >= 0);
  if (covered) return { skipped: 'covered' };

  const payload = await gzipJson(serializeState(state));
  const form = buildSnapshotForm(ownerId, boardId, hlc, payload);
  const created = await pb.collection('snapshots').create(form, { requestKey: null });

  // Arbitration (AC-009): drop every prior snapshot for this board — local HLC
  // is the new winner (none were >= it, checked above).
  for (const s of existing) {
    await pb.collection('snapshots').delete(s.id, { requestKey: null });
  }

  // Server-side GC (AC-010): delete events covered by the snapshot HLC.
  await gcServerEvents(pb, ownerId, key, hlc);

  return { uploaded: created.id };
}

async function gcServerEvents(pb, ownerId, key, snapshotHlc) {
  const events = await pb.collection('events').getFullList({
    filter: eventFilter(ownerId, key),
    requestKey: null,
  });
  for (const e of events) {
    if (e.hlc && compareHlc(e.hlc, snapshotHlc) <= 0) {
      await pb.collection('events').delete(e.id, { requestKey: null });
    }
  }
}

// Newest snapshot the server holds for a scope, or null. The counterpart to
// uploadSnapshot: without this, a snapshot's event GC is one-way data loss for
// any device that had not already replayed the events it deleted.
export async function downloadSnapshot(key) {
  if (!isAuthenticated()) return null;

  const pb = getPb();
  const ownerId = getUser()?.id;
  const records = await pb.collection('snapshots').getFullList({
    filter: snapshotFilter(ownerId, boardIdFor(key)),
    requestKey: null,
  });

  const winner = records
    .filter(r => r.hlc)
    .sort((a, b) => compareHlc(a.hlc, b.hlc))
    .pop();
  return inflate(pb, winner);
}

// Every scope the server holds a snapshot for, newest per board. Catch-up needs
// the enumeration because a joining device doesn't yet know the board ids.
export async function downloadAllSnapshots() {
  if (!isAuthenticated()) return [];

  const pb = getPb();
  const ownerId = getUser()?.id;
  const records = await pb.collection('snapshots').getFullList({
    filter: `owner = "${ownerId}"`,
    requestKey: null,
  });

  const winners = new Map();
  for (const record of records) {
    if (!record.hlc) continue;
    const key = record.board_id || GLOBAL_SNAPSHOT_KEY;
    const current = winners.get(key);
    if (!current || compareHlc(record.hlc, current.hlc) > 0) winners.set(key, record);
  }

  const out = [];
  for (const [key, record] of winners) {
    const snapshot = await inflate(pb, record);
    if (snapshot) out.push({ key, ...snapshot });
  }
  return out;
}

async function inflate(pb, record) {
  if (!record || !record.payload) return null;

  const response = await fetch(pb.files.getURL(record, record.payload));
  if (!response.ok) return null;
  const body = await gunzipJson(await response.arrayBuffer());
  if (!body) return null;

  return { hlc: record.hlc, state: createProjectionState({
    ...body,
    appliedEventIds: new Set(Array.isArray(body.appliedEventIds) ? body.appliedEventIds : []),
    taskTombstones: new Set(Array.isArray(body.taskTombstones) ? body.taskTombstones : [])
  }) };
}

export function initSnapshotSync() {
  setAfterSnapshotSaved(uploadSnapshot);
}
