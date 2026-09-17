import { expect, test } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { createBoard, createColumn, createLabel, createTask } from '../../src/modules/schema.js';
import {
  MOVES_PER_REPETITION,
  PERFORMANCE_CALIBRATION,
  PERFORMANCE_REPETITIONS,
  PERFORMANCE_SCENARIOS,
} from './performance-budgets.js';

const FIXED_AT = '2026-01-15T12:00:00.000Z';
const BACKFILL_FLAG_KEY = 'kanvana:migrations:eventBackfill:v1';
const FULL_RENDER_MARK = 'kanvana:board-render:full';
const RECONCILE_RENDER_MARK = 'kanvana:board-render:reconcile';

function deterministicUuid(namespace, index) {
  return `${namespace.toString(16).padStart(8, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function createSyntheticBoard(taskCount, view) {
  const boardId = deterministicUuid(0x137, taskCount + (view === 'swimlane' ? 1 : 0));
  const columns = [
    createColumn({ id: deterministicUuid(0xc01, 1), name: 'To Do', color: '#3583ff', order: 1 }),
    createColumn({ id: deterministicUuid(0xc01, 2), name: 'In Progress', color: '#f59e0b', order: 2 }),
    createColumn({ id: deterministicUuid(0xc01, 3), name: 'Done', color: '#505050', order: 3, role: 'done' }),
  ];
  const labels = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name, index) => createLabel({
    id: deterministicUuid(0x1abe1, index + 1),
    name,
    color: ['#2563eb', '#16a34a', '#9333ea', '#ea580c'][index],
    group: 'Performance lane',
  }));
  const doneCount = Math.floor(taskCount * 0.6);
  const inProgressCount = Math.floor(taskCount * 0.3);
  const tasks = Array.from({ length: taskCount }, (_, index) => {
    const lane = labels[index % labels.length];
    const column = index < doneCount
      ? columns[2]
      : index < doneCount + inProgressCount ? columns[1] : columns[0];
    return createTask({
      id: deterministicUuid(0x7a5, index + 1),
      title: `Synthetic task ${String(index + 1).padStart(4, '0')}`,
      description: `Deterministic performance fixture item ${index + 1}`,
      priority: ['low', 'medium', 'high', 'urgent'][index % 4],
      dueDate: '',
      column: column.id,
      order: index + 1,
      labels: [lane.id],
      creationDate: FIXED_AT,
      changeDate: FIXED_AT,
      ...(column.role === 'done' ? { doneDate: FIXED_AT } : {}),
      columnHistory: [{ column: column.id, at: FIXED_AT }],
      relationships: [],
      subTasks: [],
      swimlaneLabelId: lane.id,
      deleted: false,
    });
  });

  return {
    board: createBoard({ id: boardId, name: `Synthetic ${taskCount} ${view}`, createdAt: FIXED_AT }),
    columns,
    labels,
    tasks,
    settings: {
      showPriority: true,
      showDueDate: false,
      showAge: false,
      showChangeDate: false,
      locale: 'en-US',
      defaultPriority: 'none',
      notificationDays: 3,
      countdownUrgentThreshold: 3,
      countdownWarningThreshold: 10,
      swimLanesEnabled: view === 'swimlane',
      swimLaneGroupBy: 'label',
      swimLaneLabelGroup: '',
      swimLaneCollapsedKeys: [],
      swimLaneCellCollapsedKeys: [],
      swimLaneOrder: labels.map((label) => label.id),
    },
  };
}

// Writes the read model straight to IndexedDB and pre-sets the event-backfill flag,
// so startup measures the returning-user path initStorage() actually takes: hydrate
// from read_model, no event replay. The returned time is the harness's own seeding
// cost, not any production code path.
async function seedSyntheticBoard(page, fixture) {
  // impressum.html is the one built page that never boots the board app, so the
  // fixture can own kanvana-db outright instead of racing initStorage() for it.
  await page.goto('/impressum.html', { waitUntil: 'domcontentloaded' });
  return page.evaluate(async ({ data, backfillFlagKey }) => {
    const startedAt = performance.now();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('kanvana-db');
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    });

    await new Promise((resolve, reject) => {
      const request = indexedDB.open('kanvana-db', 2);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        const kv = db.createObjectStore('kv');
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('hlc', ['hlc.wallTime', 'hlc.counter', 'hlc.nodeId']);
        events.createIndex('synced', 'synced');
        db.createObjectStore('snapshots');
        db.createObjectStore('read_model');
        kv.put([data.board], 'kanbanBoards');
        kv.put(data.board.id, 'kanbanActiveBoardId');
        kv.put(data.settings, `kanbanBoard:${data.board.id}:settings`);
        kv.put({ at: data.board.createdAt, emitted: data.tasks.length + data.columns.length + data.labels.length + 2, synthetic: true }, backfillFlagKey);
        const readModel = request.transaction.objectStore('read_model');
        readModel.put(data.columns, `${data.board.id}:columns`);
        readModel.put(data.tasks, `${data.board.id}:tasks`);
        readModel.put(data.labels, `${data.board.id}:labels`);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
    return performance.now() - startedAt;
  }, { data: fixture, backfillFlagKey: BACKFILL_FLAG_KEY });
}

function renderCount(entries) {
  return entries.full + entries.reconcile;
}

async function readRenderCounts(page) {
  return page.evaluate(({ full, reconcile }) => ({
    full: performance.getEntriesByName(full).length,
    reconcile: performance.getEntriesByName(reconcile).length,
  }), { full: FULL_RENDER_MARK, reconcile: RECONCILE_RENDER_MARK });
}

async function dragWithPointer(page, source, destination) {
  await source.scrollIntoViewIfNeeded();
  await destination.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(destinationBox).not.toBeNull();

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + Math.min(sourceBox.height / 2, 24);
  const endX = destinationBox.x + destinationBox.width / 2;
  const endY = destinationBox.y + Math.min(12, Math.max(4, destinationBox.height / 2));

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 6, startY + 2);
  await page.waitForTimeout(50);
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.waitForTimeout(30);
  const droppedAt = await page.evaluate(() => performance.now());
  await page.mouse.up();
  return droppedAt;
}

// Wall-clock around the whole gesture would be mostly Playwright: CDP round trips,
// the settle timeouts above, and expect() poll granularity. Timing the drop in-page,
// from pointer-up to the last render it triggers, leaves only the app's own work.
async function renderLatencySince(page, droppedAt) {
  return page.evaluate(({ full, reconcile, since }) => {
    const marks = [...performance.getEntriesByName(full), ...performance.getEntriesByName(reconcile)]
      .map((mark) => mark.startTime)
      .filter((startTime) => startTime >= since);
    return marks.length === 0 ? -1 : Math.max(...marks) - since;
  }, { full: FULL_RENDER_MARK, reconcile: RECONCILE_RENDER_MARK, since: droppedAt });
}

async function performMeasuredMoves(page, fixture, view) {
  const todoId = fixture.columns[0].id;
  const inProgressId = fixture.columns[1].id;
  const doneId = fixture.columns[2].id;
  const laneId = fixture.labels[0].id;
  const latencies = [];
  const beforeRenders = await readRenderCounts(page);

  for (let index = 0; index < MOVES_PER_REPETITION; index += 1) {
    let source;
    let destination;
    let sourceCounter;
    let destinationCounter;

    if (view === 'swimlane') {
      source = page.locator(`.swimlane-cell[data-column="${todoId}"][data-lane-key="${laneId}"] .task`).first();
      destination = page.locator(`.swimlane-cell[data-column="${inProgressId}"][data-lane-key="${laneId}"] .task`).first();
      sourceCounter = page.locator(`.swimlane-column-header[data-column="${todoId}"] .task-counter`);
      destinationCounter = page.locator(`.swimlane-column-header[data-column="${inProgressId}"] .task-counter`);
    } else {
      source = page.locator(`.task-column[data-column="${inProgressId}"] .task`).first();
      destination = page.locator(`.task-column[data-column="${doneId}"] .tasks`);
      sourceCounter = page.locator(`.task-column[data-column="${inProgressId}"] .task-counter`);
      destinationCounter = page.locator(`.task-column[data-column="${doneId}"] .task-counter`);
    }

    await expect(source).toBeVisible();
    const sourceBefore = Number(await sourceCounter.textContent());
    const destinationBefore = Number(await destinationCounter.textContent());
    const droppedAt = await dragWithPointer(page, source, destination);
    await expect(sourceCounter).toHaveText(String(sourceBefore - 1), { timeout: 10_000 });
    await expect(destinationCounter).toHaveText(String(destinationBefore + 1), { timeout: 10_000 });
    const latency = await renderLatencySince(page, droppedAt);
    expect(latency, 'drop landed without a board render').toBeGreaterThanOrEqual(0);
    latencies.push(latency);
  }

  const afterRenders = await readRenderCounts(page);
  return {
    latencies,
    boardRenders: renderCount(afterRenders) - renderCount(beforeRenders),
  };
}

async function collectMemoryMetrics(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(50);
  const counters = await cdp.send('Memory.getDOMCounters');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const heap = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  const live = await page.evaluate(() => {
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
    let nodes = 1;
    while (walker.nextNode()) {
      nodes += 1;
    }
    return { liveTaskCards: document.querySelectorAll('.task').length, liveDomNodes: nodes };
  });
  return {
    liveTaskCards: live.liveTaskCards,
    liveDomNodes: live.liveDomNodes,
    // Everything the post-GC renderer still counts beyond the walked main document:
    // detached subtrees awaiting collection, but also UA shadow trees and engine
    // internals. Reproducible run to run, so it is a tripwire on growth rather than
    // an absolute leak count.
    detachedDomNodes: Math.max(0, counters.nodes - live.liveDomNodes),
    retainedDomNodes: counters.nodes,
    jsHeapUsedMb: heap / (1024 * 1024),
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarize(samples) {
  return {
    fixtureSeedMs: median(samples.map((sample) => sample.fixtureSeedMs)),
    startupMs: median(samples.map((sample) => sample.startupMs)),
    taskDropLatencyMs: median(samples.flatMap((sample) => sample.taskDropLatencies)),
    jsHeapUsedMb: median(samples.map((sample) => sample.jsHeapUsedMb)),
    retainedDomNodes: median(samples.map((sample) => sample.retainedDomNodes)),
    liveDomNodes: median(samples.map((sample) => sample.liveDomNodes)),
    detachedDomNodes: Math.max(...samples.map((sample) => sample.detachedDomNodes)),
    liveTaskCards: Math.max(...samples.map((sample) => sample.liveTaskCards)),
    startupBoardRenders: Math.max(...samples.map((sample) => sample.startupBoardRenders)),
    steadyStateBoardRenders: Math.max(...samples.map((sample) => sample.steadyStateBoardRenders)),
    browserCrashEvents: samples.reduce((total, sample) => total + sample.browserCrashEvents, 0),
  };
}

function crashedSample(browserCrashEvents) {
  return {
    fixtureSeedMs: 0,
    startupMs: 0,
    taskDropLatencies: [0],
    jsHeapUsedMb: 0,
    retainedDomNodes: 0,
    liveDomNodes: 0,
    detachedDomNodes: 0,
    liveTaskCards: 0,
    startupBoardRenders: 0,
    steadyStateBoardRenders: 0,
    browserCrashEvents,
  };
}

function rounded(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(2))]));
}

for (const scenario of PERFORMANCE_SCENARIOS) {
  test(`${scenario.taskCount} tasks in ${scenario.view} view stay within performance budgets`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000 * PERFORMANCE_REPETITIONS);
    const fixture = createSyntheticBoard(scenario.taskCount, scenario.view);
    const samples = [];

    for (let repetition = 0; repetition < PERFORMANCE_REPETITIONS; repetition += 1) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      let browserCrashEvents = 0;
      try {
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        page.on('crash', () => { browserCrashEvents += 1; });

        const fixtureSeedMs = await seedSyntheticBoard(page, fixture);
        await page.addInitScript(() => {
          globalThis.__kanvanaPerfMarks = true;
          globalThis.__kanvanaStartupStartedAt = performance.now();
        });

        await page.goto('/');
        // 40% of the fixture sits outside Done; standard view adds the 50 Done cards
        // rendered before the "Show more" cut-off, swimlane view hides Done entirely.
        const expectedLiveCards = scenario.view === 'standard'
          ? Math.floor(scenario.taskCount * 0.4) + 50
          : Math.floor(scenario.taskCount * 0.4);
        await expect(page.locator('.task')).toHaveCount(expectedLiveCards, { timeout: 30_000 });
        await expect.poll(async () => renderCount(await readRenderCounts(page))).toBeGreaterThan(0);
        const startupMs = await page.evaluate(() => performance.now() - globalThis.__kanvanaStartupStartedAt);
        const startupBoardRenders = renderCount(await readRenderCounts(page));
        const moveMetrics = await performMeasuredMoves(page, fixture, scenario.view);
        const memoryMetrics = await collectMemoryMetrics(page, cdp);

        samples.push({
          fixtureSeedMs,
          startupMs,
          taskDropLatencies: moveMetrics.latencies,
          startupBoardRenders,
          steadyStateBoardRenders: moveMetrics.boardRenders,
          browserCrashEvents,
          ...memoryMetrics,
        });
      } catch (error) {
        // A crash kills the page, so every later call in the repetition throws before
        // the crash count can be reported. Keep the sample so the budget fails on the
        // crash itself rather than on whichever call happened to throw first.
        if (browserCrashEvents === 0) throw error;
        samples.push(crashedSample(browserCrashEvents));
        break;
      } finally {
        await context.close();
      }
    }

    const metrics = summarize(samples);
    const result = {
      scenario: { taskCount: scenario.taskCount, view: scenario.view },
      repetitions: PERFORMANCE_REPETITIONS,
      movesPerRepetition: MOVES_PER_REPETITION,
      metrics: rounded(metrics),
      baseline: scenario.baseline,
      budget: scenario.budget,
    };
    console.log(`KANVANA_PERFORMANCE ${JSON.stringify(result)}`);
    await testInfo.attach('performance-result', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });

    if (!PERFORMANCE_CALIBRATION) {
      for (const [metric, limit] of Object.entries(scenario.budget)) {
        expect(metrics[metric], `${metric} exceeded its ${scenario.taskCount}/${scenario.view} budget`).toBeLessThanOrEqual(limit);
      }
    }
  });
}
