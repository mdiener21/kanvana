import * as echarts from 'echarts/core';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { BarChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { loadTimeTracking } from './storage.js';
import { on, off, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import { escapeHtml } from './security.js';
import { DEFAULT_APP_KEYBINDINGS, keyLabel } from './constants.js';
import { colorDotHtml } from './timetracking-markup.js';
import { getChartTheme } from './chart-theme.js';
import { filterEntries, mountEntryFilter } from './timetracking-filter.js';
import { formatDuration, formatYmd } from './timetracking-time.js';
import { summarizePeriod, currentPeriod, shiftPeriod, isSamePeriod } from './timetracking-report.js';

echarts.use([GridComponent, LegendComponent, TooltipComponent, BarChart, CanvasRenderer]);

const MS_PER_HOUR = 3600000;
const EMPTY_MESSAGE = 'No time tracked this month';
const REPORT_FILTER_LABELS = {
  group: 'Filter report',
  customer: 'Filter report by customer',
  project: 'Filter report by project'
};

const { ttPrevMonth, ttNextMonth } = DEFAULT_APP_KEYBINDINGS;
const PREV_MONTH_TITLE = escapeHtml(`Previous month (${keyLabel(ttPrevMonth)})`);
const NEXT_MONTH_TITLE = escapeHtml(`Next month (${keyLabel(ttNextMonth)})`);

const PANEL_HTML = `
  <div class="tt-reports-panel">
    <h2 class="tt-section-title">Reports</h2>
    <div class="tt-report-toolbar">
      <div class="tt-month-nav" role="group" aria-label="Month">
        <button type="button" class="tt-month-btn" data-month="-1" aria-label="Previous month" title="${PREV_MONTH_TITLE}">
          <span data-lucide="chevron-left" aria-hidden="true"></span>
        </button>
        <span class="tt-month-label" data-testid="tt-report-month" aria-live="polite"></span>
        <button type="button" class="tt-month-btn" data-month="1" aria-label="Next month" title="${NEXT_MONTH_TITLE}">
          <span data-lucide="chevron-right" aria-hidden="true"></span>
        </button>
      </div>
      <div class="tt-report-filter"></div>
    </div>
    <dl class="tt-kpis">
      <div class="tt-kpi"><dt id="tt-kpi-total">Total</dt><dd aria-labelledby="tt-kpi-total" data-kpi="total"></dd></div>
      <div class="tt-kpi"><dt id="tt-kpi-entries">Entries</dt><dd aria-labelledby="tt-kpi-entries" data-kpi="entries"></dd></div>
      <div class="tt-kpi"><dt id="tt-kpi-projects">Projects</dt><dd aria-labelledby="tt-kpi-projects" data-kpi="projects"></dd></div>
    </dl>
    <p class="tt-empty tt-report-empty" role="status" hidden>${EMPTY_MESSAGE}</p>
    <div class="tt-report-body">
      <div class="tt-report-card">
        <div class="tt-report-chart" role="img"></div>
      </div>
      <div class="tt-report-card">
        <table class="tt-report-table" aria-label="Time by customer and project">
          <thead>
            <tr><th scope="col">Customer / Project</th><th scope="col" class="tt-num">Duration</th><th scope="col">Share</th></tr>
          </thead>
          <tbody></tbody>
          <tfoot></tfoot>
        </table>
      </div>
    </div>
  </div>
`;

const percent = (share) => `${Math.round(share * 100)}%`;

function tableBodyHtml(summary, durationFormat) {
  return summary.customers.map((customer) => `
    <tr class="tt-report-customer" data-customer-id="${escapeHtml(customer.id)}">
      <th scope="row">${colorDotHtml(customer.color)}${escapeHtml(customer.name)}</th>
      <td class="tt-num">${formatDuration(customer.totalMs, durationFormat)}</td>
      <td></td>
    </tr>
    ${customer.projects.map((project) => `
    <tr class="tt-report-project" data-project-id="${escapeHtml(project.id)}">
      <th scope="row">${colorDotHtml(project.color)}${escapeHtml(project.name)}</th>
      <td class="tt-num">${formatDuration(project.totalMs, durationFormat)}</td>
      <td>
        <span class="tt-share">
          <span class="tt-share-track" aria-hidden="true"><span class="tt-share-fill" style="width:${percent(project.share)};background:${escapeHtml(project.color)};"></span></span>
          <span class="tt-share-value">${percent(project.share)}</span>
        </span>
      </td>
    </tr>`).join('')}`).join('');
}

const tableFootHtml = (summary, durationFormat) => `
  <tr class="tt-report-total">
    <th scope="row">Total</th>
    <td class="tt-num">${formatDuration(summary.totalMs, durationFormat)}</td>
    <td></td>
  </tr>`;

// One stacked bar per calendar-day bucket (week / month periods).
export function dailyChartOption(summary, prefs, theme = getChartTheme()) {
  return {
    animation: false,
    grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      type: 'scroll',
      data: summary.projects.map((p) => p.name),
      textStyle: { color: theme.muted },
      pageTextStyle: { color: theme.muted }
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: ({ seriesName, dataIndex, value, color }) => {
        const date = formatYmd(summary.buckets[dataIndex].start, prefs.dateFormat);
        return `${escapeHtml(date)}<br>${colorDotHtml(color)} ${escapeHtml(seriesName)}: <strong>${formatDuration(value * MS_PER_HOUR, prefs.durationFormat)}</strong>`;
      }
    },
    xAxis: {
      type: 'category',
      data: summary.buckets.map((b) => String(b.start.d)),
      axisLabel: { color: theme.muted, interval: 0, fontSize: 10 },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: theme.muted, formatter: '{value} h' },
      splitLine: { lineStyle: { color: theme.borderSubtle } }
    },
    series: summary.projects.map((project) => ({
      name: project.name,
      type: 'bar',
      stack: 'day',
      barMaxWidth: 28,
      itemStyle: { color: project.color },
      emphasis: { focus: 'series' },
      data: summary.buckets.map((b) => (b.byProject[project.id] ? b.byProject[project.id] / MS_PER_HOUR : null))
    }))
  };
}

const createEChart = (element) => echarts.init(element);

const isVisible = (element) => !element.closest('[hidden]');

// Only Month is offered for now; Week / Year reuse the same period summary.
const PERIOD_KIND = 'month';

export function mountReportsPanel(container, {
  getPrefs,
  getTimeTracking = loadTimeTracking,
  createChart = createEChart
}) {
  container.innerHTML = PANEL_HTML;
  renderIcons(container);

  const label = container.querySelector('.tt-month-label');
  const empty = container.querySelector('.tt-report-empty');
  const body = container.querySelector('.tt-report-body');
  const chartElement = container.querySelector('.tt-report-chart');
  const tbody = container.querySelector('.tt-report-table tbody');
  const tfoot = container.querySelector('.tt-report-table tfoot');
  const kpis = Object.fromEntries([...container.querySelectorAll('[data-kpi]')].map((el) => [el.dataset.kpi, el]));
  const filter = mountEntryFilter(container.querySelector('.tt-report-filter'), {
    getTimeTracking,
    onChange: () => refresh(),
    labels: REPORT_FILTER_LABELS
  });

  let prefs = getPrefs();
  let period = currentPeriod(PERIOD_KIND, prefs.now, prefs.tz);
  // Until the user picks another period, the report tracks "now" (midnight rollover, timezone change).
  let followsCurrentPeriod = true;
  let chart = null;
  let summary = null;

  function renderChart() {
    if (!summary || summary.entryCount === 0 || !isVisible(chartElement)) return;
    chart ??= createChart(chartElement);
    chart.setOption(dailyChartOption(summary, prefs), { notMerge: true });
    chart.resize();
  }

  function refresh() {
    const tt = getTimeTracking();
    prefs = getPrefs();
    if (followsCurrentPeriod) period = currentPeriod(PERIOD_KIND, prefs.now, prefs.tz);
    filter.refresh();
    summary = summarizePeriod(tt, filterEntries(tt, filter.getFilter()), period, { tz: prefs.tz, now: prefs.now });
    const name = summary.label;
    label.textContent = name;
    chartElement.setAttribute('aria-label', `Daily hours by project, ${name}`);
    kpis.total.textContent = formatDuration(summary.totalMs, prefs.durationFormat);
    kpis.entries.textContent = String(summary.entryCount);
    kpis.projects.textContent = String(summary.projectCount);

    const isEmpty = summary.entryCount === 0;
    empty.hidden = !isEmpty;
    body.hidden = isEmpty;
    tbody.innerHTML = tableBodyHtml(summary, prefs.durationFormat);
    tfoot.innerHTML = tableFootHtml(summary, prefs.durationFormat);
    renderChart();
  }

  function step(delta) {
    period = shiftPeriod(period, delta);
    const { now, tz } = getPrefs();
    followsCurrentPeriod = isSamePeriod(period, currentPeriod(PERIOD_KIND, now, tz));
    refresh();
  }

  container.querySelector('.tt-month-nav').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-month]');
    if (btn) step(Number(btn.dataset.month));
  });

  const onResize = () => chart?.resize();
  const themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(renderChart) : null;
  themeObserver?.observe(container.ownerDocument.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', onResize);

  refresh();
  on(DATA_CHANGED, refresh);
  return {
    show: refresh,
    prevMonth: () => step(-1),
    nextMonth: () => step(1),
    focusFilter: () => filter.focus(),
    unmount() {
      off(DATA_CHANGED, refresh);
      window.removeEventListener('resize', onResize);
      themeObserver?.disconnect();
      chart?.dispose();
      filter.unmount();
    }
  };
}
