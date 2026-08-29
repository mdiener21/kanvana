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

async function seedSyntheticBoard(page, fixture) {
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
  await page.mouse.up();
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
    const startedAt = performance.now();
    await dragWithPointer(page, source, destination);
    await expect(sourceCounter).toHaveText(String(sourceBefore - 1), { timeout: 10_000 });
    await expect(destinationCounter).toHaveText(String(destinationBefore + 1), { timeout: 10_000 });
    latencies.push(performance.now() - startedAt);
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
    // Blink still counts a detached subtree until it is collected, so anything the
    // post-GC renderer total holds beyond the walked document is a retained leak.
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
    fixtureBackfillMs: median(samples.map((sample) => sample.fixtureBackfillMs)),
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
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      let browserCrashEvents = 0;
      page.on('crash', () => { browserCrashEvents += 1; });

      const fixtureBackfillMs = await seedSyntheticBoard(page, fixture);
      await page.addInitScript(({ full, reconcile }) => {
        globalThis.__kanvanaStartupStartedAt = performance.now();
        performance.clearMarks(full);
        performance.clearMarks(reconcile);
      }, { full: FULL_RENDER_MARK, reconcile: RECONCILE_RENDER_MARK });

      await page.goto('/');
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
        fixtureBackfillMs,
        startupMs,
        taskDropLatencies: moveMetrics.latencies,
        startupBoardRenders,
        steadyStateBoardRenders: moveMetrics.boardRenders,
        browserCrashEvents,
        ...memoryMetrics,
      });
      await context.close();
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
