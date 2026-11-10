import { formatTime, MINUTE_MS } from './timetracking-time.js';

export function gapRowHtml(gap, prefs) {
  const span = `${formatTime(gap.startMs, prefs)} – ${formatTime(gap.endMs, prefs)}`;
  const minutes = Math.round((gap.endMs - gap.startMs) / MINUTE_MS);
  return `
    <li class="tt-gap-row" aria-label="${minutes} minutes untracked">
      <span class="tt-gap-span">${span}</span>
      <span class="tt-gap-minutes">· ${minutes} min untracked</span>
      <button type="button" class="tt-gap-fill" data-gap-start="${gap.startMs}" data-gap-end="${gap.endMs}" aria-label="Fill ${span}">Fill</button>
    </li>`;
}

export const gapOfFillButton = (button) => ({ startMs: Number(button.dataset.gapStart), endMs: Number(button.dataset.gapEnd) });

// Day rows newest first: a gap goes right below the entries that start at or after its end.
export function dayRowsHtml(entries, gaps, entryHtml, prefs) {
  const pending = [...gaps].sort((a, b) => b.startMs - a.startMs);
  return entries.map((entry) => {
    const startMs = Date.parse(entry.start);
    let html = '';
    while (pending.length > 0 && pending[0].endMs > startMs) html += gapRowHtml(pending.shift(), prefs);
    return html + entryHtml(entry);
  }).join('');
}
