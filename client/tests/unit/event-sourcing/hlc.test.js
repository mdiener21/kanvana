import { beforeEach, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import { compareHlc, laterHlc, emitLocal, observeRemote, MAX_DRIFT_MS, _resetHlcForTesting, _setHlcForTesting } from '../../../src/modules/event-sourcing/hlc.js';

const DB_NAME = 'kanvana-db';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(async () => {
  vi.restoreAllMocks();
  resetLocalStorage();
  _resetHlcForTesting();
  await deleteDB(DB_NAME);
});

test('emitLocal creates a stable HLC node id that persists across sessions', async () => {
  const first = await emitLocal();
  expect(first.nodeId).toMatch(UUID_RE);

  _resetHlcForTesting();

  const second = await emitLocal();
  expect(second.nodeId).toBe(first.nodeId);
});

test('emitLocal advances wallTime and resets counter when physical time moves forward', async () => {
  _setHlcForTesting({ wallTime: 1000, counter: 7, nodeId: 'node-a' });
  vi.spyOn(Date, 'now').mockReturnValue(1001);

  await expect(emitLocal()).resolves.toEqual({
    wallTime: 1001,
    counter: 0,
    nodeId: 'node-a'
  });
});

test('emitLocal increments counter when physical time does not advance', async () => {
  _setHlcForTesting({ wallTime: 1000, counter: 7, nodeId: 'node-a' });
  vi.spyOn(Date, 'now').mockReturnValue(999);

  await expect(emitLocal()).resolves.toEqual({
    wallTime: 1000,
    counter: 8,
    nodeId: 'node-a'
  });
});

test('compareHlc orders equal wallTime and counter by nodeId', () => {
  const left = { wallTime: 1000, counter: 0, nodeId: 'node-a' };
  const right = { wallTime: 1000, counter: 0, nodeId: 'node-b' };

  expect(compareHlc(left, right)).toBeLessThan(0);
  expect(compareHlc(right, left)).toBeGreaterThan(0);
});

test('compareHlc remains transitive across wallTime counter and nodeId', () => {
  const ordered = [
    { wallTime: 1000, counter: 0, nodeId: 'node-a' },
    { wallTime: 1000, counter: 0, nodeId: 'node-b' },
    { wallTime: 1000, counter: 1, nodeId: 'node-a' },
    { wallTime: 1001, counter: 0, nodeId: 'node-a' }
  ];

  for (let i = 0; i < ordered.length - 1; i += 1) {
    expect(compareHlc(ordered[i], ordered[i + 1])).toBeLessThan(0);
  }
  expect([...ordered].sort(compareHlc)).toEqual(ordered);
});

test('emitLocal warns when local wall clock drift exceeds the bound', async () => {
  _setHlcForTesting({ wallTime: 1000, counter: 0, nodeId: 'node-a' });
  vi.spyOn(Date, 'now').mockReturnValue(61_001);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  await emitLocal();

  expect(warn).toHaveBeenCalledWith('[Kanvana] HLC drift exceeded 60000ms; accepting local wall time.');
});

test('observeRemote advances counter from the remote HLC when remote wallTime wins', async () => {
  _setHlcForTesting({ wallTime: 1000, counter: 2, nodeId: 'node-a' });
  vi.spyOn(Date, 'now').mockReturnValue(1005);

  await expect(observeRemote({ wallTime: 1010, counter: 4, nodeId: 'node-b' })).resolves.toEqual({
    wallTime: 1010,
    counter: 5,
    nodeId: 'node-a'
  });
});

test('observeRemote does not advance the local clock beyond the drift limit (#181)', async () => {
  _setHlcForTesting({ wallTime: 1000, counter: 0, nodeId: 'node-a' });
  vi.spyOn(Date, 'now').mockReturnValue(1005);
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  const observed = await observeRemote({ wallTime: 1005 + 10 * MAX_DRIFT_MS, counter: 7, nodeId: 'node-b' });

  expect(observed.wallTime).toBe(1005 + MAX_DRIFT_MS);
  expect((await emitLocal()).wallTime).toBeLessThanOrEqual(1005 + MAX_DRIFT_MS);
});

test('observeRemote still adopts a remote clock ahead by less than the drift limit', async () => {
  _setHlcForTesting({ wallTime: 1000, counter: 0, nodeId: 'node-a' });
  vi.spyOn(Date, 'now').mockReturnValue(1005);

  await expect(observeRemote({ wallTime: 1005 + MAX_DRIFT_MS, counter: 3, nodeId: 'node-b' }))
    .resolves.toEqual({ wallTime: 1005 + MAX_DRIFT_MS, counter: 4, nodeId: 'node-a' });
});

test('laterHlc picks the later stamp and ignores a missing one', () => {
  const a = { wallTime: 1000, counter: 0, nodeId: 'node-a' };
  const b = { wallTime: 1000, counter: 1, nodeId: 'node-a' };
  expect(laterHlc(a, b)).toBe(b);
  expect(laterHlc(b, a)).toBe(b);
  expect(laterHlc(null, a)).toBe(a);
  expect(laterHlc(a, undefined)).toBe(a);
  expect([a, null, b].reduce(laterHlc, null)).toBe(b);
  expect(laterHlc(null, null)).toBeNull();
});
