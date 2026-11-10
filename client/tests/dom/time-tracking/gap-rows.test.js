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
      if (event.type === 'time_entry.updated') {
        state.timeEntries = state.timeEntries.map((e) => (e.id === event.entityId ? { ...e, ...event.payload.fields } : e));
      }
      if (event.type === 'time_entry.deleted') state.timeEntries = state.timeEntries.filter((e) => e.id !== event.entityId);
      emit(DATA_CHANGED);
      return Promise.resolve();
    })
  };
});

const { mountTimeTracking } = await import('../../../src/modules/timetracking-ui.js');
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');
const { emit, DATA_CHANGED } = await import('../../../src/modules/events.js');

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

const NOW = '2026-10-08T14:00:00.000Z'; // 16:00 in Europe/Berlin (CEST, UTC+2)
const prefs = () => ({ tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.now() });

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const GLOBEX = { id: 'c2', name: 'Globex', color: '#000000', archived: false };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };
const LIME = { id: 'p2', customerId: 'c2', name: 'Lime', color: '#8bc34a', archived: false };

let unmount = null;
const fakeChart = () => ({ setOption() {}, resize() {}, dispose() {} });
const entry = (id, start, end, projectId = 'p1') => ({ id, projectId, description: id, start, end });

// Today in Berlin: 09:00–10:30 (p1), 10:45–12:45 (p2) → one 15-minute gap.
const MORNING = entry('morning', '2026-10-08T07:00:00.000Z', '2026-10-08T08:30:00.000Z');
const MIDDAY = entry('midday', '2026-10-08T08:45:00.000Z', '2026-10-08T10:45:00.000Z', 'p2');

function mount(timeEntries) {
  state.customers = [ACME, GLOBEX];
  state.projects = [WEBSITE, LIME];
  state.timeEntries = timeEntries;
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document, { getPrefs: prefs, createChart: fakeChart });
}

const entryList = () => screen.getByRole('region', { name: 'Time entries' });
const bar = () => screen.getByRole('group', { name: 'New time entry' });
const field = (name) => within(bar()).getByLabelText(name);
const gapRows = () => [...entryList().querySelectorAll('.tt-gap-row')];
const rowOrder = () => [...entryList().querySelectorAll('.tt-day-entries > li')]
  .map((li) => li.dataset.entryId ?? `gap ${li.querySelector('.tt-gap-span').textContent}`);
const count = () => screen.getByLabelText('Entry count').textContent;
const key = (k) => fireEvent.keyDown(document.body, { key: k });
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const selectedId = () => entryList().querySelector('[aria-current="true"]')?.dataset.entryId ?? null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('untracked gap rows', () => {
  test('a gap row sits between the two entries it separates, with its span, minutes and a Fill button', () => {
    mount([MORNING, MIDDAY]);
    expect(rowOrder()).toEqual(['midday', 'gap 10:30 – 10:45', 'morning']);
    const [row] = gapRows();
    expect(text(row)).toBe('10:30 – 10:45 · 15 min untracked Fill');
    expect(text(within(row).getByRole('button', { name: 'Fill 10:30 – 10:45' }))).toBe('Fill');
  });

  test('gap rows are hidden while a customer or project filter is active', () => {
    mount([MORNING, MIDDAY]);
    const customer = screen.getByLabelText('Filter by customer');
    fireEvent.change(customer, { target: { value: 'c1' } });
    expect(gapRows()).toHaveLength(0);
    fireEvent.change(customer, { target: { value: '' } });
    expect(gapRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Filter by project'), { target: { value: 'p1' } });
    expect(gapRows()).toHaveLength(0);
  });

  test('Fill puts the gap into Date, Start and End, keeps Project and Description, focuses Description and saves nothing', () => {
    mount([MORNING, MIDDAY]);
    fireEvent.input(field('Description'), { target: { value: 'Review' } });
    field('Project').value = 'Globex / Lime';
    fireEvent.click(within(gapRows()[0]).getByRole('button', { name: /^Fill/ }));

    expect(field('Date').value).toBe('08.10.2026');
    expect(field('Start').value).toBe('10:30');
    expect(field('End').value).toBe('10:45');
    expect(field('Duration').value).toBe('0:15');
    expect(field('Project').value).toBe('Globex / Lime');
    expect(field('Description').value).toBe('Review');
    expect(document.activeElement).toBe(field('Description'));
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
    expect(state.timeEntries).toHaveLength(2);
  });

  test('Fill then Enter adds the entry and the gap disappears', () => {
    mount([MORNING, MIDDAY]);
    field('Project').value = 'Acme / Website';
    fireEvent.click(within(gapRows()[0]).getByRole('button', { name: /^Fill/ }));
    fireEvent.keyDown(field('Description'), { key: 'Enter' });
    expect(state.timeEntries).toHaveLength(3);
    expect(gapRows()).toHaveLength(0);
  });

  test('j / k skip gap rows and the entry count excludes them', () => {
    mount([MORNING, MIDDAY]);
    expect(count()).toBe('2 entries');
    key('j');
    expect(selectedId()).toBe('midday');
    key('j');
    expect(selectedId()).toBe('morning');
    key('k');
    expect(selectedId()).toBe('midday');
  });

  test('gaps are recomputed when entries arrive from sync, are edited or deleted', () => {
    mount([MORNING]);
    expect(gapRows()).toHaveLength(0);
    state.timeEntries = [MORNING, MIDDAY];
    emit(DATA_CHANGED);
    expect(gapRows()).toHaveLength(1);
    state.timeEntries = [MORNING, { ...MIDDAY, start: '2026-10-08T08:30:00.000Z' }];
    emit(DATA_CHANGED);
    expect(gapRows()).toHaveLength(0);
    state.timeEntries = [MORNING, { ...MIDDAY, start: '2026-10-08T09:00:00.000Z' }];
    emit(DATA_CHANGED);
    expect(text(gapRows()[0])).toBe('10:30 – 11:00 · 30 min untracked Fill');
    state.timeEntries = [MIDDAY];
    emit(DATA_CHANGED);
    expect(gapRows()).toHaveLength(0);
  });
});
