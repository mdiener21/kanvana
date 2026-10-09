import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountToBody } from '../setup.js';

const state = { customers: [], projects: [], timeEntries: [] };
const global = { settings: {} };

vi.mock('../../../src/modules/storage.js', () => ({
  loadTimeTracking: vi.fn(() => state),
  loadGlobalSettings: vi.fn(() => global.settings)
}));

vi.mock('../../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

vi.mock('../../../src/modules/event-sourcing/emitter.js', async () => {
  const { emit, DATA_CHANGED } = await import('../../../src/modules/events.js');
  return {
    scheduleDomainEvent: vi.fn((event) => {
      if (event.type === 'settings.updated' && event.scope === 'global') {
        global.settings = { ...global.settings, ...event.payload.fields };
      }
      if (event.type === 'time_entry.created') state.timeEntries = [...state.timeEntries, event.payload.timeEntry];
      emit(DATA_CHANGED);
      return Promise.resolve();
    })
  };
});

const { mountTimeTracking } = await import('../../../src/modules/timetracking-ui.js');
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

const NOW = '2026-10-08T10:00:00.000Z'; // 12:00 in Europe/Berlin

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const BETA = { id: 'c2', name: 'Beta', color: '#111111', archived: false };
const GONE = { id: 'c3', name: 'Gone', color: '#222222', archived: true };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };
const SHOP = { id: 'p2', customerId: 'c1', name: 'Shop', color: '#e91e63', archived: false };
const OLD = { id: 'p3', customerId: 'c2', name: 'Old', color: '#8bc34a', archived: true };
const APP = { id: 'p4', customerId: 'c2', name: 'App', color: '#ff9800', archived: false };

// 22:30 UTC on the 8th is 00:30 on the 9th in Berlin; 7.5 h long.
const LATE = {
  id: 'e1', projectId: 'p1', description: 'Late deploy',
  start: '2026-10-08T22:30:00.000Z', end: '2026-10-09T06:00:00.000Z'
};

let unmount = null;

function mount({ settings = { timezone: 'Europe/Berlin' }, timeEntries = [] } = {}) {
  state.customers = [ACME, BETA, GONE];
  state.projects = [WEBSITE, SHOP, OLD, APP];
  state.timeEntries = timeEntries;
  global.settings = { timeTracking: settings };
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document);
  fireEvent.click(document.getElementById('tt-nav-settings'));
}

const settingsSection = () => document.getElementById('tt-section-settings');
const setting = (name) => within(settingsSection()).getByLabelText(name);
const choose = (name, value) => fireEvent.change(setting(name), { target: { value } });
const optionLabels = (name) => [...setting(name).options].map((o) => o.textContent);
const preview = (name) => within(settingsSection()).getByTestId(`tt-preview-${name}`).textContent;
const entryList = () => document.querySelector('.tt-entry-list');
const barValue = (name) => within(document.querySelector('.tt-entry-bar')).getByLabelText(name).value;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.clearAllMocks();
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
});

describe('Settings section', () => {
  test('shows all six settings with the spec options and defaults', () => {
    mount({ settings: {} });
    expect(setting('Default customer').value).toBe('');
    expect(optionLabels('Default customer')).toEqual(['None', 'Acme', 'Beta']);
    expect(setting('Default project').value).toBe('');
    expect(optionLabels('Date format')).toEqual(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);
    expect(setting('Date format').value).toBe('DD.MM.YYYY');
    expect(optionLabels('Time format')).toEqual(['24-hour', '12-hour']);
    expect(setting('Time format').value).toBe('24h');
    expect(setting('Timezone').value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(optionLabels('Timezone')).toContain('Europe/Berlin');
    expect(optionLabels('Duration format')).toEqual(['h:mm (7:30)', 'Decimal (7.50 h)']);
    expect(setting('Duration format').value).toBe('h:mm');
  });

  test('live preview shows the current date, time and a sample duration and updates on change', () => {
    mount();
    expect(preview('date')).toBe('08.10.2026');
    expect(preview('time')).toBe('12:00');
    expect(preview('duration')).toBe('7:30');

    choose('Date format', 'YYYY-MM-DD');
    choose('Time format', '12h');
    choose('Duration format', 'decimal');
    expect(preview('date')).toBe('2026-10-08');
    expect(preview('time')).toBe('12:00 PM');
    expect(preview('duration')).toBe('7.50 h');

    choose('Timezone', 'America/New_York');
    expect(preview('time')).toBe('6:00 AM');
  });

  test('changes are saved to the global settings layer', () => {
    mount();
    choose('Date format', 'MM/DD/YYYY');
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'settings.updated',
      scope: 'global',
      payload: { fields: { timeTracking: expect.objectContaining({ dateFormat: 'MM/DD/YYYY' }) } }
    }));
  });

  test('default project offers only active projects of the default customer; changing the customer resets it', () => {
    mount();
    expect(setting('Default project').disabled).toBe(true);

    choose('Default customer', 'c1');
    expect(optionLabels('Default project')).toEqual(['None', 'Website', 'Shop']);
    expect(setting('Default project').value).toBe('p1');

    choose('Default project', 'p2');
    expect(setting('Default project').value).toBe('p2');

    choose('Default customer', 'c2');
    expect(optionLabels('Default project')).toEqual(['None', 'App']);
    expect(setting('Default project').value).toBe('p4');
  });

  test('re-renders from settings synced from another device', async () => {
    mount();
    const { emit, DATA_CHANGED } = await import('../../../src/modules/events.js');
    global.settings = { timeTracking: { timezone: 'Europe/Berlin', dateFormat: 'YYYY-MM-DD' } };
    emit(DATA_CHANGED);
    expect(setting('Date format').value).toBe('YYYY-MM-DD');
    expect(preview('date')).toBe('2026-10-08');
  });
});

describe('the page follows the settings', () => {
  test('changing a format re-renders the entry list, day totals and entry bar', () => {
    mount({ timeEntries: [LATE] });
    const row = () => entryList().querySelector('.tt-entry-row');
    expect(row().querySelector('.tt-entry-range').textContent).toBe('00:30 – 08:00');
    expect(row().querySelector('.tt-entry-duration').textContent).toBe('7:30');
    expect(barValue('Start')).toBe('12:00');

    choose('Time format', '12h');
    choose('Duration format', 'decimal');
    choose('Date format', 'YYYY-MM-DD');

    expect(row().querySelector('.tt-entry-range').textContent).toBe('12:30 AM – 8:00 AM');
    expect(row().querySelector('.tt-entry-duration').textContent).toBe('7.50 h');
    expect(entryList().querySelector('.tt-day-total').textContent).toBe('7.50 h');
    expect(entryList().querySelector('.tt-day-heading').textContent).toBe('Fri, 2026-10-09');
    expect(barValue('Date')).toBe('2026-10-08');
    expect(barValue('Start')).toBe('12:00 PM');
    expect(barValue('Duration')).toBe('0.00 h');
  });

  test('changing the timezone re-displays and re-groups entries without rewriting them', () => {
    mount({ timeEntries: [LATE] });
    expect(entryList().querySelector('.tt-day-heading').textContent).toBe('Fri, 09.10.2026');

    choose('Timezone', 'UTC');

    expect(entryList().querySelector('.tt-day-heading').textContent).toBe('Today');
    expect(entryList().querySelector('.tt-entry-range').textContent).toBe('22:30 – 06:00+1');
    expect(state.timeEntries).toEqual([LATE]);
    const entryEvents = vi.mocked(scheduleDomainEvent).mock.calls.filter(([e]) => e.type.startsWith('time_entry.'));
    expect(entryEvents).toEqual([]);
  });

  test('shorthand date parsing follows the chosen date format', () => {
    mount();
    choose('Date format', 'MM/DD/YYYY');
    const date = within(document.querySelector('.tt-entry-bar')).getByLabelText('Date');
    fireEvent.input(date, { target: { value: '10/3' } });
    fireEvent.blur(date);
    expect(date.value).toBe('10/03/2026');
  });

  test('the default project prefills the entry bar', () => {
    mount({ settings: { timezone: 'Europe/Berlin', defaultCustomerId: 'c1', defaultProjectId: 'p2' } });
    expect(barValue('Project')).toBe('Acme / Shop');
  });

  test('choosing a default project prefills an untouched entry bar right away', () => {
    mount();
    expect(barValue('Project')).toBe('');
    choose('Default customer', 'c1');
    expect(barValue('Project')).toBe('Acme / Website');
  });
});
