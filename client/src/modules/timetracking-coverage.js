import { escapeHtml } from './security.js';
import { dayKey, zonedParts, pad2, MINUTE_MS } from './timetracking-time.js';

const DAY_START_MINUTES = 7 * 60;
const DAY_END_MINUTES = 19 * 60;
const MIDNIGHT_MINUTES = 24 * 60;

const floorHour = (minutes) => Math.floor(minutes / 60) * 60;
const ceilHour = (minutes) => Math.ceil(minutes / 60) * 60;

// Entries of one day group (all start on the same zoned day); a block stops at midnight.
export function dayCoverage(entries, prefs, colorOf) {
  const blocks = entries.map((entry) => {
    const startMs = Date.parse(entry.start);
    const startMinutes = zonedParts(startMs, prefs.tz).minutes;
    const endMinutes = Math.min(startMinutes + (Date.parse(entry.end) - startMs) / MINUTE_MS, MIDNIGHT_MINUTES);
    return { startMinutes, endMinutes, color: colorOf(entry) };
  });
  const isToday = entries.length > 0 && dayKey(Date.parse(entries[0].start), prefs.tz) === dayKey(prefs.now, prefs.tz);
  const nowMinutes = isToday ? zonedParts(prefs.now, prefs.tz).minutes : null;
  const marks = [...blocks.flatMap((b) => [b.startMinutes, b.endMinutes]), ...(isToday ? [nowMinutes] : [])];
  return {
    startMinutes: floorHour(Math.min(DAY_START_MINUTES, ...marks)),
    endMinutes: Math.min(ceilHour(Math.max(DAY_END_MINUTES, ...marks)), MIDNIGHT_MINUTES),
    blocks,
    nowMinutes
  };
}

export function coverageBarHtml({ startMinutes, endMinutes, blocks, nowMinutes }) {
  const span = endMinutes - startMinutes;
  const pct = (minutes) => `${(((minutes - startMinutes) / span) * 100).toFixed(2)}%`;
  const width = (from, to) => `${(((to - from) / span) * 100).toFixed(2)}%`;
  const blockHtml = blocks.map((b) => `<i class="tt-coverage-block" style="left:${pct(b.startMinutes)};width:${width(b.startMinutes, b.endMinutes)};background:${escapeHtml(b.color)};"></i>`).join('');
  const nowHtml = nowMinutes === null ? '' : `<span class="tt-coverage-now" style="left:${pct(nowMinutes)};"></span>`;
  return `
          <div class="tt-day-coverage" aria-hidden="true">
            <div class="tt-coverage-bar">${blockHtml}${nowHtml}</div>
            <div class="tt-coverage-scale"><span>${pad2(startMinutes / 60)}</span><span>${pad2(endMinutes / 60)}</span></div>
          </div>`;
}
