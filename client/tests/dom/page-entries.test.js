// #218 AC-002 / AC-005: every page entry boots through the shared page boot,
// and none wires the queue, realtime or snapshot upload itself.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/dom';

const boot = vi.hoisted(() => ({
  bootPage: vi.fn(async () => {}),
  initSyncQueue: vi.fn(),
  initRealtime: vi.fn(),
  initSnapshotSync: vi.fn(),
}));

vi.mock('../../src/modules/page-boot.js', () => ({ bootPage: boot.bootPage }));
vi.mock('../../src/modules/event-sourcing/sync-queue.js', async (importOriginal) => ({
  ...(await importOriginal()), initSyncQueue: boot.initSyncQueue,
}));
vi.mock('../../src/modules/event-sourcing/realtime.js', async (importOriginal) => ({
  ...(await importOriginal()), initRealtime: boot.initRealtime,
}));
vi.mock('../../src/modules/event-sourcing/snapshot-sync.js', async (importOriginal) => ({
  ...(await importOriginal()), initSnapshotSync: boot.initSnapshotSync,
}));

// jsdom has no canvas; the reports page only needs to get as far as its boot.
vi.mock('echarts/core', () => ({ use: () => {}, init: () => ({ setOption: () => {}, resize: () => {} }) }));

function mountPage(html) {
  const source = readFileSync(resolve(__dirname, '../../src', html), 'utf8');
  document.body.innerHTML = source.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
}

const PAGES = [
  { html: 'index.html', entry: '../../src/kanban.js', args: [{ mountAuthUi: true }], onLoad: () => document.dispatchEvent(new Event('DOMContentLoaded')) },
  { html: 'timetracking.html', entry: '../../src/modules/timetracking.js', args: [] },
  { html: 'calendar.html', entry: '../../src/modules/calendar.js', args: [] },
  { html: 'reports.html', entry: '../../src/modules/reports.js', args: [] },
];

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('page entries (#218)', () => {
  it.each(PAGES)('$html boots through the shared page boot', async ({ html, entry, args, onLoad }) => {
    mountPage(html);
    await import(entry);
    onLoad?.();

    await waitFor(() => expect(boot.bootPage).toHaveBeenCalledTimes(1));
    expect(boot.bootPage).toHaveBeenCalledWith(...args);
    expect(boot.initSyncQueue).not.toHaveBeenCalled();
    expect(boot.initRealtime).not.toHaveBeenCalled();
    expect(boot.initSnapshotSync).not.toHaveBeenCalled();
  }, 20000); // each entry is a cold import of the whole page graph
});
