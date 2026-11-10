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
let nextId = 0;
// Times are Berlin wall-clock (UTC+2 in October 2026).
const at = (day, hhmm) => new Date(`2026-10-${day}T${hhmm}:00+02:00`).toISOString();
const entry = (day, start, end, projectId = 'p1') => {
  nextId += 1;
  return { id: `e${nextId}`, projectId, description: `${day} ${start}`, start: at(day, start), end: at(day, end) };
};

// Today: 09:00–10:30, 10:45–12:45, 13:00–14:00 → gaps 10:30–10:45 and 12:45–13:00.
// Yesterday: 09:00–10:00, 11:00–12:00 → a gap that is not today's.
const today = () => [entry('08', '09:00', '10:30'), entry('08', '10:45', '12:45', 'p2'), entry('08', '13:00', '14:00')];
const yesterday = () => [entry('07', '09:00', '10:00'), entry('07', '11:00', '12:00')];

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
const chipGroup = () => screen.getByRole('group', { name: 'Fill untracked gaps' });
const chipButtons = () => within(chipGroup()).queryAllByRole('button');
const chips = () => (screen.queryByRole('group', { name: 'Fill untracked gaps' }) ? chipButtons().map((chip) => chip.textContent.trim()) : []);
const key = (k) => fireEvent.keyDown(document.body, { key: k });
const select = (description) => {
  fireEvent.click([...entryList().querySelectorAll('.tt-entry-range')]
    .find((range) => range.closest('[data-entry-id]').textContent.includes(description)));
};

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

describe('fill chips below the entry bar', () => {
  test("today's gaps show as Fill chips below the entry bar, newest first", () => {
    mount([...yesterday(), ...today()]);
    expect(chips()).toEqual(['Fill 12:45 – 13:00', 'Fill 10:30 – 10:45']);
    expect(bar().compareDocumentPosition(chipGroup()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chipGroup().hidden).toBe(false);
  });

  test('with more than three gaps today only the three newest show', () => {
    mount([
      entry('08', '08:00', '08:30'), entry('08', '09:00', '09:30'), entry('08', '10:00', '10:30'),
      entry('08', '11:00', '11:30'), entry('08', '12:00', '12:30')
    ]);
    expect(chips()).toEqual(['Fill 11:30 – 12:00', 'Fill 10:30 – 11:00', 'Fill 09:30 – 10:00']);
  });

  test('with no gaps today no chips show', () => {
    mount([...yesterday(), entry('08', '09:00', '10:00'), entry('08', '10:00', '11:00')]);
    expect(screen.queryByRole('group', { name: 'Fill untracked gaps' })).toBeNull();  });

  test('a chip pre-fills the entry bar exactly as a gap row Fill does and saves nothing', () => {
    mount(today());
    fireEvent.input(field('Description'), { target: { value: 'Review' } });
    field('Project').value = 'Globex / Lime';
    fireEvent.click(within(chipGroup()).getByRole('button', { name: 'Fill 12:45 – 13:00' }));
    const viaChip = ['Date', 'Start', 'End', 'Duration', 'Project', 'Description'].map((name) => field(name).value);
    expect(viaChip).toEqual(['08.10.2026', '12:45', '13:00', '0:15', 'Globex / Lime', 'Review']);
    expect(document.activeElement).toBe(field('Description'));

    fireEvent.click(within(entryList()).getByRole('button', { name: 'Fill 10:30 – 10:45' }));
    fireEvent.click(within(entryList()).getByRole('button', { name: 'Fill 12:45 – 13:00' }));
    expect(['Date', 'Start', 'End', 'Duration', 'Project', 'Description'].map((name) => field(name).value)).toEqual(viaChip);
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
    expect(state.timeEntries).toHaveLength(3);
  });

  test('chips hide while a customer or project filter is active, like gap rows', () => {
    mount(today());
    fireEvent.change(screen.getByLabelText('Filter by project'), { target: { value: 'p1' } });
    expect(chips()).toEqual([]);
    fireEvent.change(screen.getByLabelText('Filter by project'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter by customer'), { target: { value: 'c1' } });
    expect(chips()).toEqual([]);
    fireEvent.change(screen.getByLabelText('Filter by customer'), { target: { value: '' } });
    expect(chips()).toEqual(['Fill 12:45 – 13:00', 'Fill 10:30 – 10:45']);
  });

  test('chips are keyboard-focusable buttons', () => {
    mount(today());
    for (const chip of chipButtons()) {
      expect(chip.tagName).toBe('BUTTON');
      expect(chip.tabIndex).toBe(0);
      expect(chip.disabled).toBe(false);
    }
  });

  test('chips update when an entry is saved, edited or deleted', () => {
    mount(today());
    field('Project').value = 'Acme / Website';
    fireEvent.click(within(chipGroup()).getByRole('button', { name: 'Fill 12:45 – 13:00' }));
    fireEvent.keyDown(field('Description'), { key: 'Enter' });
    expect(chips()).toEqual(['Fill 10:30 – 10:45']);
    field('Description').blur();

    select('08 10:45');
    key('e');
    const dialog = screen.getByRole('dialog', { name: 'Edit entry' });
    const start = within(dialog).getByLabelText('Start');
    fireEvent.input(start, { target: { value: '11:00' } });
    fireEvent.blur(start);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(chips()).toEqual(['Fill 10:30 – 11:00']);

    select('08 09:00');
    key('Delete');
    key('y');
    expect(chips()).toEqual([]);
  });
});

describe('f fills the gap before the selected entry', () => {
  test('f puts the gap before the selected entry into the entry bar and focuses Description', () => {
    mount(today());
    select('08 13:00');
    key('f');
    expect(field('Start').value).toBe('12:45');
    expect(field('End').value).toBe('13:00');
    expect(document.activeElement).toBe(field('Description'));
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('f with no gap before the selected entry changes nothing', () => {
    mount(today());
    select('08 09:00'); // first of the day
    const before = ['Date', 'Start', 'End', 'Duration'].map((name) => field(name).value);
    key('f');
    expect(['Date', 'Start', 'End', 'Duration'].map((name) => field(name).value)).toEqual(before);
    expect(document.activeElement).not.toBe(field('Description'));
  });

  test('f does nothing while a customer or project filter is active', () => {
    mount(today());
    fireEvent.change(screen.getByLabelText('Filter by customer'), { target: { value: 'c1' } });
    select('08 13:00');
    const before = ['Date', 'Start', 'End', 'Duration'].map((name) => field(name).value);
    key('f');
    expect(['Date', 'Start', 'End', 'Duration'].map((name) => field(name).value)).toEqual(before);
  });

  test('f is listed in the cheat-sheet', () => {
    mount(today());
    expect(document.getElementById('tt-help-rows').textContent).toMatch(/f\s*Fill the gap before the selected entry/);
  });

  test('f does nothing without a selection or while an input has focus', () => {
    mount(today());
    const before = field('Start').value;
    key('f');
    expect(field('Start').value).toBe(before);

    select('08 13:00');
    field('Duration').focus();
    fireEvent.keyDown(field('Duration'), { key: 'f' });
    expect(field('Start').value).toBe(before);
  });
});
