import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountToBody } from '../setup.js';

const state = { customers: [], projects: [], timeEntries: [] };

vi.mock('../../../src/modules/storage.js', () => ({
  loadTimeTracking: vi.fn(() => state)
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
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

const NOW = '2026-10-08T10:00:00.000Z'; // 12:00 in Europe/Berlin
const prefs = () => ({ tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.now() });

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const OLD_CO = { id: 'c2', name: 'Old Co', color: '#111111', archived: true };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };
const LEGACY = { id: 'p2', customerId: 'c1', name: 'Legacy', color: '#e91e63', archived: true };
const SUPPORT = { id: 'p3', customerId: 'c2', name: 'Support', color: '#8bc34a', archived: false };

let unmount = null;

function mount({ timeEntries = [] } = {}) {
  state.customers = [ACME, OLD_CO];
  state.projects = [WEBSITE, LEGACY, SUPPORT];
  state.timeEntries = timeEntries;
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document, { getPrefs: prefs });
}

const field = (name) => screen.getByLabelText(name);
const type = (name, value) => fireEvent.input(field(name), { target: { value } });
const blur = (name) => fireEvent.blur(field(name));
const press = (el, key, init = {}) => fireEvent.keyDown(el, { key, ...init });
const toastText = () => document.getElementById('tt-toast')?.textContent ?? '';
const entryList = () => screen.getByRole('region', { name: 'Time entries' });
const values = () => ['Date', 'Start', 'End', 'Duration'].map((n) => field(n).value);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(NOW));
  vi.clearAllMocks();
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
});

describe('entry bar', () => {
  test('opens on the Time Tracker with defaults: today, start = now, end = start, 0:00, no project', () => {
    mount();
    expect(document.getElementById('tt-section-tracker').hidden).toBe(false);
    expect(field('Description').value).toBe('');
    expect(field('Description').placeholder).toBe('What are you working on?');
    expect(field('Project').value).toBe('');
    expect(values()).toEqual(['08.10.2026', '12:00', '12:00', '0:00']);
  });

  test('project type-ahead offers active projects as Customer / Project only', () => {
    mount();
    const options = [...document.getElementById(field('Project').getAttribute('list')).options].map((o) => o.value);
    expect(options).toEqual(['Acme / Website']);
  });

  test('keyboard-only flow: n → description → project → duration → Enter saves, resets and refocuses', () => {
    mount();
    fireEvent.click(document.getElementById('tt-nav-projects'));

    const notTyped = press(document.body, 'n');
    expect(notTyped).toBe(false);
    expect(document.getElementById('tt-section-tracker').hidden).toBe(false);
    expect(document.activeElement).toBe(field('Description'));

    type('Description', 'Standup');
    field('Project').focus();
    type('Project', 'website');
    field('Duration').focus();
    type('Duration', '1h30');
    press(field('Duration'), 'Enter');

    expect(scheduleDomainEvent).toHaveBeenCalledOnce();
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'time_entry.created',
      scope: 'timetracking',
      payload: {
        timeEntry: expect.objectContaining({
          projectId: 'p1',
          description: 'Standup',
          start: '2026-10-08T10:00:00.000Z',
          end: '2026-10-08T11:30:00.000Z'
        })
      }
    }));

    const today = within(entryList()).getByRole('list', { name: 'Today' });
    expect(within(today).getByText('Standup')).toBeTruthy();
    expect(within(today).getByText('12:00 – 13:30')).toBeTruthy();

    expect(field('Description').value).toBe('');
    expect(field('Project').value).toBe('');
    expect(values()).toEqual(['08.10.2026', '12:00', '12:00', '0:00']);
    expect(document.activeElement).toBe(field('Description'));
  });

  test('Enter saves from any field, e.g. Description, with an exact project label', () => {
    mount();
    type('Project', 'acme / website');
    type('End', '13');
    blur('End');
    press(field('Description'), 'Enter');
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: { timeEntry: expect.objectContaining({ projectId: 'p1', description: '', end: '2026-10-08T11:00:00.000Z' }) }
    }));
  });

  test('Enter resolves the field being edited without a prior blur', () => {
    mount();
    type('Project', 'Website');
    field('End').focus();
    type('End', '1430');
    press(field('End'), 'Enter');
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: { timeEntry: expect.objectContaining({ end: '2026-10-08T12:30:00.000Z' }) }
    }));
  });
});

describe('linked fields', () => {
  test('fields normalise on blur and Start / End recompute Duration', () => {
    mount();
    type('Start', '930');
    blur('Start');
    expect(values()).toEqual(['08.10.2026', '09:30', '12:00', '2:30']);
    type('Date', 'y');
    blur('Date');
    expect(values()).toEqual(['07.10.2026', '09:30', '12:00', '2:30']);
  });

  test('Duration recomputes End', () => {
    mount();
    type('Duration', '90m');
    blur('Duration');
    expect(values()).toEqual(['08.10.2026', '12:00', '13:30', '1:30']);
  });

  test('End before Start rolls over and shows +1 day', () => {
    mount();
    const marker = screen.getByText('+1 day');
    expect(marker.hidden).toBe(true);
    type('Start', '22');
    blur('Start');
    type('End', '2');
    blur('End');
    expect(values()).toEqual(['08.10.2026', '22:00', '02:00', '4:00']);
    expect(marker.hidden).toBe(false);
    type('End', '23');
    blur('End');
    expect(marker.hidden).toBe(true);
  });

  test('invalid input reverts to the last valid value on blur', () => {
    mount();
    type('Start', 'soon');
    blur('Start');
    expect(field('Start').value).toBe('12:00');
  });

  test('Alt+↑ / Alt+↓ adjust Start, End and Duration by 15 minutes', () => {
    mount();
    press(field('Duration'), 'ArrowUp', { altKey: true });
    expect(values()).toEqual(['08.10.2026', '12:00', '12:15', '0:15']);
    press(field('End'), 'ArrowUp', { altKey: true });
    expect(values()).toEqual(['08.10.2026', '12:00', '12:30', '0:30']);
    press(field('Start'), 'ArrowDown', { altKey: true });
    expect(values()).toEqual(['08.10.2026', '11:45', '12:30', '0:45']);
  });

  test('Alt+arrow does nothing on Description', () => {
    mount();
    press(field('Description'), 'ArrowUp', { altKey: true });
    expect(values()).toEqual(['08.10.2026', '12:00', '12:00', '0:00']);
  });
});

describe('keyboard', () => {
  test('n is ignored while typing in a field', () => {
    mount();
    field('Start').focus();
    expect(press(field('Start'), 'n')).toBe(true);
    expect(document.activeElement).toBe(field('Start'));
  });

  test('Esc leaves the field', () => {
    mount();
    field('Description').focus();
    press(field('Description'), 'Escape');
    expect(document.activeElement).not.toBe(field('Description'));
  });
});

describe('validation: toast, nothing saved, values kept', () => {
  function attempt({ project = '', duration = '1:00', start } = {}) {
    mount();
    type('Description', 'Work');
    type('Project', project);
    if (start !== undefined) type('Start', start);
    type('Duration', duration);
    blur('Duration');
    press(field('Description'), 'Enter');
  }

  test('project required', () => {
    attempt({ project: '' });
    expect(toastText()).toBe('Select a project.');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
    expect(field('Description').value).toBe('Work');
  });

  test('unmatched project label counts as no project', () => {
    attempt({ project: 'Nonexistent' });
    expect(toastText()).toBe('Select a project.');
  });

  test('archived project', () => {
    attempt({ project: 'Acme / Legacy' });
    expect(toastText()).toBe('That project is archived.');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('project of an archived customer', () => {
    attempt({ project: 'Old Co / Support' });
    expect(toastText()).toBe('That project is archived.');
  });

  test('zero duration', () => {
    attempt({ project: 'Acme / Website', duration: '0:00' });
    expect(toastText()).toBe('Duration must be greater than zero.');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
    expect(field('Project').value).toBe('Acme / Website');
  });

  test('unparsable time typed right before Enter', () => {
    mount();
    type('Project', 'Website');
    field('Start').focus();
    type('Start', 'soon');
    press(field('Start'), 'Enter');
    expect(toastText()).toBe('Enter a valid date and time.');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });
});

describe('entry list', () => {
  const entry = (id, start, end, extra = {}) => ({ id, projectId: 'p1', description: id, start, end, ...extra });

  test('groups by start day with Today / Yesterday / Ddd, date headings and day totals', () => {
    mount({
      timeEntries: [
        entry('today-entry', '2026-10-08T07:00:00.000Z', '2026-10-08T08:30:00.000Z'),
        entry('yesterday-entry', '2026-10-07T07:00:00.000Z', '2026-10-07T08:00:00.000Z'),
        entry('overnight', '2026-10-05T20:00:00.000Z', '2026-10-06T00:00:00.000Z')
      ]
    });
    const headings = within(entryList()).getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual(['Today', 'Yesterday', 'Mon, 05.10.2026']);

    const monday = within(entryList()).getByRole('list', { name: 'Mon, 05.10.2026' });
    expect(within(monday).getByText('overnight')).toBeTruthy();
    expect(within(monday).getByText('22:00 – 02:00')).toBeTruthy();
    expect(within(monday).getByText('+1')).toBeTruthy();
    expect(within(entryList()).getByLabelText('Total for Mon, 05.10.2026').textContent).toBe('4:00');
    expect(within(entryList()).getByLabelText('Total for Today').textContent).toBe('1:30');
  });

  test('a row shows description, project in its colour, customer and duration', () => {
    mount({ timeEntries: [entry('e1', '2026-10-08T07:00:00.000Z', '2026-10-08T08:30:00.000Z', { description: '' })] });
    const row = within(entryList()).getByRole('listitem');
    expect(within(row).getByText('(no description)')).toBeTruthy();
    expect(within(row).getByText('Website').style.color).toBe('rgb(3, 169, 244)');
    expect(within(row).getByText('Acme')).toBeTruthy();
    expect(within(row).getByText('1:30')).toBeTruthy();
  });

  test('an entry whose project is not known yet renders as Unknown project', () => {
    mount({ timeEntries: [entry('e1', '2026-10-08T07:00:00.000Z', '2026-10-08T08:00:00.000Z', { projectId: 'ghost' })] });
    expect(within(entryList()).getByText('Unknown project')).toBeTruthy();
  });

  test('empty state', () => {
    mount();
    expect(within(entryList()).getByText('No time entries yet.')).toBeTruthy();
  });
});
