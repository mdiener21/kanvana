import { escapeHtml } from './security.js';
import { dayKey, formatTime, MINUTE_MS } from './timetracking-time.js';

const gapSpan = (gap, prefs) => `${formatTime(gap.startMs, prefs)} – ${formatTime(gap.endMs, prefs)}`;

const gapAttrs = (gap) => `data-gap-start="${escapeHtml(gap.startMs)}" data-gap-end="${escapeHtml(gap.endMs)}"`;

export function gapRowHtml(gap, prefs) {
  const span = escapeHtml(gapSpan(gap, prefs));
  const minutes = Math.round((gap.endMs - gap.startMs) / MINUTE_MS);
  return `
    <li class="tt-gap-row" aria-label="${minutes} minutes untracked">
      <span class="tt-gap-span">${span}</span>
      <span class="tt-gap-minutes">· ${minutes} min untracked</span>
      <button type="button" class="tt-gap-fill" ${gapAttrs(gap)} aria-label="Fill ${span}">Fill</button>
    </li>`;
}

export const MAX_FILL_CHIPS = 3;

// Fill chips below the entry bar: today's gaps, newest first, at most MAX_FILL_CHIPS.
export function fillChipsHtml(gaps, prefs) {
  const today = dayKey(prefs.now, prefs.tz);
  return gaps
    .filter((gap) => gap.dayKey === today)
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, MAX_FILL_CHIPS)
    .map((gap) => `<button type="button" class="tt-fill-chip" ${gapAttrs(gap)}>Fill ${escapeHtml(gapSpan(gap, prefs))}</button>`)
    .join('');
}

// The gap directly before an entry: between it and the previous entry of the same day.
export const gapBefore = (gaps, entry) => gaps.find((gap) => gap.endMs === Date.parse(entry.start)) ?? null;

export const gapOfFillButton = (button) => ({ startMs: Number(button.dataset.gapStart), endMs: Number(button.dataset.gapEnd) });

// Day rows newest first: a gap sits directly above the entry it follows (whose End is its Start).
export function dayRowsHtml(entries, gaps, entryHtml, prefs) {
  const pending = [...gaps];
  return entries.map((entry) => {
    const endMs = Date.parse(entry.end);
    const following = pending.filter((gap) => gap.startMs === endMs);
    for (const gap of following) pending.splice(pending.indexOf(gap), 1);
    return following.map((gap) => gapRowHtml(gap, prefs)).join('') + entryHtml(entry);
  }).join('');
}
