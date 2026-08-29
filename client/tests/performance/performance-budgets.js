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
export const PERFORMANCE_SCENARIOS = [
  {
    taskCount: 400,
    view: 'standard',
    baseline: {
      fixtureSeedMs: 22.4,
      startupMs: 957.4,
      taskDropLatencyMs: 283.3,
      jsHeapUsedMb: 5.98,
      retainedDomNodes: 17432,
      liveDomNodes: 5483,
      detachedDomNodes: 11949,
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
      detachedDomNodes: 12600,
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
      startupMs: 1849.4,
      taskDropLatencyMs: 537,
      jsHeapUsedMb: 7.27,
      retainedDomNodes: 32972,
      liveDomNodes: 10043,
      detachedDomNodes: 22929,
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
      retainedDomNodes: 34700,
      liveDomNodes: 10600,
      detachedDomNodes: 24100,
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
      startupMs: 708.7,
      taskDropLatencyMs: 334.1,
      jsHeapUsedMb: 6.27,
      retainedDomNodes: 25543,
      liveDomNodes: 4696,
      detachedDomNodes: 20847,
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
      retainedDomNodes: 26900,
      liveDomNodes: 5000,
      detachedDomNodes: 21900,
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
      startupMs: 1320.8,
      taskDropLatencyMs: 400.2,
      jsHeapUsedMb: 8.75,
      retainedDomNodes: 55843,
      liveDomNodes: 9256,
      detachedDomNodes: 46587,
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
      retainedDomNodes: 58700,
      liveDomNodes: 9800,
      detachedDomNodes: 49000,
      liveTaskCards: 405,
      startupBoardRenders: 1,
      steadyStateBoardRenders: 10,
      browserCrashEvents: 0,
    },
  },
];
