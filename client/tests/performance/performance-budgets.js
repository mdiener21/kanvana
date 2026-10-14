function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// A non-numeric override must not silently reduce the suite to zero repetitions,
// which would make every budget pass vacuously.
export const PERFORMANCE_REPETITIONS = positiveInteger(process.env.KANVANA_PERF_RUNS, 3);
export const MOVES_PER_REPETITION = 5;
export const PERFORMANCE_CALIBRATION = process.env.KANVANA_PERF_CALIBRATE === '1';

// Structural metrics (node counts, live cards, render counts, crashes) reproduce
// exactly run to run, so their budgets sit just above baseline. Wall-clock and heap
// metrics swing with runner load, so their budgets only trip on a material
// (roughly 2x) regression. See docs/spec/testing.md for the recorded baseline.
//
// The structural numbers were re-baselined on 2026-09-16, after the forceFallback
// drag fix: swimlane boards now retain roughly half the DOM they used to, so the
// old limits had about 2x headroom and would not have caught a real regression.
// Drop timing and heap baselines remain at their 2026-08-29 reference values.
// Startup baselines were re-recorded after switching to the board-render mark
// on 2026-10-07; older values included unrelated page-load and polling delays.
export const PERFORMANCE_SCENARIOS = [
  {
    taskCount: 400,
    view: 'standard',
    baseline: {
      fixtureSeedMs: 22.4,
      startupMs: 303.9,
      taskDropLatencyMs: 283.3,
      jsHeapUsedMb: 5.98,
      retainedDomNodes: 17345,
      liveDomNodes: 5513,
      detachedDomNodes: 11832,
      liveTaskCards: 205,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 5,
      browserCrashEvents: 0,
    },
    budget: {
      fixtureSeedMs: 200,
      startupMs: 3000,
      taskDropLatencyMs: 700,
      jsHeapUsedMb: 14,
      retainedDomNodes: 18300,
      liveDomNodes: 5800,
      detachedDomNodes: 12500,
      liveTaskCards: 210,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 5,
      browserCrashEvents: 0,
    },
  },
  {
    taskCount: 1000,
    view: 'standard',
    baseline: {
      fixtureSeedMs: 48,
      startupMs: 390.5,
      taskDropLatencyMs: 537,
      jsHeapUsedMb: 7.27,
      retainedDomNodes: 32705,
      liveDomNodes: 10073,
      detachedDomNodes: 22632,
      liveTaskCards: 445,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 5,
      browserCrashEvents: 0,
    },
    budget: {
      fixtureSeedMs: 250,
      startupMs: 4000,
      taskDropLatencyMs: 1300,
      jsHeapUsedMb: 16,
      retainedDomNodes: 34400,
      liveDomNodes: 10600,
      detachedDomNodes: 23800,
      liveTaskCards: 450,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 5,
      browserCrashEvents: 0,
    },
  },
  {
    taskCount: 400,
    view: 'swimlane',
    baseline: {
      fixtureSeedMs: 21.1,
      startupMs: 451.8,
      taskDropLatencyMs: 334.1,
      jsHeapUsedMb: 6.27,
      retainedDomNodes: 14795,
      liveDomNodes: 4726,
      detachedDomNodes: 10069,
      liveTaskCards: 160,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 10,
      browserCrashEvents: 0,
    },
    budget: {
      fixtureSeedMs: 200,
      startupMs: 2500,
      taskDropLatencyMs: 850,
      jsHeapUsedMb: 14,
      retainedDomNodes: 15600,
      liveDomNodes: 5000,
      detachedDomNodes: 10600,
      liveTaskCards: 165,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 10,
      browserCrashEvents: 0,
    },
  },
  {
    taskCount: 1000,
    view: 'swimlane',
    baseline: {
      fixtureSeedMs: 40.4,
      startupMs: 355.8,
      taskDropLatencyMs: 400.2,
      jsHeapUsedMb: 8.75,
      retainedDomNodes: 30155,
      liveDomNodes: 9286,
      detachedDomNodes: 20869,
      liveTaskCards: 400,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 10,
      browserCrashEvents: 0,
    },
    budget: {
      fixtureSeedMs: 250,
      startupMs: 3600,
      taskDropLatencyMs: 1000,
      jsHeapUsedMb: 18,
      retainedDomNodes: 31700,
      liveDomNodes: 9800,
      detachedDomNodes: 22000,
      liveTaskCards: 405,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 10,
      browserCrashEvents: 0,
    },
  },
];

export const PERFORMANCE_BACKFILL_SCENARIOS = [
  { taskCount: 400, baseline: { startupMs: 343.3, backfillMs: 52.3 }, budget: { startupMs: 3000, backfillMs: 200 } },
  { taskCount: 1000, baseline: { startupMs: 506.3, backfillMs: 127.9 }, budget: { startupMs: 4000, backfillMs: 400 } },
];
