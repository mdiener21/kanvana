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
      if (event.type === 'time_entry.updated') {
        state.timeEntries = state.timeEntries.map((e) => (e.id === event.entityId ? { ...e, ...event.payload.fields } : e));
      }
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
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };

let unmount = null;
const fakeChart = () => ({ setOption() {}, resize() {}, dispose() {} });

function mount() {
  state.customers = [ACME];
  state.projects = [WEBSITE];
  state.timeEntries = [
    { id: 'e1', projectId: 'p1', description: 'Write report', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' },
    { id: 'e2', projectId: 'p1', description: 'Review', start: '2026-10-08T08:00:00.000Z', end: '2026-10-08T09:00:00.000Z' }
  ];
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document, { getPrefs: prefs, createChart: fakeChart });
}

const entryList = () => screen.getByRole('region', { name: 'Time entries' });
const rowOf = (text) => within(entryList()).getByText(text).closest('li');
const renameInput = () => within(entryList()).getByRole('textbox', { name: 'Description' });
const press = (el, key) => fireEvent.keyDown(el, { key });
const descriptionOf = (id) => state.timeEntries.find((e) => e.id === id).description;
const updates = () => scheduleDomainEvent.mock.calls.filter(([event]) => event.type === 'time_entry.updated');

function rename(text, value) {
  fireEvent.click(within(entryList()).getByText(text));
  fireEvent.input(renameInput(), { target: { value } });
  return renameInput();
}

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

describe('inline rename', () => {
  test('clicking a description puts a focused input with the current text in its place, caret at the end', () => {
    mount();
    fireEvent.click(within(entryList()).getByText('Write report'));
    const input = renameInput();
    expect(input.value).toBe('Write report');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe('Write report'.length);
    expect(input.selectionEnd).toBe('Write report'.length);
    expect(input.closest('li').dataset.entryId).toBe('e1');
  });

  test('row actions hide while renaming', () => {
    mount();
    fireEvent.click(within(entryList()).getByText('Write report'));
    const row = renameInput().closest('li');
    expect(within(row).queryByRole('button', { name: 'Edit entry' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Delete entry' })).toBeNull();
  });

  test('Enter saves through time_entry.updated and the row re-renders with the new text', () => {
    mount();
    press(rename('Write report', 'Write final report'), 'Enter');
    expect(updates()).toHaveLength(1);
    expect(updates()[0][0]).toMatchObject({
      type: 'time_entry.updated',
      entityId: 'e1',
      payload: { fields: { description: 'Write final report' }, before: { description: 'Write report' } }
    });
    expect(within(entryList()).queryByRole('textbox', { name: 'Description' })).toBeNull();
    expect(rowOf('Write final report').dataset.entryId).toBe('e1');
  });

  test('leaving the field saves', () => {
    mount();
    fireEvent.blur(rename('Write report', 'Draft'));
    expect(descriptionOf('e1')).toBe('Draft');
    expect(updates()).toHaveLength(1);
    expect(rowOf('Draft').dataset.entryId).toBe('e1');
  });

  test('Esc restores the original description and emits nothing', () => {
    mount();
    const input = rename('Write report', 'Something else');
    press(input, 'Escape');
    expect(updates()).toHaveLength(0);
    expect(within(entryList()).queryByRole('textbox', { name: 'Description' })).toBeNull();
    expect(rowOf('Write report').dataset.entryId).toBe('e1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('saving unchanged text emits no event', () => {
    mount();
    press(rename('Write report', 'Write report'), 'Enter');
    fireEvent.click(within(entryList()).getByText('Review'));
    fireEvent.blur(renameInput());
    expect(updates()).toHaveLength(0);
  });

  test('saving cleared text stores no description and shows (no description)', () => {
    mount();
    press(rename('Write report', '   '), 'Enter');
    expect(descriptionOf('e1')).toBe('');
    expect(rowOf('(no description)').dataset.entryId).toBe('e1');
  });

  test('F2 renames the selected row when focus is outside an input', () => {
    mount();
    press(document.body, 'j');
    press(document.body, 'j');
    press(document.body, 'F2');
    expect(renameInput().value).toBe('Write report');
    expect(renameInput().closest('li').dataset.entryId).toBe('e1');
  });

  test('F2 does nothing while an input has focus', () => {
    mount();
    press(document.body, 'j');
    const description = screen.getByLabelText('Description');
    description.focus();
    press(description, 'F2');
    expect(within(entryList()).queryByRole('textbox', { name: 'Description' })).toBeNull();
  });

  test('F2 is listed in the cheat-sheet', () => {
    mount();
    press(document.body, '?');
    expect(document.getElementById('tt-help-rows').textContent).toMatch(/F2\s*Rename selected entry/);
  });
});

describe('project / customer button', () => {
  test('clicking the project or customer opens the edit modal for that entry, like the pencil', () => {
    mount();
    const row = rowOf('Review');
    fireEvent.click(within(row).getByText('Website'));
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Description').value).toBe('Review');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(rowOf('Write report')).getByText('Acme'));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Description').value).toBe('Write report');
  });

  test('the project / customer cell is a keyboard-operable button', () => {
    mount();
    const button = within(rowOf('Review')).getByRole('button', { name: /Website.*Acme/ });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });
});
