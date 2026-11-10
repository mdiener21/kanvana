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

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

const NOW = '2026-10-15T13:00:00.000Z'; // Thu 15 Oct 2026, 15:00 in Europe/Berlin
const prefs = () => ({ tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.now() });
const MINUTE = 60 * 1000;

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const ALPHA = { id: 'p1', customerId: 'c1', name: 'Alpha', color: '#03a9f4', archived: false };
const BETA = { id: 'p2', customerId: 'c1', name: 'Beta', color: '#8bc34a', archived: false };
// Berlin wall-clock times (UTC+2 in October 2026).
const at = (hhmm) => new Date(`2026-10-15T${hhmm}:00+02:00`).toISOString();
const entry = (id, start, end, projectId = 'p1') => ({ id, projectId, description: id, start: at(start), end: at(end) });
const DAY = () => [entry('review', '09:00', '10:30'), entry('call', '11:00', '11:45'), entry('deploy', '13:00', '14:15', 'p2')];

let unmount = null;
const fakeChart = () => ({ setOption() {}, resize() {}, dispose() {} });

function mount(timeEntries = DAY()) {
  state.customers = [ACME];
  state.projects = [ALPHA, BETA];
  state.timeEntries = timeEntries;
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document, { getPrefs: prefs, createChart: fakeChart });
}

const bar = () => screen.getByRole('group', { name: 'New time entry' });
const field = (name) => within(bar()).getByLabelText(name);
const times = () => ['Start', 'End', 'Duration'].map((name) => field(name).value);
const chips = () => screen.getByRole('group', { name: 'Fill untracked gaps' });
const entryList = () => screen.getByRole('region', { name: 'Time entries' });
const row = (id) => entryList().querySelector(`[data-entry-id="${id}"]`);
const later = (minutes) => vi.setSystemTime(Date.now() + minutes * MINUTE);

function onTouchDevice() {
  window.matchMedia = vi.fn((query) => ({ matches: query === '(pointer: coarse)' || query === '(hover: none)', media: query }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  unmount?.();
  unmount = null;
  delete window.matchMedia;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('an idle entry bar keeps its default times current', () => {
  test('coming back to the page moves an untouched End to now', () => {
    mount();
    expect(times()).toEqual(['14:15', '15:00', '0:45']);
    later(90);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(times()).toEqual(['14:15', '16:30', '2:15']);
    later(15);
    window.dispatchEvent(new Event('focus'));
    expect(times()).toEqual(['14:15', '16:45', '2:30']);
    later(15);
    window.dispatchEvent(new Event('pageshow'));
    expect(times()).toEqual(['14:15', '17:00', '2:45']);
  });

  test('saving an untouched bar logs up to now, not up to when the page was opened', () => {
    mount();
    later(90);
    fireEvent.input(field('Project'), { target: { value: 'Acme / Alpha' } });
    fireEvent.input(field('Description'), { target: { value: 'Review' } });
    fireEvent.keyDown(field('Description'), { key: 'Enter' });
    const saved = state.timeEntries.at(-1);
    expect([saved.start, saved.end]).toEqual([at('14:15'), at('16:30')]);
  });

  test('typed or filled times are never replaced', () => {
    mount();
    const start = field('Start');
    fireEvent.input(start, { target: { value: '1400' } });
    fireEvent.blur(start);
    later(90);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(times()).toEqual(['14:00', '15:00', '1:00']);

    fireEvent.click(within(chips()).getByRole('button', { name: 'Fill 11:45 – 13:00' }));
    later(30);
    window.dispatchEvent(new Event('focus'));
    fireEvent.input(field('Project'), { target: { value: 'Acme / Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    const saved = state.timeEntries.at(-1);
    expect([saved.start, saved.end]).toEqual([at('11:45'), at('13:00')]);
  });
});

describe('phone keyboards', () => {
  test('Start and End bring up the number pad, every field has a Done key, Duration keeps the text keyboard', () => {
    mount();
    fireEvent.click(within(row('call')).getByRole('button', { name: /open editor$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit entry' });
    for (const scope of [bar(), dialog]) {
      for (const name of ['Start', 'End']) expect(within(scope).getByLabelText(name).getAttribute('inputmode')).toBe('numeric');
      expect(within(scope).getByLabelText('Duration').hasAttribute('inputmode')).toBe(false);
      for (const name of ['Description', 'Project', 'Date', 'Start', 'End', 'Duration']) {
        expect(within(scope).getByLabelText(name).getAttribute('enterkeyhint')).toBe('done');
      }
    }
  });

  test('the inline rename input has a Done key', () => {
    mount();
    fireEvent.click(row('call').querySelector('[data-rename]'));
    expect(within(row('call')).getByRole('textbox', { name: 'Description' }).getAttribute('enterkeyhint')).toBe('done');
  });
});

describe('focus after saving and filling', () => {
  test('on a touch device Add saves without focusing Description, so the keyboard stays closed', () => {
    onTouchDevice();
    mount();
    fireEvent.input(field('Project'), { target: { value: 'Acme / Alpha' } });
    field('Description').focus();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(state.timeEntries).toHaveLength(4);
    expect(document.activeElement).not.toBe(field('Description'));
  });

  test('on a touch device a Fill chip or gap row pre-fills the bar without focusing Description', () => {
    onTouchDevice();
    mount();
    fireEvent.click(within(chips()).getByRole('button', { name: 'Fill 11:45 – 13:00' }));
    expect(times()).toEqual(['11:45', '13:00', '1:15']);
    expect(document.activeElement).not.toBe(field('Description'));
    fireEvent.click(within(entryList()).getByRole('button', { name: 'Fill 10:30 – 11:00' }));
    expect(times()).toEqual(['10:30', '11:00', '0:30']);
    expect(document.activeElement).not.toBe(field('Description'));
  });

  test('with a mouse and keyboard Add still returns focus to Description', () => {
    mount();
    fireEvent.input(field('Project'), { target: { value: 'Acme / Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(document.activeElement).toBe(field('Description'));
  });
});

describe('the editor opens on the field that was tapped', () => {
  const dialog = () => screen.getByRole('dialog', { name: 'Edit entry' });
  const selected = (input) => input.value.slice(input.selectionStart, input.selectionEnd);

  test("tapping a row's time range opens the editor with Start focused and selected", () => {
    mount();
    fireEvent.click(within(row('call')).getByRole('button', { name: '11:00 – 11:45, edit times' }));
    const start = within(dialog()).getByLabelText('Start');
    expect(document.activeElement).toBe(start);
    vi.runAllTimers();
    expect(selected(start)).toBe('11:00');
  });

  test('tapping the project / customer opens the editor with Project focused and selected', () => {
    mount();
    fireEvent.click(within(row('call')).getByRole('button', { name: /open editor$/ }));
    const project = within(dialog()).getByLabelText('Project');
    expect(document.activeElement).toBe(project);
    vi.runAllTimers();
    expect(selected(project)).toBe('Acme / Alpha');
  });

  test('the pencil still opens the editor on Description', () => {
    mount();
    fireEvent.click(within(row('call')).getByRole('button', { name: 'Edit entry' }));
    expect(document.activeElement).toBe(within(dialog()).getByLabelText('Description'));
  });

  test('focusing End, Duration or Date selects its value, so typing replaces it', () => {
    mount();
    fireEvent.click(within(row('call')).getByRole('button', { name: '11:00 – 11:45, edit times' }));
    for (const name of ['End', 'Duration', 'Date']) {
      const input = within(dialog()).getByLabelText(name);
      input.focus();
      vi.runAllTimers();
      expect(selected(input)).toBe(input.value);
    }
  });
});

describe('row menu on touch devices', () => {
  const menu = () => screen.queryByRole('menu', { name: 'Entry actions' });
  const more = (id) => within(row(id)).getByRole('button', { name: 'More actions' });

  test('⋯ opens a menu with edit, duplicate and delete for that row', () => {
    mount();
    expect(more('call').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more('call'));
    expect(more('call').getAttribute('aria-expanded')).toBe('true');
    expect(within(menu()).getAllByRole('menuitem').map((item) => item.textContent.trim())).toEqual(['Edit', 'Duplicate', 'Delete']);
    expect(row('call').contains(menu())).toBe(true);
  });

  test('menu Edit opens the editor and closes the menu', () => {
    mount();
    fireEvent.click(more('call'));
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit entry' })).toBeTruthy();
    expect(menu()).toBeNull();
  });

  test('menu Duplicate copies the entry', () => {
    mount();
    fireEvent.click(more('call'));
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Duplicate' }));
    expect(state.timeEntries).toHaveLength(4);
    expect(menu()).toBeNull();
  });

  test('menu Delete asks inline first, then deletes', () => {
    mount();
    fireEvent.click(more('call'));
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Delete' }));
    expect(state.timeEntries).toHaveLength(3);
    fireEvent.click(within(row('call')).getByRole('button', { name: 'Delete' }));
    expect(state.timeEntries.map((e) => e.id)).not.toContain('call');
  });

  test('Esc, tapping ⋯ again or tapping elsewhere closes the menu', () => {
    mount();
    fireEvent.click(more('call'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(menu()).toBeNull();
    fireEvent.click(more('call'));
    fireEvent.click(more('call'));
    expect(menu()).toBeNull();
    fireEvent.click(more('call'));
    fireEvent.click(document.body);
    expect(menu()).toBeNull();
  });
});
