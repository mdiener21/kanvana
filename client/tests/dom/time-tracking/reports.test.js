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

function mount({ durationFormat = 'h:mm', weeklyHours = null, workdays = [1, 2, 3, 4, 5] } = {}) {
  state = makeState();
  prefs = { tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', durationFormat, now: Date.parse('2026-10-12T10:00:00Z') };
  const host = mountToBody('<section id="host"></section>').querySelector('#host');
  const charts = [];
  panel = mountReportsPanel(host, {
    getPrefs: () => prefs,
    getTimeTracking: () => state,
    getSettings: () => ({ weeklyHours, workdays }),
    createChart: () => { const chart = fakeChart(); charts.push(chart); return chart; }
  });
  panel.show();
  return { host, charts, lastOption: () => charts.at(-1).setOption.mock.calls.at(-1)[0] };
}

afterEach(() => { panel?.unmount(); panel = null; });

const monthLabel = () => screen.getByTestId('tt-report-period');
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

  test('prevPeriod() / nextPeriod() (for [ / ]) step the month', () => {
    mount();
    panel.nextPeriod();
    expect(monthLabel().textContent).toBe('November 2026');
    panel.prevPeriod();
    panel.prevPeriod();
    expect(monthLabel().textContent).toBe('September 2026');
  });

  test('month buttons name their shortcut in the tooltip', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Previous month' }).title).toBe('Previous month ([)');
    expect(screen.getByRole('button', { name: 'Next month' }).title).toBe('Next month (])');
  });

  test('re-resolves the current month on show when the month was not changed', () => {
    mount();
    prefs.now = Date.parse('2026-11-02T10:00:00Z');
    panel.show();
    expect(monthLabel().textContent).toBe('November 2026');
  });

  test('keeps a month the user switched to when shown again', () => {
    mount();
    panel.prevPeriod();
    prefs.now = Date.parse('2026-11-02T10:00:00Z');
    panel.show();
    expect(monthLabel().textContent).toBe('September 2026');
  });

  test('follows the current month again after switching back to it', () => {
    mount();
    panel.prevPeriod();
    panel.nextPeriod();
    prefs.now = Date.parse('2026-11-02T10:00:00Z');
    panel.show();
    expect(monthLabel().textContent).toBe('November 2026');
  });

  test('a timezone change re-resolves the current month', () => {
    mount();
    // 31 Oct 23:30 UTC is already 1 Nov in Berlin
    prefs = { ...prefs, tz: 'UTC', now: Date.parse('2026-10-31T23:30:00Z') };
    emit(DATA_CHANGED);
    expect(monthLabel().textContent).toBe('October 2026');
    prefs = { ...prefs, tz: 'Europe/Berlin' };
    emit(DATA_CHANGED);
    expect(monthLabel().textContent).toBe('November 2026');
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
    panel.nextPeriod();
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
    panel.prevPeriod();
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
    panel.nextPeriod();
    expect(screen.getByRole('status').textContent).toBe('No time tracked this month');
    expect(document.querySelector('.tt-report-body').hidden).toBe(true);
    panel.prevPeriod();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.tt-report-body').hidden).toBe(false);
  });

  test('a filter with no matching entries in the month shows the empty state too', () => {
    mount();
    choose(screen.getByLabelText('Filter report by project'), 'p3');
    panel.nextPeriod();
    expect(screen.getByRole('status').textContent).toBe('No time tracked this month');
  });
});

const periodLabel = () => screen.getByTestId('tt-report-period');
const periodButton = (name) => screen.getByRole('button', { name });
const card = () => screen.queryByTestId('tt-balance-card');
const cardValue = (name) => within(card()).getByLabelText(name, { selector: 'dd' });
const addEntries = (...entries) => { state.timeEntries = [...state.timeEntries, ...entries]; emit(DATA_CHANGED); };

describe('Week | Month switch', () => {
  test('defaults to Month, with Month pressed', () => {
    mount();
    expect(periodButton('Month').getAttribute('aria-pressed')).toBe('true');
    expect(periodButton('Week').getAttribute('aria-pressed')).toBe('false');
    expect(periodLabel().textContent).toBe('October 2026');
  });

  test('Week shows the current week with its ISO label, and navigation steps whole weeks', () => {
    mount();
    fireEvent.click(periodButton('Week'));
    expect(periodButton('Week').getAttribute('aria-pressed')).toBe('true');
    expect(periodLabel().textContent).toBe('W42 · 12–18 Oct 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(periodLabel().textContent).toBe('W41 · 5–11 Oct 2026');
    panel.nextPeriod();
    panel.nextPeriod();
    expect(periodLabel().textContent).toBe('W43 · 19–25 Oct 2026');
    expect(screen.getByRole('button', { name: 'Next week' }).title).toBe('Next week (])');
  });

  test('switching back to Month shows the month containing the current day', () => {
    mount();
    fireEvent.click(periodButton('Week'));
    panel.prevPeriod();
    fireEvent.click(periodButton('Month'));
    expect(periodLabel().textContent).toBe('October 2026');
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeTruthy();
  });

  test('the choice is remembered on this device', () => {
    mount();
    fireEvent.click(periodButton('Week'));
    panel.unmount();
    mount();
    expect(periodButton('Week').getAttribute('aria-pressed')).toBe('true');
    expect(periodLabel().textContent).toBe('W42 · 12–18 Oct 2026');
  });

  test('showCurrentPeriod("week") opens the current week from any period', () => {
    mount();
    panel.prevPeriod();
    panel.showCurrentPeriod('week');
    expect(periodLabel().textContent).toBe('W42 · 12–18 Oct 2026');
    expect(periodButton('Week').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('week view', () => {
  test('per-day chart Monday to Sunday and the table for the week', () => {
    const { lastOption } = mount();
    addEntries(
      entry('mon', 'p1', '2026-10-12T07:00:00.000Z', '2026-10-12T09:00:00.000Z'),
      // Sunday 23:30 Berlin still belongs to this week
      entry('sun', 'p3', '2026-10-18T21:30:00.000Z', '2026-10-18T22:30:00.000Z'),
      entry('nextweek', 'p3', '2026-10-19T07:00:00.000Z', '2026-10-19T08:00:00.000Z')
    );
    fireEvent.click(periodButton('Week'));
    const option = lastOption();
    expect(option.xAxis.data).toEqual(['Mon 12', 'Tue 13', 'Wed 14', 'Thu 15', 'Fri 16', 'Sat 17', 'Sun 18']);
    expect(option.series.find((s) => s.name === 'Support').data[6]).toBe(1);
    expect(kpi('Total')).toBe('3:00');
    expect(tableRows()).toEqual([
      ['Acme', '2:00'],
      ['Website', '2:00', '67%'],
      ['Globex <b>', '1:00'],
      ['Support', '1:00', '33%']
    ]);
    expect(screen.getByRole('img', { name: 'Daily hours by project, W42 · 12–18 Oct 2026' })).toBeTruthy();
  });

  test('an empty week says so', () => {
    mount();
    fireEvent.click(periodButton('Week'));
    expect(screen.getByRole('status').textContent).toBe('No time tracked this week');
  });
});

describe('balance card', () => {
  test('a finished month at 40h shows Logged, the full Target and a signed Balance (October: 22 workdays, 176h)', () => {
    mount({ weeklyHours: 40 });
    prefs.now = Date.parse('2026-11-16T10:00:00Z');
    panel.show();
    panel.prevPeriod();
    expect(periodLabel().textContent).toBe('October 2026');
    expect(cardValue('Logged').textContent).toBe('8:30');
    expect(cardValue('Target').textContent).toBe('176:00');
    expect(cardValue('Balance').textContent).toBe('−167:30');
    expect(cardValue('Balance').classList.contains('is-deficit')).toBe(true);
  });

  test('a Monday at 40h over Mon–Fri has a Target of 8:00 so far', () => {
    mount({ weeklyHours: 40 });
    addEntries(entry('mon', 'p1', '2026-10-12T06:00:00.000Z', '2026-10-12T13:35:00.000Z'));
    fireEvent.click(periodButton('Week'));
    expect(cardValue('Logged').textContent).toBe('7:35');
    expect(cardValue('Target').textContent).toBe('8:00');
    expect(cardValue('Balance').textContent).toBe('−0:25');
    expect(cardValue('Balance').classList.contains('is-deficit')).toBe(true);
  });

  test('the current week counts the Target so far including today; a surplus is green', () => {
    mount({ weeklyHours: 40, workdays: [1, 2, 3, 4] });
    addEntries(entry('mon', 'p1', '2026-10-12T06:00:00.000Z', '2026-10-12T17:00:00.000Z'));
    fireEvent.click(periodButton('Week'));
    expect(cardValue('Logged').textContent).toBe('11:00');
    expect(cardValue('Target').textContent).toBe('10:00');
    expect(cardValue('Balance').textContent).toBe('+1:00');
    expect(cardValue('Balance').classList.contains('is-surplus')).toBe(true);
    expect(cardValue('Balance').classList.contains('is-deficit')).toBe(false);
  });

  test('a finished week has a Target of exactly Weekly hours', () => {
    mount({ weeklyHours: 40 });
    fireEvent.click(periodButton('Week'));
    panel.prevPeriod();
    expect(cardValue('Target').textContent).toBe('40:00');
    expect(cardValue('Balance').textContent).toBe('−40:00');
  });

  test('Target and Balance follow the duration-format setting', () => {
    mount({ weeklyHours: 40, durationFormat: 'decimal' });
    fireEvent.click(periodButton('Week'));
    panel.prevPeriod();
    expect(cardValue('Target').textContent).toBe('40.00 h');
    expect(cardValue('Balance').textContent).toBe('−40.00 h');
  });

  test('is hidden when Weekly hours is unset', () => {
    mount();
    expect(card().hidden).toBe(true);
  });

  test('is hidden while a customer or project filter is active, and the logged total still respects the filter', () => {
    mount({ weeklyHours: 40 });
    expect(card().hidden).toBe(false);
    choose(screen.getByLabelText('Filter report by customer'), 'c1');
    expect(card().hidden).toBe(true);
    expect(kpi('Total')).toBe('5:30');
    choose(screen.getByLabelText('Filter report by customer'), '');
    expect(card().hidden).toBe(false);
  });

  test('is hidden for a future period', () => {
    mount({ weeklyHours: 40 });
    panel.nextPeriod();
    expect(card().hidden).toBe(true);
  });

  test('is hidden for a period before the first entry', () => {
    mount({ weeklyHours: 40 });
    panel.prevPeriod();
    expect(card().hidden).toBe(false);
    panel.prevPeriod();
    expect(periodLabel().textContent).toBe('August 2026');
    expect(card().hidden).toBe(true);
  });
});

describe('Year period', () => {
  test('Year is offered in the switch and shows the current year, labelled 2026', () => {
    mount();
    fireEvent.click(periodButton('Year'));
    expect(periodButton('Year').getAttribute('aria-pressed')).toBe('true');
    expect(periodButton('Month').getAttribute('aria-pressed')).toBe('false');
    expect(periodLabel().textContent).toBe('2026');
  });

  test('‹ / › and prevPeriod() / nextPeriod() (for [ / ]) step whole years', () => {
    mount();
    fireEvent.click(periodButton('Year'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(periodLabel().textContent).toBe('2025');
    panel.nextPeriod();
    panel.nextPeriod();
    expect(periodLabel().textContent).toBe('2027');
    panel.prevPeriod();
    expect(periodLabel().textContent).toBe('2026');
    expect(screen.getByRole('button', { name: 'Next year' }).title).toBe('Next year (])');
  });

  test('the choice is remembered on this device', () => {
    mount();
    fireEvent.click(periodButton('Year'));
    panel.unmount();
    mount();
    expect(periodButton('Year').getAttribute('aria-pressed')).toBe('true');
    expect(periodLabel().textContent).toBe('2026');
  });

  test('per-month stacked bars (12 buckets) and the table for the year', () => {
    const { lastOption } = mount();
    addEntries(entry('newyear', 'p1', '2026-12-31T23:30:00.000Z', '2027-01-01T00:30:00.000Z')); // 1 Jan 2027 00:30 Berlin
    fireEvent.click(periodButton('Year'));
    const option = lastOption();
    expect(option.xAxis.data).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(option.series.map((s) => [s.name, s.type])).toEqual([['Website', 'bar'], ['Support', 'bar'], ['Backend', 'bar']]);
    expect(new Set(option.series.map((s) => s.stack)).size).toBe(1);
    const support = option.series.find((s) => s.name === 'Support');
    expect(support.data).toHaveLength(12);
    expect(support.data[8]).toBe(1.25);
    expect(support.data[9]).toBe(3);
    expect(option.series.find((s) => s.name === 'Website').data[11]).toBeNull();
    expect(kpi('Total')).toBe('9:45');
    expect(tableRows()).toEqual([
      ['Acme', '5:30'],
      ['Website', '5:00', '51%'],
      ['Backend', '0:30', '5%'],
      ['Globex <b>', '4:15'],
      ['Support', '4:15', '44%']
    ]);
    expect(screen.getByRole('img', { name: 'Monthly hours by project, 2026' })).toBeTruthy();
  });

  test('the year tooltip names the month, project and duration', () => {
    const { lastOption } = mount();
    fireEvent.click(periodButton('Year'));
    const html = lastOption().tooltip.formatter({ seriesName: 'Support', dataIndex: 9, value: 3, color: '#8bc34a' });
    expect(html).toContain('October 2026');
    expect(html).toContain('Support');
    expect(html).toContain('3:00');
  });

  test('an empty year says so', () => {
    mount();
    fireEvent.click(periodButton('Year'));
    panel.nextPeriod();
    expect(screen.getByRole('status').textContent).toBe('No time tracked this year');
  });
});

describe('year balance card', () => {
  test('a finished 2026 at 40h has a Target of 2088h (261 workdays)', () => {
    mount({ weeklyHours: 40 });
    addEntries(entry('jan1', 'p1', '2026-01-01T08:00:00.000Z', '2026-01-01T10:00:00.000Z'));
    prefs.now = Date.parse('2027-01-10T10:00:00Z');
    fireEvent.click(periodButton('Year'));
    panel.prevPeriod();
    expect(periodLabel().textContent).toBe('2026');
    expect(cardValue('Logged').textContent).toBe('11:45');
    expect(cardValue('Target').textContent).toBe('2088:00');
    expect(cardValue('Balance').textContent).toBe('−2076:15');
    expect(cardValue('Balance').classList.contains('is-deficit')).toBe(true);
  });

  test('the current year counts so far, from the first entry when that falls mid-year', () => {
    mount({ weeklyHours: 40 });
    fireEvent.click(periodButton('Year'));
    // 10 Sep (first entry) – 12 Oct (today) = 23 workdays × 8h
    expect(cardValue('Target').textContent).toBe('184:00');
    expect(cardValue('Balance').textContent).toBe('−174:15');
  });

  test('the Balance resets on 1 January', () => {
    mount({ weeklyHours: 35 });
    prefs.now = Date.parse('2027-01-02T10:00:00Z');
    fireEvent.click(periodButton('Year'));
    expect(periodLabel().textContent).toBe('2027');
    expect(cardValue('Logged').textContent).toBe('0:00');
    // Fri 1 – Sat 2 Jan 2027: one workday
    expect(cardValue('Target').textContent).toBe('7:00');
    expect(cardValue('Balance').textContent).toBe('−7:00');
  });

  test('is hidden when filtered, for a future year and for a year before the first entry', () => {
    mount({ weeklyHours: 40 });
    fireEvent.click(periodButton('Year'));
    expect(card().hidden).toBe(false);
    choose(screen.getByLabelText('Filter report by customer'), 'c1');
    expect(card().hidden).toBe(true);
    choose(screen.getByLabelText('Filter report by customer'), '');
    panel.nextPeriod();
    expect(card().hidden).toBe(true);
    panel.prevPeriod();
    panel.prevPeriod();
    expect(periodLabel().textContent).toBe('2025');
    expect(card().hidden).toBe(true);
  });
});
