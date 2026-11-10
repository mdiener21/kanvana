import { addDays, dayKey, fromZoned, zonedParts, MINUTE_MS } from './timetracking-time.js';

export const MIN_GAP_MS = 5 * MINUTE_MS;

function midnightAfter(ms, tz) {
  return fromZoned(addDays(zonedParts(ms, tz), 1), 0, tz);
}

function spansByDay(entries, tz) {
  const days = new Map();
  for (const entry of entries) {
    const startMs = Date.parse(entry.start);
    const endMs = Math.min(Date.parse(entry.end), midnightAfter(startMs, tz));
    const key = dayKey(startMs, tz);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push({ startMs, endMs });
  }
  return days;
}

function gapsOfDay(key, spans) {
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  const gaps = [];
  let coveredUntil = sorted[0].endMs;
  for (const { startMs, endMs } of sorted.slice(1)) {
    if (startMs - coveredUntil >= MIN_GAP_MS) gaps.push({ dayKey: key, startMs: coveredUntil, endMs: startMs });
    coveredUntil = Math.max(coveredUntil, endMs);
  }
  return gaps;
}

// Per attribution day: uncovered spans between first Start and last End (entries stop at midnight).
export function untrackedGaps(entries, tz) {
  return [...spansByDay(entries, tz)]
    .flatMap(([key, spans]) => gapsOfDay(key, spans))
    .sort((a, b) => a.startMs - b.startMs);
}
