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
import { formatDuration, formatYmd, formatShortWeekday, formatShortMonth, formatMonthYear, HOUR_MS } from './timetracking-time.js';
import { summarizePeriod, currentPeriod, shiftPeriod, isSamePeriod, WEEK, MONTH, YEAR } from './timetracking-report.js';
import { showBalance } from './timetracking-balance.js';
import { loadTimeTrackingSettings, loadReportPeriodKind, rememberReportPeriodKind } from './timetracking-settings.js';

echarts.use([GridComponent, LegendComponent, TooltipComponent, BarChart, CanvasRenderer]);

const REPORT_FILTER_LABELS = {
  group: 'Filter report',
  customer: 'Filter report by customer',
  project: 'Filter report by project'
};

const { ttPrevMonth: ttPrevPeriod, ttNextMonth: ttNextPeriod } = DEFAULT_APP_KEYBINDINGS;

const dayTooltip = (ymd, prefs) => formatYmd(ymd, prefs.dateFormat);

// The periods offered by the switch, in display order, with how each labels its chart buckets.
const PERIOD_VIEWS = {
  [WEEK]: { label: 'Week', axis: (ymd) => `${formatShortWeekday(ymd)} ${ymd.d}`, tooltip: dayTooltip, chartName: 'Daily' },
  [MONTH]: { label: 'Month', axis: ({ d }) => String(d), tooltip: dayTooltip, chartName: 'Daily' },
  [YEAR]: { label: 'Year', axis: formatShortMonth, tooltip: formatMonthYear, chartName: 'Monthly' }
};
const DEFAULT_PERIOD_KIND = MONTH;
const offeredKind = (kind) => (Object.hasOwn(PERIOD_VIEWS, kind) ? kind : DEFAULT_PERIOD_KIND);

const PANEL_HTML = `
  <div class="tt-reports-panel">
    <h2 class="tt-section-title">Reports</h2>
    <div class="tt-report-toolbar">
      <div class="tt-period-switch" role="group" aria-label="Report period">
        ${Object.entries(PERIOD_VIEWS).map(([kind, { label }]) => `<button type="button" class="tt-period-option" data-period-kind="${kind}" aria-pressed="false">${label}</button>`).join('')}
      </div>
      <div class="tt-period-nav" role="group" aria-label="Period">
        <button type="button" class="tt-period-btn" data-step="-1">
          <span data-lucide="chevron-left" aria-hidden="true"></span>
        </button>
        <span class="tt-period-label" data-testid="tt-report-period" aria-live="polite"></span>
        <button type="button" class="tt-period-btn" data-step="1">
          <span data-lucide="chevron-right" aria-hidden="true"></span>
        </button>
      </div>
      <div class="tt-report-filter"></div>
    </div>
    <dl class="tt-balance-card" data-testid="tt-balance-card" aria-label="Balance" hidden>
      <div class="tt-balance-item"><dt id="tt-balance-logged">Logged</dt><dd aria-labelledby="tt-balance-logged" data-balance="logged"></dd></div>
      <div class="tt-balance-item"><dt id="tt-balance-target">Target</dt><dd aria-labelledby="tt-balance-target" data-balance="target"></dd></div>
      <div class="tt-balance-item"><dt id="tt-balance-balance">Balance</dt><dd aria-labelledby="tt-balance-balance" data-balance="balance"></dd></div>
    </dl>
    <dl class="tt-kpis">
      <div class="tt-kpi"><dt id="tt-kpi-total">Total</dt><dd aria-labelledby="tt-kpi-total" data-kpi="total"></dd></div>
      <div class="tt-kpi"><dt id="tt-kpi-entries">Entries</dt><dd aria-labelledby="tt-kpi-entries" data-kpi="entries"></dd></div>
      <div class="tt-kpi"><dt id="tt-kpi-projects">Projects</dt><dd aria-labelledby="tt-kpi-projects" data-kpi="projects"></dd></div>
    </dl>
    <p class="tt-empty tt-report-empty" role="status" hidden></p>
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

// One stacked bar per bucket: a calendar day (week / month periods) or a month (year period).
export function periodChartOption(summary, prefs, theme = getChartTheme()) {
  const bucket = PERIOD_VIEWS[summary.period.kind];
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
        const heading = bucket.tooltip(summary.buckets[dataIndex].start, prefs);
        return `${escapeHtml(heading)}<br>${colorDotHtml(color)} ${escapeHtml(seriesName)}: <strong>${formatDuration(value * HOUR_MS, prefs.durationFormat)}</strong>`;
      }
    },
    xAxis: {
      type: 'category',
      data: summary.buckets.map((b) => bucket.axis(b.start)),
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
      data: summary.buckets.map((b) => (b.byProject[project.id] ? b.byProject[project.id] / HOUR_MS : null))
    }))
  };
}

const createEChart = (element) => echarts.init(element);

const isVisible = (element) => !element.closest('[hidden]');

const isFiltered = ({ customerId, projectId }) => !!(customerId || projectId);

export function mountReportsPanel(container, {
  getPrefs,
  getTimeTracking = loadTimeTracking,
  getSettings = loadTimeTrackingSettings,
  createChart = createEChart
}) {
  container.innerHTML = PANEL_HTML;
  renderIcons(container);

  const label = container.querySelector('.tt-period-label');
  const kindButtons = [...container.querySelectorAll('[data-period-kind]')];
  const [prevButton, nextButton] = container.querySelectorAll('.tt-period-btn');
  const balanceCard = container.querySelector('.tt-balance-card');
  const balanceValues = Object.fromEntries([...balanceCard.querySelectorAll('[data-balance]')].map((el) => [el.dataset.balance, el]));
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
  let kind = offeredKind(loadReportPeriodKind());
  let period = currentPeriod(kind, prefs.now, prefs.tz);
  // Until the user picks another period, the report tracks "now" (midnight rollover, timezone change).
  let followsCurrentPeriod = true;
  let chart = null;
  let summary = null;

  function renderChart() {
    if (!summary || summary.entryCount === 0 || !isVisible(chartElement)) return;
    chart ??= createChart(chartElement);
    chart.setOption(periodChartOption(summary, prefs), { notMerge: true });
    chart.resize();
  }

  function renderPeriodControls() {
    for (const button of kindButtons) button.setAttribute('aria-pressed', String(button.dataset.periodKind === kind));
    for (const [button, direction, binding] of [[prevButton, 'Previous', ttPrevPeriod], [nextButton, 'Next', ttNextPeriod]]) {
      button.setAttribute('aria-label', `${direction} ${kind}`);
      button.title = `${direction} ${kind} (${keyLabel(binding)})`;
    }
    empty.textContent = `No time tracked this ${kind}`;
  }

  // Target / Balance compare against the whole contract, so a filtered report shows none.
  function renderBalance(filtered) {
    const show = !filtered && summary.target !== null;
    balanceCard.hidden = !show;
    if (!show) return;
    balanceValues.logged.textContent = formatDuration(summary.totalMs, prefs.durationFormat);
    balanceValues.target.textContent = formatDuration(summary.target, prefs.durationFormat);
    showBalance(balanceValues.balance, summary.balance, prefs.durationFormat);
  }

  function refresh() {
    const tt = getTimeTracking();
    prefs = getPrefs();
    if (followsCurrentPeriod) period = currentPeriod(kind, prefs.now, prefs.tz);
    filter.refresh();
    const activeFilter = filter.getFilter();
    summary = summarizePeriod(tt, filterEntries(tt, activeFilter), period, {
      tz: prefs.tz, now: prefs.now, weeklyHours: getSettings().weeklyHours
    });
    const name = summary.label;
    label.textContent = name;
    renderPeriodControls();
    renderBalance(isFiltered(activeFilter));
    chartElement.setAttribute('aria-label', `${PERIOD_VIEWS[kind].chartName} hours by project, ${name}`);
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
    followsCurrentPeriod = isSamePeriod(period, currentPeriod(kind, now, tz));
    refresh();
  }

  function showCurrentPeriod(nextKind) {
    kind = offeredKind(nextKind);
    followsCurrentPeriod = true;
    refresh();
  }

  container.querySelector('.tt-period-nav').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-step]');
    if (btn) step(Number(btn.dataset.step));
  });
  container.querySelector('.tt-period-switch').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-period-kind]');
    if (!btn) return;
    showCurrentPeriod(btn.dataset.periodKind);
    rememberReportPeriodKind(kind);
  });

  const onResize = () => chart?.resize();
  const themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(renderChart) : null;
  themeObserver?.observe(container.ownerDocument.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', onResize);

  refresh();
  on(DATA_CHANGED, refresh);
  return {
    show: refresh,
    prevPeriod: () => step(-1),
    nextPeriod: () => step(1),
    showCurrentPeriod,
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
