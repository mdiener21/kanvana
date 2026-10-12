import { afterEach, describe, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
import { mountToBody } from '../setup.js';

vi.mock('../../../src/modules/storage.js', () => ({
  loadTimeTracking: vi.fn(() => ({ customers: [], projects: [], timeEntries: [] })),
  loadGlobalSettings: vi.fn(() => ({}))
}));

vi.mock('../../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

const { mountReportsPanel } = await import('../../../src/modules/timetracking-reports-panel.js');
const { emit, DATA_CHANGED } = await import('../../../src/modules/events.js');

const H = 3600000;
const entry = (id, projectId, start, end) => ({ id, projectId, description: '', start, end });

function makeState() {
  return {
    customers: [
      { id: 'c1', name: 'Acme', color: '#000000', archived: false },
      { id: 'c2', name: 'Globex <b>', color: '#111111', archived: false }
    ],
    projects: [
      { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false },
      { id: 'p2', customerId: 'c1', name: 'Backend', color: '#e91e63', archived: false },
      { id: 'p3', customerId: 'c2', name: 'Support', color: '#8bc34a', archived: false }
    ],
    timeEntries: [
      entry('a', 'p1', '2026-10-01T07:00:00.000Z', '2026-10-01T08:00:00.000Z'),
      entry('b', 'p2', '2026-10-01T09:00:00.000Z', '2026-10-01T09:30:00.000Z'),
      entry('c', 'p3', '2026-10-02T07:00:00.000Z', '2026-10-02T10:00:00.000Z'),
      // 31 Oct 22:00 → 1 Nov 02:00 Berlin: belongs to October
      entry('overnight', 'p1', '2026-10-31T21:00:00.000Z', '2026-11-01T01:00:00.000Z'),
      entry('sep', 'p3', '2026-09-10T07:00:00.000Z', '2026-09-10T08:15:00.000Z')
    ]
  };
}

let state;
let panel = null;
let prefs;

function fakeChart() {
  return { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
}

function mount({ durationFormat = 'h:mm' } = {}) {
  state = makeState();
  prefs = { tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', durationFormat, now: Date.parse('2026-10-12T10:00:00Z') };
  const host = mountToBody('<section id="host"></section>').querySelector('#host');
  const charts = [];
  panel = mountReportsPanel(host, {
    getPrefs: () => prefs,
    getTimeTracking: () => state,
    createChart: () => { const chart = fakeChart(); charts.push(chart); return chart; }
  });
  panel.show();
  return { host, charts, lastOption: () => charts.at(-1).setOption.mock.calls.at(-1)[0] };
}

afterEach(() => { panel?.unmount(); panel = null; });

const monthLabel = () => screen.getByTestId('tt-report-month');
const kpi = (name) => screen.getByLabelText(name, { selector: 'dd' }).textContent;
const tableRows = () => [...document.querySelectorAll('.tt-report-table tbody tr')]
  .map((row) => [...row.cells].map((cell) => cell.textContent.trim()).filter(Boolean));
const grandTotal = () => document.querySelector('.tt-report-table tfoot td').textContent.trim();
const choose = (select, value) => fireEvent.change(select, { target: { value } });

describe('month navigation', () => {
  test('defaults to the current month in the user timezone', () => {
    mount();
    expect(monthLabel().textContent).toBe('October 2026');
  });

  test('‹ / › buttons switch the month and the label follows', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(monthLabel().textContent).toBe('September 2026');
    expect(kpi('Total')).toBe('1:15');
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(monthLabel().textContent).toBe('November 2026');
  });

  test('prevMonth() / nextMonth() (for [ / ]) step the month', () => {
    mount();
    panel.nextMonth();
    expect(monthLabel().textContent).toBe('November 2026');
    panel.prevMonth();
    panel.prevMonth();
    expect(monthLabel().textContent).toBe('September 2026');
  });
});

describe('KPIs and table', () => {
  test('KPIs: total duration, number of entries, number of projects', () => {
    mount();
    expect(kpi('Total')).toBe('8:30');
    expect(kpi('Entries')).toBe('4');
    expect(kpi('Projects')).toBe('3');
  });

  test('table: customers by total → projects by total with share; grand total matches the KPI', () => {
    mount();
    expect(tableRows()).toEqual([
      ['Acme', '5:30'],
      ['Website', '5:00', '59%'],
      ['Backend', '0:30', '6%'],
      ['Globex <b>', '3:00'],
      ['Support', '3:00', '35%']
    ]);
    expect(grandTotal()).toBe(kpi('Total'));
    const bar = document.querySelector('[data-project-id="p1"] .tt-share-fill');
    expect(bar.style.width).toBe('59%');
    expect(bar.style.background).toBeTruthy();
  });

  test('an entry from 31st 22:00 to 1st 02:00 counts entirely to the earlier month', () => {
    mount();
    panel.nextMonth();
    expect(kpi('Total')).toBe('0:00');
    expect(kpi('Entries')).toBe('0');
  });

  test('durations follow the duration-format setting', () => {
    mount({ durationFormat: 'decimal' });
    expect(kpi('Total')).toBe('8.50 h');
    expect(grandTotal()).toBe('8.50 h');
  });

  test('refreshes when the data changes', () => {
    mount();
    state.timeEntries = [...state.timeEntries, entry('new', 'p2', '2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z')];
    emit(DATA_CHANGED);
    expect(kpi('Total')).toBe('9:30');
  });
});

describe('filters', () => {
  test('reuses the entry filter controls; they apply to KPIs, chart and table', () => {
    const { lastOption } = mount();
    const filterGroup = screen.getByRole('group', { name: 'Filter report' });
    choose(within(filterGroup).getByLabelText('Filter report by customer'), 'c1');
    expect(kpi('Total')).toBe('5:30');
    expect(kpi('Entries')).toBe('3');
    expect(kpi('Projects')).toBe('2');
    expect(tableRows().map((r) => r[0])).toEqual(['Acme', 'Website', 'Backend']);
    expect(lastOption().series.map((s) => s.name)).toEqual(['Website', 'Backend']);

    choose(within(filterGroup).getByLabelText('Filter report by project'), 'p2');
    expect(kpi('Total')).toBe('0:30');
    expect(lastOption().series.map((s) => s.name)).toEqual(['Backend']);
  });

  test('the filter is kept when switching months', () => {
    mount();
    choose(screen.getByLabelText('Filter report by customer'), 'c2');
    panel.prevMonth();
    expect(kpi('Total')).toBe('1:15');
    expect(tableRows().map((r) => r[0])).toEqual(['Globex <b>', 'Support']);
  });
});

describe('chart', () => {
  test('one bar per calendar day, stacked series per project in the project colour, with a legend', () => {
    const { lastOption } = mount();
    const option = lastOption();
    expect(option.xAxis.data).toHaveLength(31);
    expect(option.xAxis.data[0]).toBe('1');
    expect(option.xAxis.data[30]).toBe('31');
    expect(option.series.map((s) => [s.name, s.type, s.stack, s.itemStyle.color])).toEqual([
      ['Website', 'bar', 'day', '#03a9f4'],
      ['Support', 'bar', 'day', '#8bc34a'],
      ['Backend', 'bar', 'day', '#e91e63']
    ]);
    const website = option.series[0];
    expect(website.data).toHaveLength(31);
    expect(website.data[0]).toBe(1);
    expect(website.data[30]).toBe(4);
    expect(website.data[1]).toBeNull();
    expect(option.legend.data).toEqual(['Website', 'Support', 'Backend']);
  });

  test('tooltip shows the day, project and duration in the duration format', () => {
    const { lastOption } = mount();
    const { formatter } = lastOption().tooltip;
    const html = formatter({ seriesName: 'Globex <b>', dataIndex: 1, value: 3, color: '#8bc34a' });
    expect(html).toContain('02.10.2026');
    expect(html).toContain('Globex &lt;b&gt;');
    expect(html).toContain('3:00');
  });

  test('chart is created only once the section is visible, and is resized on show', () => {
    state = makeState();
    prefs = { tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', durationFormat: 'h:mm', now: Date.parse('2026-10-12T10:00:00Z') };
    const host = mountToBody('<section id="host" hidden></section>').querySelector('#host');
    const createChart = vi.fn(fakeChart);
    panel = mountReportsPanel(host, { getPrefs: () => prefs, getTimeTracking: () => state, createChart });
    expect(createChart).not.toHaveBeenCalled();
    host.hidden = false;
    panel.show();
    expect(createChart).toHaveBeenCalledTimes(1);
    expect(createChart.mock.results[0].value.resize).toHaveBeenCalled();
  });

  test('the chart is described for assistive technology', () => {
    mount();
    expect(screen.getByRole('img', { name: 'Daily hours by project, October 2026' })).toBeTruthy();
  });
});

describe('empty month', () => {
  test('shows "No time tracked this month" and hides chart and table', () => {
    mount();
    panel.nextMonth();
    expect(screen.getByRole('status').textContent).toBe('No time tracked this month');
    expect(document.querySelector('.tt-report-body').hidden).toBe(true);
    panel.prevMonth();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.tt-report-body').hidden).toBe(false);
  });

  test('a filter with no matching entries in the month shows the empty state too', () => {
    mount();
    choose(screen.getByLabelText('Filter report by project'), 'p3');
    panel.nextMonth();
    expect(screen.getByRole('status').textContent).toBe('No time tracked this month');
  });
});
