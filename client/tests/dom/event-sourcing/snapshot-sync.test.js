// Snapshot upload to PocketBase (issue #112, AC-009/010/011).
// Real PocketBase client driven against MSW-intercepted HTTP. Mirrors the
// sync-queue harness: real timers, fake-indexeddb, MSW request capture.
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../mocks/server.js';
import { getPb } from '../../../src/modules/sync.js';
import { createProjectionState } from '../../../src/modules/reducer.js';
import { GLOBAL_SNAPSHOT_KEY } from '../../../src/modules/event-sourcing/snapshot.js';
import { uploadSnapshot, buildSnapshotForm } from '../../../src/modules/event-sourcing/snapshot-sync.js';

const SNAP_LIST = '*/api/collections/snapshots/records';
const SNAP_DELETE = '*/api/collections/snapshots/records/:id';
const EVT_LIST = '*/api/collections/events/records';
const EVT_DELETE = '*/api/collections/events/records/:id';

function setAuth(id = 'user1') {
  getPb().authStore.save('test-token', { id, email: 't@e.st' });
}

function hlc(counter, wallTime = 1000, nodeId = 'node-a') {
  return { wallTime, counter, nodeId };
}

function listResponse(items) {
  return HttpResponse.json({
    page: 1, perPage: 200, totalItems: items.length, totalPages: 1, items,
  });
}

const state = createProjectionState({ boards: [{ id: 'board-1', name: 'B' }] });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { getPb().authStore.clear(); });
afterEach(() => { server.resetHandlers(); getPb().authStore.clear(); });

describe('snapshot upload', () => {
  it('skips when unauthenticated', async () => {
    const res = await uploadSnapshot('board-1', state, hlc(10));
    expect(res.skipped).toBe('unauth');
  });

  it('AC-009: skips upload when server snapshot HLC >= local', async () => {
    let created = 0;
    server.use(
      http.get(SNAP_LIST, () => listResponse([
        { id: 'snap-srv', board_id: 'board-1', hlc: hlc(20) },
      ])),
      http.post(SNAP_LIST, () => { created += 1; return HttpResponse.json({ id: 'snap-new' }); }),
    );
    setAuth();
    const res = await uploadSnapshot('board-1', state, hlc(10));
    expect(res.skipped).toBe('covered');
    expect(created).toBe(0);
  });

  it('creates a snapshot record when the server is behind', async () => {
    let created = 0;
    server.use(
      http.get(SNAP_LIST, () => listResponse([{ id: 'snap-old', board_id: 'board-1', hlc: hlc(5) }])),
      http.get(EVT_LIST, () => listResponse([])),
      http.delete(SNAP_DELETE, () => HttpResponse.json({})),
      http.post(SNAP_LIST, () => { created += 1; return HttpResponse.json({ id: 'snap-new' }); }),
    );
    setAuth();
    const res = await uploadSnapshot('board-1', state, hlc(30));
    expect(res.uploaded).toBe('snap-new');
    expect(created).toBe(1);
  });

  it('buildSnapshotForm carries owner, board_id, hlc, and a gz payload file', () => {
    const form = buildSnapshotForm('user1', 'board-1', hlc(30), new Uint8Array([1, 2, 3]));
    expect(form.get('owner')).toBe('user1');
    expect(form.get('board_id')).toBe('board-1');
    expect(JSON.parse(form.get('hlc'))).toEqual(hlc(30));
    const payload = form.get('payload');
    expect(payload).toBeInstanceOf(File);
    expect(payload.name).toBe('snapshot.json.gz');
    expect(payload.size).toBe(3);
  });

  it('AC-009 arbitration: deletes losing server snapshots after upload', async () => {
    const deleted = [];
    server.use(
      http.get(SNAP_LIST, () => listResponse([
        { id: 'snap-lo', board_id: 'board-1', hlc: hlc(5) },
        { id: 'snap-eq-newer', board_id: 'board-1', hlc: hlc(30) }, // not a loser (== winner is local 40)
      ])),
      http.get(EVT_LIST, () => listResponse([])),
      http.post(SNAP_LIST, () => HttpResponse.json({ id: 'snap-new' })),
      http.delete(SNAP_DELETE, ({ params }) => { deleted.push(params.id); return HttpResponse.json({}); }),
    );
    setAuth();
    await uploadSnapshot('board-1', state, hlc(40));
    expect(deleted.sort()).toEqual(['snap-eq-newer', 'snap-lo']);
  });

  it('AC-010: deletes PB events with hlc <= snapshot.hlc, keeps newer', async () => {
    const deleted = [];
    server.use(
      http.get(SNAP_LIST, () => listResponse([])),
      http.get(EVT_LIST, () => listResponse([
        { id: 'e-old', hlc: hlc(5) },
        { id: 'e-eq', hlc: hlc(30) },
        { id: 'e-new', hlc: hlc(31) },
      ])),
      http.post(SNAP_LIST, () => HttpResponse.json({ id: 'snap-new' })),
      http.delete(EVT_DELETE, ({ params }) => { deleted.push(params.id); return HttpResponse.json({}); }),
    );
    setAuth();
    await uploadSnapshot('board-1', state, hlc(30));
    expect(deleted.sort()).toEqual(['e-eq', 'e-old']);
  });

  it('global snapshot filters events by scope=global and uses empty board_id', async () => {
    let snapFilter = null;
    let evtFilter = null;
    server.use(
      http.get(SNAP_LIST, ({ request }) => { snapFilter = new URL(request.url).searchParams.get('filter'); return listResponse([]); }),
      http.get(EVT_LIST, ({ request }) => { evtFilter = new URL(request.url).searchParams.get('filter'); return listResponse([]); }),
      http.post(SNAP_LIST, () => HttpResponse.json({ id: 'snap-g' })),
    );
    setAuth();
    const res = await uploadSnapshot(GLOBAL_SNAPSHOT_KEY, state, hlc(7));
    expect(res.uploaded).toBe('snap-g');
    expect(snapFilter).toContain('board_id = ""');
    expect(evtFilter).toContain('scope = "global"');
  });
});
