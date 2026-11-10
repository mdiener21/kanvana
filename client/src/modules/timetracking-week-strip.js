import { escapeHtml } from './security.js';
import { periodBalance, showBalance } from './timetracking-balance.js';
import { currentPeriod, WEEK } from './timetracking-report.js';
import {
  zonedParts, addDays, dayNumber, dayKey, ymdToUtcMs, isoWeek, formatShortWeekday, formatShortMonth, formatDuration
} from './timetracking-time.js';

// Reports keep their compact `W46 · 9–15 Nov 2026`; the strip spells the range out.
function weekStripLabel(start, end) {
  const from = start.y !== end.y ? `${start.d} ${formatShortMonth(start)} ${start.y}`
    : start.m !== end.m ? `${start.d} ${formatShortMonth(start)}` : `${start.d}`;
  return `Week ${isoWeek(start).week} · ${from} – ${end.d} ${formatShortMonth(end)} ${end.y}`;
}

// The week's days and its Balance over all entries (the strip ignores the list filter).
export function summarizeWeekStrip(entries, now, { tz, weeklyHours = null, workdays }) {
  const week = currentPeriod(WEEK, now, tz);
  const options = { now, tz, weeklyHours, workdays };
  const today = dayNumber(zonedParts(now, tz));
  const days = Array.from({ length: 7 }, (_, i) => {
    const ymd = addDays(week.start, i);
    const { loggedMs, targetMs } = periodBalance(entries, { start: ymd, end: ymd }, options);
    return {
      key: dayKey(ymdToUtcMs(ymd), 'UTC'),
      ymd,
      weekday: formatShortWeekday(ymd),
      date: ymd.d,
      loggedMs,
      targetMs,
      isToday: dayNumber(ymd) === today,
      isFuture: dayNumber(ymd) > today
    };
  });
  const { loggedMs, balanceMs } = periodBalance(entries, week, options);
  return { label: weekStripLabel(week.start, week.end), days, loggedMs, balanceMs };
}

export const WEEK_HEADER_HTML = `
    <div class="tt-tracker-header">
      <div class="tt-tracker-heading">
        <h2 class="tt-section-title">Time Tracker</h2>
        <p class="tt-week-label"></p>
      </div>
      <div class="tt-week-summary">
        <button type="button" class="tt-week-total" data-testid="tt-week-total" title="Open this week in Reports"></button>
        <button type="button" class="tt-week-balance" data-testid="tt-week-balance" title="Open this week in Reports" hidden>
          <span class="tt-week-balance-label">This week</span>
          <span class="tt-week-balance-value"></span>
        </button>
      </div>
    </div>
    <ol class="tt-week-strip" aria-label="This week"></ol>
`;

// Full at or above the day's Target; a day without Target (a weekend) is full once anything is logged.
function meterHtml({ loggedMs, targetMs }) {
  const ratio = targetMs > 0 ? Math.min(loggedMs / targetMs, 1) : Number(loggedMs > 0);
  const isMet = targetMs !== null && loggedMs > 0 && loggedMs >= targetMs;
  return `<span class="tt-week-meter${isMet ? ' is-met' : ''}" aria-hidden="true"><span class="tt-week-meter-fill" style="width:${Math.round(ratio * 100)}%"></span></span>`;
}

function dayCellHtml(day, { durationFormat, showMeter }) {
  const logged = day.loggedMs > 0 ? formatDuration(day.loggedMs, durationFormat) : null;
  const label = `${day.weekday} ${day.date} ${formatShortMonth(day.ymd)}, ${logged ? `${logged} logged` : 'nothing logged'}`;
  return `
      <li><button type="button" class="tt-week-day${day.isFuture ? ' is-future' : ''}" data-day="${day.key}" aria-label="${escapeHtml(label)}"${day.isToday ? ' aria-current="date"' : ''}>
        <span class="tt-week-day-top"><span class="tt-week-day-name">${day.weekday}</span><span class="tt-week-day-date">${day.date}</span></span>
        <span class="tt-week-day-hours${logged ? '' : ' is-empty'}">${escapeHtml(logged ?? '–')}</span>
        ${showMeter ? meterHtml(day) : ''}
      </button></li>`;
}

export function mountWeekStrip(panel, { getSettings, onOpenCurrentWeek, onSelectDay }) {
  const label = panel.querySelector('.tt-week-label');
  const total = panel.querySelector('[data-testid="tt-week-total"]');
  const badge = panel.querySelector('[data-testid="tt-week-balance"]');
  const strip = panel.querySelector('.tt-week-strip');
  let loggedDays = new Set();

  panel.querySelector('.tt-week-summary').addEventListener('click', (ev) => {
    if (ev.target.closest('button')) onOpenCurrentWeek();
  });
  strip.addEventListener('click', (ev) => {
    const key = ev.target.closest('[data-day]')?.dataset.day;
    if (loggedDays.has(key)) onSelectDay(key);
  });

  function refresh(tt, prefs) {
    const { weeklyHours, workdays } = getSettings();
    const week = summarizeWeekStrip(tt.timeEntries, prefs.now, { tz: prefs.tz, weeklyHours, workdays });
    loggedDays = new Set(week.days.filter((d) => d.loggedMs > 0).map((d) => d.key));
    label.textContent = week.label;
    const totalText = formatDuration(week.loggedMs, prefs.durationFormat);
    total.textContent = totalText;
    total.setAttribute('aria-label', `This week ${totalText} logged`);
    const cellOptions = { durationFormat: prefs.durationFormat, showMeter: weeklyHours > 0 };
    strip.innerHTML = week.days.map((day) => dayCellHtml(day, cellOptions)).join('');

    badge.hidden = week.balanceMs === null;
    if (week.balanceMs === null) return;
    const value = showBalance(badge.querySelector('.tt-week-balance-value'), week.balanceMs, prefs.durationFormat, badge);
    badge.setAttribute('aria-label', `This week balance ${value}`);
  }

  return { refresh };
}
