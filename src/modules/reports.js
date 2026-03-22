import * as echarts from 'echarts/core';
import {
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { renderIcons } from './icons.js';
import { escapeHtml } from './security.js';
import { initializeThemeToggle } from './theme.js';
import { ensureBoardsInitialized, getActiveBoardId, getActiveBoardName } from './storage.js';
import { loadColumns, loadTasks } from './storage.js';

echarts.use([
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  BarChart,
  HeatmapChart,
  LineChart,
  CanvasRenderer
]);

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getChartTheme() {
  return {
    text: cssVar('--text', '#111827'),
    muted: cssVar('--text-muted', '#6b7280'),
    border: cssVar('--border', '#d1d5db'),
    borderSubtle: cssVar('--border-subtle', '#e5e7eb'),
    surface: cssVar('--surface', '#ffffff')
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDateOnly(value) {
  const s = (value || '').toString().trim();
  if (!s) return '';
  if (s.length >= 10) return s.slice(0, 10);
  return '';
}

function formatIsoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatShortDate(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonthLabel(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function safeDate(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const delta = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - delta);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function eachDayInclusive(start, end) {
  const days = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= last) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function eachWeekStartInclusive(rangeStart, rangeEnd) {
  const weeks = [];
  const d = new Date(startOfWeekMonday(rangeStart));
  const end = startOfWeekMonday(rangeEnd);
  while (d <= end) {
    weeks.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

function eachMonthInclusive(rangeStart, rangeEnd) {
  const months = [];
  const d = startOfMonth(rangeStart);
  const last = startOfMonth(rangeEnd);
  while (d <= last) {
    months.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

// ---------------------------------------------------------------------------
// Shared granularity bucketing
// ---------------------------------------------------------------------------

function bucketKeyForDate(date, granularity) {
  if (granularity === 'daily') return formatIsoDate(date);
  if (granularity === 'monthly') return formatMonthLabel(date);
  return formatIsoDate(startOfWeekMonday(date));
}

function generateTimeSlots(rangeStart, rangeEnd, granularity) {
  if (granularity === 'daily') {
    const days = eachDayInclusive(rangeStart, rangeEnd);
    return { keys: days.map(formatIsoDate), labels: days.map(formatShortDate) };
  }
  if (granularity === 'monthly') {
    const months = eachMonthInclusive(rangeStart, rangeEnd);
    const keys = months.map(formatMonthLabel);
    return { keys, labels: keys };
  }
  const weekStarts = eachWeekStartInclusive(rangeStart, rangeEnd);
  return {
    keys: weekStarts.map(formatIsoDate),
    labels: weekStarts.map((ws) => `${formatShortDate(ws)} → ${formatShortDate(addDays(ws, 6))}`)
  };
}

// ---------------------------------------------------------------------------
// Shared bar chart builder
// ---------------------------------------------------------------------------

function buildBarChartOption({ labels, seriesList, granularity, legend }) {
  const theme = getChartTheme();
  const showBarLabels = granularity !== 'daily';
  const barLabel = showBarLabels
    ? { show: true, position: 'top', fontSize: 10, color: theme.text, formatter: (p) => p.value > 0 ? String(p.value) : '' }
    : { show: false };

  return {
    backgroundColor: 'transparent',
    grid: { left: 40, right: 40, top: legend ? 30 : 8, bottom: 32 },
    legend: legend
      ? { top: 0, textStyle: { color: theme.muted, fontSize: 10 } }
      : undefined,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { show: true, fontSize: 9, color: theme.muted, rotate: 30, hideOverlap: true },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: 'Tasks',
      min: 0,
      nameTextStyle: { color: theme.muted },
      axisLabel: { color: theme.muted },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } },
      splitLine: { lineStyle: { color: theme.borderSubtle } }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text }
    },
    dataZoom: granularity === 'daily'
      ? [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }]
      : [],
    series: seriesList.map((s) => ({
      name: s.name,
      type: 'bar',
      data: s.data,
      itemStyle: { color: s.color, borderRadius: [2, 2, 0, 0] },
      label: barLabel
    }))
  };
}

// ---------------------------------------------------------------------------
// Data: daily update heatmap
// ---------------------------------------------------------------------------

function computeDailyUpdateCounts(tasks, startDate, endDate) {
  const counts = new Map();

  for (const task of tasks || []) {
    const day = isoDateOnly(task?.changeDate);
    if (!day) continue;
    counts.set(day, (counts.get(day) || 0) + 1);
  }

  const allDays = eachDayInclusive(startDate, endDate);
  const data = allDays.map((d) => {
    const key = formatIsoDate(d);
    return [key, counts.get(key) || 0];
  });

  const max = data.reduce((m, [, v]) => Math.max(m, Number(v) || 0), 0);
  return { data, max };
}

function buildDailyUpdatesOption({ rangeStart, rangeEnd, data, maxValue, boardName }) {
  const max = Math.max(1, maxValue || 0);
  const theme = getChartTheme();

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.text },
    title: {
      top: 20,
      left: 'center',
      text: `Daily updates — ${boardName}`,
      textStyle: { color: theme.text }
    },
    tooltip: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (params) => {
        const date = escapeHtml(params?.value?.[0] || '');
        const value = params?.value?.[1] ?? 0;
        return `${date}: ${value} update${value === 1 ? '' : 's'}`;
      }
    },
    visualMap: {
      min: 0,
      max,
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      top: 55,
      textStyle: { color: theme.muted }
    },
    calendar: {
      top: 110,
      left: 30,
      right: 30,
      cellSize: ['auto', 14],
      range: [formatIsoDate(rangeStart), formatIsoDate(rangeEnd)],
      itemStyle: {
        borderWidth: 0.5,
        borderColor: theme.borderSubtle
      },
      dayLabel: { color: theme.muted },
      monthLabel: { color: theme.text },
      yearLabel: { show: false }
    },
    series: {
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data
    }
  };
}

// ---------------------------------------------------------------------------
// Data: task completions (generic, granularity-aware)
// ---------------------------------------------------------------------------

function computeCompletions(tasks, rangeStart, rangeEnd, granularity) {
  const buckets = new Map();

  for (const task of tasks || []) {
    const done = safeDate(task?.doneDate);
    if (!done || done < rangeStart || done > rangeEnd) continue;
    const key = bucketKeyForDate(done, granularity);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const { keys, labels } = generateTimeSlots(rangeStart, rangeEnd, granularity);
  const completedCounts = keys.map((k) => buckets.get(k) || 0);
  return { labels, completedCounts };
}

// ---------------------------------------------------------------------------
// Data: same-day vs planned completions (granularity-aware)
// ---------------------------------------------------------------------------

function computeSameDayCompletions(tasks, rangeStart, rangeEnd, granularity) {
  const sameDayBuckets = new Map();
  const plannedBuckets = new Map();

  for (const task of tasks || []) {
    const created = isoDateOnly(task?.creationDate);
    const done = isoDateOnly(task?.doneDate);
    if (!created || !done) continue;

    const doneDate = safeDate(done);
    if (!doneDate || doneDate < rangeStart || doneDate > rangeEnd) continue;

    const key = bucketKeyForDate(doneDate, granularity);
    if (created === done) {
      sameDayBuckets.set(key, (sameDayBuckets.get(key) || 0) + 1);
    } else {
      plannedBuckets.set(key, (plannedBuckets.get(key) || 0) + 1);
    }
  }

  const { keys, labels } = generateTimeSlots(rangeStart, rangeEnd, granularity);
  const sameDayCounts = keys.map((k) => sameDayBuckets.get(k) || 0);
  const plannedCounts = keys.map((k) => plannedBuckets.get(k) || 0);
  const total = sameDayCounts.reduce((s, v) => s + v, 0);

  return { labels, sameDayCounts, plannedCounts, total };
}

// ---------------------------------------------------------------------------
// Data: lead time (weekly only — used for the lead time chart + KPIs)
// ---------------------------------------------------------------------------

function movingAverage(values, windowSize) {
  const w = Math.max(1, Number(windowSize) || 1);
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - w + 1);
    const slice = values.slice(start, i + 1).filter((v) => Number.isFinite(v));
    if (slice.length === 0) {
      out.push(null);
      continue;
    }
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    out.push(Number(avg.toFixed(2)));
  }
  return out;
}

function computeWeeklyLeadTimeAndCompletions(tasks, rangeStart, rangeEnd) {
  const buckets = new Map();

  for (const task of tasks) {
    const created = safeDate(task?.creationDate);
    const done = safeDate(task?.doneDate);
    if (!created || !done) continue;
    if (done < rangeStart || done > rangeEnd) continue;

    const key = formatIsoDate(startOfWeekMonday(done));
    const leadDays = (done.getTime() - created.getTime()) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(leadDays) || leadDays < 0) continue;

    const bucket = buckets.get(key) || { count: 0, leadSumDays: 0 };
    bucket.count += 1;
    bucket.leadSumDays += leadDays;
    buckets.set(key, bucket);
  }

  const { keys, labels } = generateTimeSlots(rangeStart, rangeEnd, 'weekly');

  const completedCounts = keys.map((k) => buckets.get(k)?.count || 0);
  const avgLeadDays = keys.map((k) => {
    const b = buckets.get(k);
    if (!b || b.count === 0) return null;
    return Number((b.leadSumDays / b.count).toFixed(2));
  });

  const totalCompleted = completedCounts.reduce((s, v) => s + v, 0);
  const leadDaysAll = avgLeadDays.filter((v) => Number.isFinite(v));
  const avgLeadOverall = leadDaysAll.length
    ? (leadDaysAll.reduce((s, v) => s + v, 0) / leadDaysAll.length)
    : null;

  return {
    labels,
    completedCounts,
    avgLeadDays,
    trendLeadDays: movingAverage(avgLeadDays.map((v) => (v == null ? NaN : v)), 4),
    totalCompleted,
    avgLeadOverall
  };
}

function buildLeadTimeOption({ labels, avgLeadDays, trendLeadDays, completedCounts }) {
  const maxLead = Math.max(1, ...avgLeadDays.map((v) => (Number.isFinite(v) ? v : 0)));
  const theme = getChartTheme();

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.text },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [];
        const header = escapeHtml(items[0]?.axisValueLabel || '');
        const byName = new Map(items.map((p) => [p.seriesName, p.value]));
        const avg = byName.get('Avg lead time (days)');
        const trend = byName.get('Trend (4-week MA)');
        const completed = byName.get('Completed');
        const avgText = Number.isFinite(avg) ? `${avg}d` : '—';
        const trendText = Number.isFinite(trend) ? `${trend}d` : '—';
        const completedText = Number.isFinite(completed) ? `${completed}` : '0';
        return `${header}<br/>Completed: ${completedText}<br/>Avg lead time: ${avgText}<br/>Trend: ${trendText}`;
      }
    },
    legend: {
      top: 8,
      textStyle: { color: theme.muted }
    },
    grid: { left: 40, right: 40, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 1, rotate: 20, color: theme.muted },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Days',
        min: 0,
        max: Math.ceil(maxLead),
        nameTextStyle: { color: theme.muted },
        axisLabel: { color: theme.muted },
        axisLine: { lineStyle: { color: theme.borderSubtle } },
        axisTick: { lineStyle: { color: theme.borderSubtle } },
        splitLine: { lineStyle: { color: theme.borderSubtle } }
      },
      {
        type: 'value',
        name: 'Completed',
        min: 0,
        nameTextStyle: { color: theme.muted },
        axisLabel: { formatter: '{value}', color: theme.muted },
        axisLine: { lineStyle: { color: theme.borderSubtle } },
        axisTick: { lineStyle: { color: theme.borderSubtle } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Completed',
        type: 'bar',
        data: completedCounts,
        itemStyle: { color: '#3b82f6' },
        yAxisIndex: 1
      },
      {
        name: 'Avg lead time (days)',
        type: 'line',
        data: avgLeadDays.map((v) => (v == null ? null : v)),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 3, color: '#16a34a' },
        itemStyle: { color: '#16a34a' },
        yAxisIndex: 0
      },
      {
        name: 'Trend (4-week MA)',
        type: 'line',
        data: trendLeadDays.map((v) => (v == null ? null : v)),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: '#6b7280' },
        itemStyle: { color: '#6b7280' },
        yAxisIndex: 0
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Data + chart: Cumulative Flow Diagram
// ---------------------------------------------------------------------------

function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function hexToRgba(hex, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha)));
  if (!isHexColor(hex)) return `rgba(59,130,246,${a})`;
  const raw = hex.trim().slice(1);
  const full = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function sortColumnsForCfd(columns) {
  const list = Array.isArray(columns) ? columns.slice() : [];
  const done = list.find((c) => c?.id === 'done') || null;
  const others = list.filter((c) => c?.id && c.id !== 'done');

  const indexed = others.map((c, idx) => ({ c, idx }));
  indexed.sort((a, b) => {
    const ao = Number.isFinite(a.c?.order) ? a.c.order : null;
    const bo = Number.isFinite(b.c?.order) ? b.c.order : null;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return a.idx - b.idx;
  });

  const sorted = indexed.map((x) => x.c);
  if (done) sorted.push(done);
  return sorted;
}

function normalizeTaskColumnHistory(task) {
  const raw = task?.columnHistory;
  const entries = Array.isArray(raw) ? raw : [];
  const cleaned = entries
    .map((e) => {
      const column = typeof e?.column === 'string' ? e.column.trim() : '';
      const at = safeDate(e?.at);
      if (!column || !at) return null;
      return { column, at };
    })
    .filter(Boolean)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (cleaned.length > 0) return cleaned;

  const fallbackAt = safeDate(task?.creationDate) || safeDate(task?.changeDate) || safeDate(task?.doneDate);
  const fallbackColumn = typeof task?.column === 'string' ? task.column.trim() : '';
  if (!fallbackAt || !fallbackColumn) return [];
  return [{ column: fallbackColumn, at: fallbackAt }];
}

function computeCumulativeFlow({ tasks, columns, rangeStart, rangeEnd, includeDone }) {
  const days = eachDayInclusive(rangeStart, rangeEnd);
  const dayEnds = days.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
  const labels = days.map((d) => formatIsoDate(d));

  const countsByColumnId = new Map();
  const ensureSeries = (columnId) => {
    if (!countsByColumnId.has(columnId)) {
      countsByColumnId.set(columnId, new Array(labels.length).fill(0));
    }
    return countsByColumnId.get(columnId);
  };

  for (const task of tasks || []) {
    const history = normalizeTaskColumnHistory(task);
    if (!history.length) continue;

    let currentColumn = null;
    let eventIndex = -1;

    for (let dayIndex = 0; dayIndex < dayEnds.length; dayIndex++) {
      const dayEnd = dayEnds[dayIndex];
      while (eventIndex + 1 < history.length && history[eventIndex + 1].at <= dayEnd) {
        eventIndex += 1;
        currentColumn = history[eventIndex].column;
      }

      if (!currentColumn) continue;
      if (!includeDone && currentColumn === 'done') continue;

      const series = ensureSeries(currentColumn);
      series[dayIndex] += 1;
    }
  }

  const sortedColumns = sortColumnsForCfd(columns);
  const columnById = new Map(sortedColumns.map((c) => [c.id, c]));

  const orderedIds = sortedColumns.map((c) => c.id);
  for (const id of countsByColumnId.keys()) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  const seriesDefs = orderedIds
    .filter((id) => includeDone || id !== 'done')
    .map((id) => {
      const c = columnById.get(id);
      const name = typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : (id === 'done' ? 'Done' : id);
      const color = isHexColor(c?.color) ? c.color.trim() : '#3b82f6';
      const data = countsByColumnId.get(id) || new Array(labels.length).fill(0);
      return { id, name, color, data };
    });

  return { labels, seriesDefs };
}

function buildCfdOption({ labels, seriesDefs, boardName }) {
  const plotSeries = Array.isArray(seriesDefs) ? seriesDefs.slice().reverse() : [];
  const maxY = seriesDefs.length
    ? Math.max(1, ...labels.map((_, i) => seriesDefs.reduce((s, series) => s + (series.data[i] || 0), 0)))
    : 1;

  const theme = getChartTheme();

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.text },
    title: {
      top: 12,
      left: 'center',
      text: `Cumulative flow — ${boardName}`,
      textStyle: { color: theme.text }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [];
        const date = escapeHtml(items[0]?.axisValueLabel || '');
        const lines = [`${date}`];
        let total = 0;
        for (const p of items) {
          const v = Number(p?.value) || 0;
          total += v;
          lines.push(`${escapeHtml(p?.seriesName || '')}: ${v}`);
        }
        lines.push(`<span style="opacity:.7">Total: ${total}</span>`);
        return lines.join('<br/>');
      }
    },
    legend: {
      top: 40,
      type: 'scroll',
      textStyle: { color: theme.muted }
    },
    grid: { left: 40, right: 20, top: 80, bottom: 45 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { hideOverlap: true, color: theme.muted },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } }
    },
    yAxis: {
      type: 'value',
      name: 'Tasks',
      min: 0,
      max: Math.ceil(maxY),
      nameTextStyle: { color: theme.muted },
      axisLabel: { color: theme.muted },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } },
      splitLine: { lineStyle: { color: theme.borderSubtle } }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' }
    ],
    series: plotSeries.map((s) => ({
      name: s.name,
      type: 'line',
      stack: 'total',
      symbol: 'none',
      data: s.data,
      lineStyle: { width: 1.5, color: s.color },
      itemStyle: { color: s.color },
      areaStyle: { color: hexToRgba(s.color, 0.28) },
      emphasis: { focus: 'series' }
    }))
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  initializeThemeToggle();
  ensureBoardsInitialized();
  renderIcons();

  const boardName = getActiveBoardName();
  const boardId = getActiveBoardId();
  const displayName = boardName || (boardId || 'Active board');

  const badge = document.getElementById('reports-board-badge');
  if (badge) badge.textContent = (boardName || 'Board').slice(0, 2).toUpperCase();

  const tasks = loadTasks();
  const columns = loadColumns();

  // Collect all chart instances for a single resize handler
  const charts = [];

  // --- Daily updates (last 365 days) ---
  const dailyEnd = new Date();
  const dailyStart = addDays(dailyEnd, -364);

  const daily = computeDailyUpdateCounts(tasks, dailyStart, dailyEnd);
  const dailyDom = document.getElementById('reports-chart');
  if (dailyDom) {
    const dailyChart = echarts.init(dailyDom);
    dailyChart.setOption(buildDailyUpdatesOption({
      rangeStart: dailyStart,
      rangeEnd: dailyEnd,
      data: daily.data,
      maxValue: daily.max,
      boardName: displayName
    }));
    charts.push(dailyChart);
  }

  // --- 12-week range (shared by completion, same-day, and lead time) ---
  const now = new Date();
  const endWeekRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startWeekRange = addDays(endWeekRange, -7 * 11);

  // --- Lead time + KPIs (weekly only) ---
  const weekly = computeWeeklyLeadTimeAndCompletions(tasks, startWeekRange, endWeekRange);

  const setTextById = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTextById('reports-completed-this-week', String(weekly.completedCounts[weekly.completedCounts.length - 1] || 0));
  setTextById('reports-completed-last-week', String(weekly.completedCounts[weekly.completedCounts.length - 2] || 0));
  setTextById('reports-avg-leadtime-12w', Number.isFinite(weekly.avgLeadOverall) ? `${weekly.avgLeadOverall.toFixed(1)}d` : '–');
  setTextById('reports-completion-badge', String(weekly.totalCompleted));
  setTextById('reports-leadtime-badge', String(weekly.totalCompleted));

  // --- Task completion chart (dynamic granularity) ---
  const sparkDom = document.getElementById('reports-completed-spark');
  const completionGranularityEl = document.getElementById('reports-completion-granularity');
  if (sparkDom) {
    const spark = echarts.init(sparkDom);
    charts.push(spark);

    const updateCompletionChart = () => {
      const granularity = completionGranularityEl?.value || 'weekly';
      const data = computeCompletions(tasks, startWeekRange, endWeekRange, granularity);
      spark.setOption(buildBarChartOption({
        labels: data.labels,
        seriesList: [{ data: data.completedCounts, color: '#3b82f6' }],
        granularity,
        legend: false
      }), true);
    };

    updateCompletionChart();
    completionGranularityEl?.addEventListener('change', updateCompletionChart);
  }

  // --- Same-day completions (dynamic granularity) ---
  const sameDayWeekly = computeSameDayCompletions(tasks, startWeekRange, endWeekRange, 'weekly');

  setTextById('reports-sameday-this-week', String(sameDayWeekly.sameDayCounts[sameDayWeekly.sameDayCounts.length - 1] || 0));
  setTextById('reports-sameday-last-week', String(sameDayWeekly.sameDayCounts[sameDayWeekly.sameDayCounts.length - 2] || 0));
  setTextById('reports-sameday-avg', sameDayWeekly.sameDayCounts.length
    ? (sameDayWeekly.total / sameDayWeekly.sameDayCounts.length).toFixed(1)
    : '–');
  setTextById('reports-sameday-badge', String(sameDayWeekly.total));

  const sdSparkDom = document.getElementById('reports-sameday-spark');
  const sdGranularityEl = document.getElementById('reports-sameday-granularity');
  if (sdSparkDom) {
    const sdSpark = echarts.init(sdSparkDom);
    charts.push(sdSpark);

    const updateSameDayChart = () => {
      const granularity = sdGranularityEl?.value || 'weekly';
      const data = computeSameDayCompletions(tasks, startWeekRange, endWeekRange, granularity);
      sdSpark.setOption(buildBarChartOption({
        labels: data.labels,
        seriesList: [
          { name: 'Same-day', data: data.sameDayCounts, color: '#f59e0b' },
          { name: 'Planned', data: data.plannedCounts, color: '#3b82f6' }
        ],
        granularity,
        legend: true
      }), true);
    };

    updateSameDayChart();
    sdGranularityEl?.addEventListener('change', updateSameDayChart);
  }

  // --- Lead time chart ---
  const leadDom = document.getElementById('reports-leadtime-chart');
  if (leadDom) {
    const leadChart = echarts.init(leadDom);
    leadChart.setOption(buildLeadTimeOption({
      labels: weekly.labels,
      avgLeadDays: weekly.avgLeadDays,
      trendLeadDays: weekly.trendLeadDays,
      completedCounts: weekly.completedCounts
    }));
    charts.push(leadChart);
  }

  // --- Cumulative Flow Diagram ---
  const cfdDom = document.getElementById('reports-cfd-chart');
  const cfdRangeEl = document.getElementById('reports-cfd-range');
  const cfdIncludeDoneEl = document.getElementById('reports-cfd-include-done');
  if (cfdDom) {
    const cfdChart = echarts.init(cfdDom);
    charts.push(cfdChart);

    const updateCfd = () => {
      const rangeDaysRaw = Number.parseInt((cfdRangeEl?.value ?? '90').toString(), 10);
      const rangeDays = Number.isFinite(rangeDaysRaw) ? Math.min(365, Math.max(7, rangeDaysRaw)) : 90;
      const includeDone = cfdIncludeDoneEl ? cfdIncludeDoneEl.checked === true : true;

      const cfdEnd = new Date();
      const cfdStart = addDays(cfdEnd, -(rangeDays - 1));

      const { labels, seriesDefs } = computeCumulativeFlow({
        tasks,
        columns,
        rangeStart: cfdStart,
        rangeEnd: cfdEnd,
        includeDone
      });

      cfdChart.setOption(buildCfdOption({ labels, seriesDefs, boardName: displayName }), true);
    };

    updateCfd();
    cfdRangeEl?.addEventListener('change', updateCfd);
    cfdIncludeDoneEl?.addEventListener('change', updateCfd);
  }

  // Single resize handler for all charts
  window.addEventListener('resize', () => {
    for (const chart of charts) chart.resize();
  });
}

main();
