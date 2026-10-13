// #179: PocketBase refuses to delete an event younger than the grace window,
// whatever client asks (older clients clean up without the window). The hook
// runs in PB's JSVM; here it runs against stubs of the two globals it uses.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { GRACE_WINDOW_MS } from '../../src/modules/event-sourcing/snapshot.js';

const hookPath = resolve(import.meta.dirname, '../../../backend/pb_hooks/events_grace_window.pb.js');

class BadRequestError extends Error {}

function loadHook() {
  const registrations = [];
  const onRecordDeleteRequest = (handler, ...collections) => registrations.push({ handler, collections });
  new Function('onRecordDeleteRequest', 'BadRequestError', readFileSync(hookPath, 'utf8'))(onRecordDeleteRequest, BadRequestError);
  return registrations;
}

function deleteRequest(hlc) {
  return {
    record: { getString: (field) => (field === 'hlc' ? JSON.stringify(hlc) : '') },
    next: vi.fn()
  };
}

describe('events grace-window hook', () => {
  test('guards delete requests on the events collection only', () => {
    expect(loadHook().map((r) => r.collections)).toEqual([['events']]);
  });

  test('refuses to delete an event younger than the grace window', () => {
    const [{ handler }] = loadHook();
    const e = deleteRequest({ wallTime: Date.now() - GRACE_WINDOW_MS + 60_000, counter: 0, nodeId: 'n' });

    expect(() => handler(e)).toThrow(BadRequestError);
    expect(e.next).not.toHaveBeenCalled();
  });

  test('lets an event older than the grace window be deleted', () => {
    const [{ handler }] = loadHook();
    const e = deleteRequest({ wallTime: Date.now() - GRACE_WINDOW_MS - 60_000, counter: 0, nodeId: 'n' });

    handler(e);

    expect(e.next).toHaveBeenCalledOnce();
  });

  test('lets an event without a readable HLC be deleted', () => {
    const [{ handler }] = loadHook();
    const e = { record: { getString: () => '' }, next: vi.fn() };

    handler(e);

    expect(e.next).toHaveBeenCalledOnce();
  });
});
