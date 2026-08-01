// Snapshot download — the inbound half of client snapshots.
//
// uploadSnapshot() GCs the server's events once a snapshot covers them, but
// nothing ever read a snapshot back. A device joining after that GC pulled an
// event log with the board's history already deleted and reconstructed nothing.
// Same harness as snapshot-sync.test.js: real PB client over MSW.
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../mocks/server.js';
import { getPb } from '../../../src/modules/sync.js';
import { GLOBAL_SNAPSHOT_KEY } from '../../../src/modules/event-sourcing/snapshot.js';
import { downloadSnapshot } from '../../../src/modules/event-sourcing/snapshot-sync.js';

const SNAP_LIST = '*/api/collections/snapshots/records';
const SNAP_FILE = '*/api/files/:collection/:record/:filename';

// Hand-written snapshot body — an independent source of truth, not a round-trip
// through serializeState().
const SNAPSHOT_BODY = {
  boards: [{ id: 'board-1', name: 'GOMOGI' }],
  tasks: [{ id: 'task-1', title: 'TU Invoice number for bill', column: 'todo' }],
  columns: [{ id: 'todo', name: 'To Do' }],
  labels: [{ id: 'label-1', name: 'urgent' }],
  settings: { swimlaneGroupBy: 'label' },
  globalSettings: {},
  appliedEventIds: ['evt-1'],
  taskTombstones: ['task-gone'],
};

async function gzip(obj) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(JSON.stringify(obj)));
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function snapRecord(id, hlcValue) {
  return {
    id,
    collectionId: 'kanvana_snapshots',
    collectionName: 'snapshots',
    board_id: 'board-1',
    hlc: hlcValue,
    payload: 'snapshot.json.gz',
  };
}

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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { getPb().authStore.clear(); });
afterEach(() => { server.resetHandlers(); getPb().authStore.clear(); });

describe('snapshot download', () => {
  it('returns null when the server holds no snapshot for the board', async () => {
    server.use(http.get(SNAP_LIST, () => listResponse([])));
    setAuth();

    expect(await downloadSnapshot('board-1')).toBeNull();
  });

  it('returns null when unauthenticated', async () => {
    expect(await downloadSnapshot('board-1')).toBeNull();
  });

  it('queries the board it was asked for, and empty board_id for global scope', async () => {
    const filters = [];
    server.use(http.get(SNAP_LIST, ({ request }) => {
      filters.push(new URL(request.url).searchParams.get('filter'));
      return listResponse([]);
    }));
    setAuth();

    await downloadSnapshot('board-1');
    await downloadSnapshot(GLOBAL_SNAPSHOT_KEY);

    expect(filters[0]).toContain('board_id = "board-1"');
    expect(filters[1]).toContain('board_id = ""');
  });

  it('inflates the payload into projected state', async () => {
    const bytes = await gzip(SNAPSHOT_BODY);
    server.use(
      http.get(SNAP_LIST, () => listResponse([snapRecord('snap-1', hlc(30))])),
      http.get(SNAP_FILE, () => new HttpResponse(bytes)),
    );
    setAuth();

    const result = await downloadSnapshot('board-1');

    expect(result.hlc).toEqual(hlc(30));
    expect(result.state.boards.map((b) => b.name)).toEqual(['GOMOGI']);
    expect(result.state.tasks.map((t) => t.title)).toEqual(['TU Invoice number for bill']);
    expect(result.state.columns.map((c) => c.id)).toEqual(['todo']);
    expect(result.state.settings).toEqual({ swimlaneGroupBy: 'label' });
  });

  it('rehydrates appliedEventIds and taskTombstones as Sets so replay dedups', async () => {
    const bytes = await gzip(SNAPSHOT_BODY);
    server.use(
      http.get(SNAP_LIST, () => listResponse([snapRecord('snap-1', hlc(30))])),
      http.get(SNAP_FILE, () => new HttpResponse(bytes)),
    );
    setAuth();

    const { state } = await downloadSnapshot('board-1');

    expect(state.appliedEventIds).toBeInstanceOf(Set);
    expect(state.appliedEventIds.has('evt-1')).toBe(true);
    expect(state.taskTombstones).toBeInstanceOf(Set);
    expect(state.taskTombstones.has('task-gone')).toBe(true);
  });

  it('picks the highest HLC when the server holds several snapshots', async () => {
    const bytes = await gzip(SNAPSHOT_BODY);
    const requested = [];
    server.use(
      http.get(SNAP_LIST, () => listResponse([
        snapRecord('snap-lo', hlc(5)),
        snapRecord('snap-hi', hlc(40)),
        snapRecord('snap-mid', hlc(12)),
      ])),
      http.get(SNAP_FILE, ({ params }) => { requested.push(params.record); return new HttpResponse(bytes); }),
    );
    setAuth();

    const result = await downloadSnapshot('board-1');

    expect(result.hlc).toEqual(hlc(40));
    expect(requested).toEqual(['snap-hi']);
  });
});
