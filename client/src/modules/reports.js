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

function isoDateOnly(value) {
  const s = (value || '').toString().trim();
  if (!s) return '';
  // Most stored values are ISO strings; we only need YYYY-MM-DD.
  if (s.length >= 10) return s.slice(0, 10);
  return '';
}

function formatIsoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

function safeDate(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeekMonday(date) {
  // Week bucket uses local time; Monday as start.
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const delta = (day + 6) % 7; // Mon=0, Sun=6
  d.setDate(d.getDate() - delta);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekLabel(weekStart) {
  const end = addDays(weekStart, 6);
  return `${formatIsoDate(weekStart)}…${formatIsoDate(end)}`;
}

function eachWeekStartInclusive(rangeStart, rangeEnd) {
  const weeks = [];
  const start = startOfWeekMonday(rangeStart);
  const end = startOfWeekMonday(rangeEnd);
  const d = new Date(start);
  while (d <= end) {
    weeks.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

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
        const date = params?.value?.[0] || '';
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

    const weekStart = startOfWeekMonday(done);
    const key = formatIsoDate(weekStart);
    const leadDays = (done.getTime() - created.getTime()) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(leadDays) || leadDays < 0) continue;

    const bucket = buckets.get(key) || { count: 0, leadSumDays: 0 };
    bucket.count += 1;
    bucket.leadSumDays += leadDays;
    buckets.set(key, bucket);
  }

  const weekStarts = eachWeekStartInclusive(rangeStart, rangeEnd);
  const labels = weekStarts.map(formatWeekLabel);
  const keys = weekStarts.map((w) => formatIsoDate(w));

  const completedCounts = keys.map((k) => buckets.get(k)?.count || 0);
  const avgLeadDays = keys.map((k) => {
    const b = buckets.get(k);
    if (!b || b.count === 0) return null;
    return Number((b.leadSumDays / b.count).toFixed(2));
  });

  const totalCompleted = completedCounts.reduce((s, v) => s + v, 0);
  const leadDaysAll = keys
    .map((k) => {
      const b = buckets.get(k);
      if (!b || b.count === 0) return null;
      return b.leadSumDays / b.count;
    })
    .filter((v) => Number.isFinite(v));

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
        const header = items[0]?.axisValueLabel || '';
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
    grid: {
      left: 40,
      right: 40,
      top: 50,
      bottom: 40
    },
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

function buildCompletedSparkOption({ labels, completedCounts }) {
  const theme = getChartTheme();
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 8, top: 8, bottom: 8 },
    xAxis: {
      type: 'category',
      data: labels,
      show: false
    },
    yAxis: {
      type: 'value',
      show: false,
      min: 0
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const label = p?.axisValueLabel || '';
        const v = p?.value ?? 0;
        return `${label}<br/>Completed: ${v}`;
      }
    },
    series: [
      {
        type: 'line',
        data: completedCounts,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#3b82f6' },
        areaStyle: { color: 'rgba(59, 130, 246, 0.18)' }
      }
    ]
  };
}

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

  // Preserve workflow order; append any unknown columns referenced in history.
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
        const date = items[0]?.axisValueLabel || '';
        const lines = [`${date}`];
        let total = 0;
        for (const p of items) {
          const v = Number(p?.value) || 0;
          total += v;
          lines.push(`${p.marker || ''}${p.seriesName}: ${v}`);
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
    grid: {
      left: 40,
      right: 20,
      top: 80,
      bottom: 45
    },
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
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none'
      }
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

function main() {
  initializeThemeToggle();
  ensureBoardsInitialized();
  renderIcons();

  const boardName = getActiveBoardName();
  const boardId = getActiveBoardId();

  const badge = document.getElementById('reports-board-badge');
  if (badge) badge.textContent = (boardName || 'Board').slice(0, 2).toUpperCase();

  const tasks = loadTasks();
  const columns = loadColumns();

  // Daily updates (last 365 days)
  const dailyEnd = new Date();
  const dailyStart = new Date();
  dailyStart.setDate(dailyEnd.getDate() - 364); // inclusive range: 365 days

  const daily = computeDailyUpdateCounts(tasks, dailyStart, dailyEnd);
  const dailyDom = document.getElementById('reports-chart');
  if (dailyDom) {
    const dailyChart = echarts.init(dailyDom);
    dailyChart.setOption(buildDailyUpdatesOption({
      rangeStart: dailyStart,
      rangeEnd: dailyEnd,
      data: daily.data,
      maxValue: daily.max,
      boardName: boardName || (boardId || 'Active board')
    }));
    window.addEventListener('resize', () => dailyChart.resize());
  }

  // Weekly completion + lead time (last 12 weeks)
  const now = new Date();
  const endWeekRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startWeekRange = addDays(endWeekRange, -7 * 11); // inclusive: 12 weeks
  const weekly = computeWeeklyLeadTimeAndCompletions(tasks, startWeekRange, endWeekRange);

  const completedThisWeek = weekly.completedCounts[weekly.completedCounts.length - 1] || 0;
  const completedLastWeek = weekly.completedCounts[weekly.completedCounts.length - 2] || 0;
  const avgLead12w = Number.isFinite(weekly.avgLeadOverall) ? `${weekly.avgLeadOverall.toFixed(1)}d` : '–';

  const kpiThis = document.getElementById('reports-completed-this-week');
  const kpiLast = document.getElementById('reports-completed-last-week');
  const kpiAvgLead = document.getElementById('reports-avg-leadtime-12w');
  if (kpiThis) kpiThis.textContent = String(completedThisWeek);
  if (kpiLast) kpiLast.textContent = String(completedLastWeek);
  if (kpiAvgLead) kpiAvgLead.textContent = avgLead12w;

  const leadBadge = document.getElementById('reports-leadtime-badge');
  if (leadBadge) leadBadge.textContent = String(weekly.totalCompleted);

  const sparkDom = document.getElementById('reports-completed-spark');
  if (sparkDom) {
    const spark = echarts.init(sparkDom);
    // Show only last 12 weeks labels on spark (shorten for tooltip only).
    spark.setOption(buildCompletedSparkOption({ labels: weekly.labels, completedCounts: weekly.completedCounts }));
    window.addEventListener('resize', () => spark.resize());
  }

  const leadDom = document.getElementById('reports-leadtime-chart');
  if (leadDom) {
    const leadChart = echarts.init(leadDom);
    leadChart.setOption(buildLeadTimeOption({
      labels: weekly.labels,
      avgLeadDays: weekly.avgLeadDays,
      trendLeadDays: weekly.trendLeadDays,
      completedCounts: weekly.completedCounts
    }));
    window.addEventListener('resize', () => leadChart.resize());
  }

  // Cumulative Flow Diagram (CFD)
  const cfdDom = document.getElementById('reports-cfd-chart');
  const cfdRangeEl = document.getElementById('reports-cfd-range');
  const cfdIncludeDoneEl = document.getElementById('reports-cfd-include-done');
  if (cfdDom) {
    const cfdChart = echarts.init(cfdDom);

    const updateCfd = () => {
      const rangeDaysRaw = Number.parseInt((cfdRangeEl?.value ?? '90').toString(), 10);
      const rangeDays = Number.isFinite(rangeDaysRaw) ? Math.min(365, Math.max(7, rangeDaysRaw)) : 90;
      const includeDone = cfdIncludeDoneEl ? cfdIncludeDoneEl.checked === true : true;

      const cfdEnd = new Date();
      const cfdStart = new Date();
      cfdStart.setDate(cfdEnd.getDate() - (rangeDays - 1));

      const { labels, seriesDefs } = computeCumulativeFlow({
        tasks,
        columns,
        rangeStart: cfdStart,
        rangeEnd: cfdEnd,
        includeDone
      });

      cfdChart.setOption(buildCfdOption({
        labels,
        seriesDefs,
        boardName: boardName || (boardId || 'Active board')
      }), true);
    };

    updateCfd();
    cfdRangeEl?.addEventListener('change', updateCfd);
    cfdIncludeDoneEl?.addEventListener('change', updateCfd);
    window.addEventListener('resize', () => cfdChart.resize());
  }
}

main();
