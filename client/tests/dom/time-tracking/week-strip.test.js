import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountToBody } from '../setup.js';

const state = { customers: [], projects: [], timeEntries: [] };

vi.mock('../../../src/modules/storage.js', () => ({
  loadTimeTracking: vi.fn(() => state),
  loadGlobalSettings: vi.fn(() => ({}))
}));

vi.mock('../../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

vi.mock('../../../src/modules/event-sourcing/emitter.js', async () => {
  const { emit, DATA_CHANGED } = await import('../../../src/modules/events.js');
  return {
    scheduleDomainEvent: vi.fn((event) => {
      if (event.type === 'time_entry.created') state.timeEntries = [...state.timeEntries, event.payload.timeEntry];
      emit(DATA_CHANGED);
      return Promise.resolve();
    })
  };
});

const { mountTimeTracking } = await import('../../../src/modules/timetracking-ui.js');
const { loadGlobalSettings } = await import('../../../src/modules/storage.js');

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

const NOW = '2026-11-12T11:00:00.000Z'; // Thursday 12 Nov 2026, 12:00 in Europe/Berlin
const prefs = () => ({ tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.now() });

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const GLOBEX = { id: 'c2', name: 'Globex', color: '#111111', archived: false };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };
const SUPPORT = { id: 'p2', customerId: 'c2', name: 'Support', color: '#8bc34a', archived: false };

const entry = (id, start, end, extra = {}) => ({ id, projectId: 'p1', description: id, start, end, ...extra });
// Berlin is UTC+1 in November.
const WEEK_ENTRIES = [
  entry('mon', '2026-11-09T07:00:00.000Z', '2026-11-09T15:15:00.000Z'), // 8:15
  entry('tue', '2026-11-10T07:00:00.000Z', '2026-11-10T11:00:00.000Z'), // 4:00
  entry('thu', '2026-11-12T08:00:00.000Z', '2026-11-12T09:30:00.000Z', { projectId: 'p2' }) // 1:30
];

let unmount = null;
const fakeChart = () => ({ setOption() {}, resize() {}, dispose() {} });

function mount(timeEntries = WEEK_ENTRIES) {
  state.customers = [ACME, GLOBEX];
  state.projects = [WEBSITE, SUPPORT];
  state.timeEntries = timeEntries;
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document, { getPrefs: prefs, createChart: fakeChart });
}

const withWeeklyHours = (weeklyHours) => vi.mocked(loadGlobalSettings)
  .mockImplementation(() => ({ timeTracking: { weeklyHours } }));

const strip = () => screen.getByRole('list', { name: 'This week' });
const cells = () => within(strip()).getAllByRole('button');
const cell = (weekday) => cells().find((c) => c.querySelector('.tt-week-day-name').textContent === weekday);
const hours = (weekday) => cell(weekday).querySelector('.tt-week-day-hours').textContent;
const meter = (weekday) => cell(weekday).querySelector('.tt-week-meter');
const fill = (weekday) => meter(weekday).querySelector('.tt-week-meter-fill').style.width;
const weekTotal = () => screen.getByTestId('tt-week-total');
const badge = () => screen.getByTestId('tt-week-balance');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(NOW));
  vi.clearAllMocks();
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
  vi.mocked(loadGlobalSettings).mockImplementation(() => ({}));
});

describe('week strip', () => {
  test('shows the ISO week and seven day cells, Monday to Sunday, in the tracker header', () => {
    mount();
    expect(screen.getByText('Week 46 · 9 – 15 Nov 2026')).toBeTruthy();
    expect(cells().map((c) => c.querySelector('.tt-week-day-name').textContent))
      .toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(cells().map((c) => c.querySelector('.tt-week-day-date').textContent))
      .toEqual(['9', '10', '11', '12', '13', '14', '15']);
  });

  test('each day cell shows its attributed Duration and days without entries show –', () => {
    mount([...WEEK_ENTRIES, entry('late-wed', '2026-11-11T22:00:00.000Z', '2026-11-12T00:30:00.000Z')]);
    expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(hours))
      .toEqual(['8:15', '4:00', '2:30', '1:30', '–', '–', '–']);
    expect(cell('Mon').getAttribute('aria-label')).toBe('Mon 9 Nov, 8:15 logged');
    expect(cell('Fri').getAttribute('aria-label')).toBe('Fri 13 Nov, nothing logged');
  });

  test('with Weekly hours 40 a day at or above Target has a full success meter, a half day a half primary meter', () => {
    withWeeklyHours(40);
    mount();
    expect(fill('Mon')).toBe('100%');
    expect(meter('Mon').classList.contains('is-met')).toBe(true);
    expect(fill('Tue')).toBe('50%');
    expect(meter('Tue').classList.contains('is-met')).toBe(false);
    expect(fill('Wed')).toBe('0%');
  });

  test('a future day has no Target yet, so its meter stays empty however much is logged', () => {
    withWeeklyHours(40);
    mount([...WEEK_ENTRIES, entry('fri', '2026-11-13T07:00:00.000Z', '2026-11-13T09:00:00.000Z')]); // tomorrow, 2:00
    expect(hours('Fri')).toBe('2:00');
    expect(fill('Fri')).toBe('0%');
    expect(meter('Fri').classList.contains('is-met')).toBe(false);
  });

  test('with Weekly hours unset day totals show without meters and the header shows the week total without a Balance', () => {
    mount();
    expect(hours('Mon')).toBe('8:15');
    expect(cells().every((c) => c.querySelector('.tt-week-meter') === null)).toBe(true);
    expect(weekTotal().hidden).toBe(false);
    expect(weekTotal().textContent).toBe('13:45');
    expect(badge().hidden).toBe(true);
  });

  test('the header shows the week total beside its Balance when Weekly hours is set', () => {
    withWeeklyHours(40);
    mount();
    expect(weekTotal().textContent).toBe('13:45');
    expect(badge().hidden).toBe(false);
    expect(badge().querySelector('.tt-week-balance-value').textContent).toBe('−18:15');
  });

  test('highlights today and mutes future days', () => {
    mount();
    expect(cells().filter((c) => c.getAttribute('aria-current') === 'date')).toEqual([cell('Thu')]);
    expect(cells().map((c) => c.classList.contains('is-future'))).toEqual([false, false, false, false, true, true, true]);
  });

  test('clicking a day with entries scrolls its day group into view; a day without entries does nothing', () => {
    const scrolled = [];
    Element.prototype.scrollIntoView = vi.fn(function scrollIntoView() { scrolled.push(this); });
    mount();
    fireEvent.click(cell('Tue'));
    expect(scrolled).toHaveLength(1);
    expect(within(scrolled[0]).getByText('tue')).toBeTruthy();
    expect(scrolled[0].classList.contains('tt-day')).toBe(true);

    fireEvent.click(cell('Wed'));
    expect(scrolled).toHaveLength(1);
    delete Element.prototype.scrollIntoView;
  });

  test('clicking the week total opens the current week in Reports', () => {
    mount();
    fireEvent.click(weekTotal());
    expect(document.getElementById('tt-section-reports').hidden).toBe(false);
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-pressed')).toBe('true');
  });

  test('totals still count all entries under an active list filter', () => {
    withWeeklyHours(40);
    mount();
    fireEvent.change(screen.getByLabelText('Filter by customer'), { target: { value: 'c2' } });
    expect(within(screen.getByRole('region', { name: 'Time entries' })).getAllByRole('listitem')).toHaveLength(1);
    expect(hours('Mon')).toBe('8:15');
    expect(hours('Thu')).toBe('1:30');
    expect(weekTotal().textContent).toBe('13:45');
  });

  test('updates live when a Time Entry is added', () => {
    mount();
    fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'Standup' } });
    fireEvent.input(screen.getByLabelText('Project'), { target: { value: 'website' } });
    fireEvent.input(screen.getByLabelText('Duration'), { target: { value: '1h' } });
    fireEvent.keyDown(screen.getByLabelText('Duration'), { key: 'Enter' });
    expect(hours('Thu')).toBe('2:30');
    expect(weekTotal().textContent).toBe('14:45');
  });
});
