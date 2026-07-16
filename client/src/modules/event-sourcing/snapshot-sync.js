// Snapshot upload + PB-side GC (issue #112, PRD §4.6/§5.4).
// Pushes a locally-saved snapshot to PocketBase: pre-flight HLC check (skip if
// the server is already at an equal-or-higher snapshot), gzipped-JSON upload to
// the `snapshots` file field, post-upload arbitration sweep (delete losing
// snapshots per board), then server-side event GC (delete events covered by the
// snapshot HLC). Race-on-write: highest HLC wins, losers discarded (PRD #23).

import { getPb, isAuthenticated, getUser } from '../sync.js';
import { compareHlc } from './hlc.js';
import { serializeState, GLOBAL_SNAPSHOT_KEY, setAfterSnapshotSaved } from './snapshot.js';

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

export function initSnapshotSync() {
  setAfterSnapshotSaved(uploadSnapshot);
}
