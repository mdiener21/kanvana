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
const emitDataChanged = () => emit(DATA_CHANGED);

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

  test('entries on archived projects and archived customers still render and count in the day total', () => {
    mount({
      timeEntries: [
        entry('on-legacy', '2026-10-08T07:00:00.000Z', '2026-10-08T08:00:00.000Z', { projectId: 'p2' }),
        entry('on-old-co', '2026-10-08T08:00:00.000Z', '2026-10-08T08:30:00.000Z', { projectId: 'p3' })
      ]
    });
    const today = within(entryList()).getByRole('list', { name: 'Today' });
    expect(within(today).getByText('Legacy')).toBeTruthy();
    expect(within(today).getByText('Support')).toBeTruthy();
    expect(within(today).getByText('Old Co')).toBeTruthy();
    expect(within(entryList()).getByLabelText('Total for Today').textContent).toBe('1:30');
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

const entry = (id, start, end, extra = {}) => ({ id, projectId: 'p1', description: id, start, end, ...extra });
const THREE_ENTRIES = [
  entry('morning', '2026-10-08T06:00:00.000Z', '2026-10-08T07:00:00.000Z'),
  entry('late', '2026-10-08T08:00:00.000Z', '2026-10-08T09:30:00.000Z'),
  entry('yesterday', '2026-10-07T07:00:00.000Z', '2026-10-07T08:00:00.000Z')
];
const rows = () => within(entryList()).getAllByRole('listitem');
const row = (description) => rows().find((r) => within(r).queryByText(description));
const selected = () => rows().filter((r) => r.getAttribute('aria-current') === 'true')
  .map((r) => r.querySelector('.tt-entry-desc').textContent);
const key = (k, init) => press(document.body, k, init);

describe('selection', () => {
  let scrollIntoView;
  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => { delete Element.prototype.scrollIntoView; });

  test('j / k move the selection through the visible list, clamped at both ends, and keep it in view', () => {
    mount({ timeEntries: THREE_ENTRIES });
    expect(selected()).toEqual([]);
    key('j');
    expect(selected()).toEqual(['late']);
    key('j');
    expect(selected()).toEqual(['morning']);
    key('j');
    expect(selected()).toEqual(['yesterday']);
    key('j');
    expect(selected()).toEqual(['yesterday']);
    key('k');
    expect(selected()).toEqual(['morning']);
    expect(row('morning').classList.contains('is-selected')).toBe(true);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(row('morning'));
  });

  test('single-key shortcuts are ignored while an input is focused', () => {
    mount({ timeEntries: THREE_ENTRIES });
    field('Description').focus();
    for (const k of ['j', 'k', 'e', 'd', 'Delete']) {
      expect(press(field('Description'), k)).toBe(true);
    }
    expect(selected()).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'Edit entry' })).toBeNull();
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('clicking a row selects it', () => {
    mount({ timeEntries: THREE_ENTRIES });
    fireEvent.click(row('yesterday'));
    expect(selected()).toEqual(['yesterday']);
    key('k');
    expect(selected()).toEqual(['morning']);
  });

  test('selection survives a re-render and is dropped when the entry disappears', () => {
    mount({ timeEntries: THREE_ENTRIES });
    key('j');
    state.timeEntries = THREE_ENTRIES.filter((e) => e.id !== 'morning');
    emitDataChanged();
    expect(selected()).toEqual(['late']);
    state.timeEntries = THREE_ENTRIES.filter((e) => e.id !== 'late');
    emitDataChanged();
    expect(selected()).toEqual([]);
  });

  test('shortcuts with no selection do nothing', () => {
    mount({ timeEntries: THREE_ENTRIES });
    key('e');
    key('d');
    key('Delete');
    expect(screen.queryByRole('dialog', { name: 'Edit entry' })).toBeNull();
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  test('a selected row shows edit, duplicate and delete actions', () => {
    mount({ timeEntries: THREE_ENTRIES });
    key('j');
    const actions = within(row('late')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(actions).toEqual(['Edit entry', 'Duplicate entry', 'Delete entry']);
  });
});

describe('edit modal', () => {
  const dialog = () => screen.queryByRole('dialog', { name: 'Edit entry' });
  const inDialog = (name) => within(dialog()).getByLabelText(name);
  const dialogValues = () => ['Date', 'Start', 'End', 'Duration'].map((n) => inDialog(n).value);
  const typeIn = (name, value) => fireEvent.input(inDialog(name), { target: { value } });

  function openEditorOn(description, entries = THREE_ENTRIES) {
    mount({ timeEntries: entries });
    fireEvent.click(row(description));
    key('e');
  }

  test('e opens the selected entry with its values and focuses Description', () => {
    openEditorOn('late');
    expect(dialog()).toBeTruthy();
    expect(inDialog('Description').value).toBe('late');
    expect(inDialog('Project').value).toBe('Acme / Website');
    expect(dialogValues()).toEqual(['08.10.2026', '10:00', '11:30', '1:30']);
    expect(document.activeElement).toBe(inDialog('Description'));
  });

  test('linked fields behave as in the entry bar and Enter saves time_entry.updated with before / after', () => {
    openEditorOn('late');
    typeIn('Description', 'Late review');
    typeIn('Duration', '2h');
    fireEvent.blur(inDialog('Duration'));
    expect(dialogValues()).toEqual(['08.10.2026', '10:00', '12:00', '2:00']);
    typeIn('Start', '930');
    press(inDialog('Start'), 'Enter');

    expect(scheduleDomainEvent).toHaveBeenCalledOnce();
    expect(scheduleDomainEvent).toHaveBeenCalledWith({
      type: 'time_entry.updated',
      scope: 'timetracking',
      entityId: 'late',
      payload: {
        fields: { description: 'Late review', start: '2026-10-08T07:30:00.000Z', end: '2026-10-08T10:00:00.000Z' },
        before: { description: 'late', start: '2026-10-08T08:00:00.000Z', end: '2026-10-08T09:30:00.000Z' }
      }
    });
    expect(dialog()).toBeNull();
    expect(within(row('Late review')).getByText('09:30 – 12:00')).toBeTruthy();
    expect(selected()).toEqual(['Late review']);
  });

  test('Esc cancels without saving', () => {
    openEditorOn('late');
    typeIn('Description', 'Changed');
    press(inDialog('Description'), 'Escape');
    expect(dialog()).toBeNull();
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
    expect(row('late')).toBeTruthy();
  });

  test('validation errors toast and keep the modal open', () => {
    openEditorOn('late');
    typeIn('Duration', '0:00');
    fireEvent.blur(inDialog('Duration'));
    press(inDialog('Description'), 'Enter');
    expect(toastText()).toBe('Duration must be greater than zero.');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
  });

  test('switching to an archived project is rejected', () => {
    openEditorOn('late');
    typeIn('Project', 'Acme / Legacy');
    press(inDialog('Description'), 'Enter');
    expect(toastText()).toBe('That project is archived.');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('an entry may keep its already-archived project', () => {
    openEditorOn('old', [entry('old', '2026-10-08T08:00:00.000Z', '2026-10-08T09:00:00.000Z', { projectId: 'p2' })]);
    expect(inDialog('Project').value).toBe('Acme / Legacy');
    typeIn('Description', 'old cleanup');
    press(inDialog('Description'), 'Enter');
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'time_entry.updated',
      payload: { fields: { description: 'old cleanup' }, before: { description: 'old' } }
    }));
  });

  test('saving without changes just closes the modal', () => {
    openEditorOn('late');
    press(inDialog('Description'), 'Enter');
    expect(dialog()).toBeNull();
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('single-key shortcuts are suppressed while the modal is open', () => {
    openEditorOn('late');
    inDialog('Description').blur();
    key('j');
    key('d');
    expect(selected()).toEqual(['late']);
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('double-click and the row edit action also open the modal', () => {
    mount({ timeEntries: THREE_ENTRIES });
    fireEvent.dblClick(row('morning'));
    expect(inDialog('Description').value).toBe('morning');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(dialog()).toBeNull();

    fireEvent.click(within(row('yesterday')).getByRole('button', { name: 'Edit entry' }));
    expect(inDialog('Description').value).toBe('yesterday');
    expect(dialogValues()[0]).toBe('07.10.2026');
    typeIn('Description', 'Retro');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'time_entry.updated', entityId: 'yesterday' }));
  });
});

describe('duplicate', () => {
  test('d copies project, description and duration, starting now, and selects the copy', () => {
    vi.setSystemTime(new Date('2026-10-08T10:20:30.000Z'));
    mount({ timeEntries: THREE_ENTRIES });
    fireEvent.click(row('yesterday'));
    key('d');

    expect(scheduleDomainEvent).toHaveBeenCalledOnce();
    const [{ type, payload }] = scheduleDomainEvent.mock.calls[0];
    expect(type).toBe('time_entry.created');
    expect(payload.timeEntry).toMatchObject({
      projectId: 'p1',
      description: 'yesterday',
      start: '2026-10-08T10:20:00.000Z',
      end: '2026-10-08T11:20:00.000Z'
    });
    const today = within(entryList()).getByRole('list', { name: 'Today' });
    expect(within(today).getByText('yesterday')).toBeTruthy();
    expect(within(today).getByText('12:20 – 13:20')).toBeTruthy();
    expect(rows().find((r) => r.getAttribute('aria-current') === 'true').dataset.entryId).toBe(payload.timeEntry.id);
  });

  test('the row duplicate action does the same', () => {
    mount({ timeEntries: THREE_ENTRIES });
    fireEvent.click(within(row('late')).getByRole('button', { name: 'Duplicate entry' }));
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'time_entry.created' }));
  });

  test('an entry on an archived project is not duplicated', () => {
    mount({ timeEntries: [entry('old', '2026-10-08T08:00:00.000Z', '2026-10-08T09:00:00.000Z', { projectId: 'p2' })] });
    key('j');
    key('d');
    expect(toastText()).toBe('That project is archived.');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });
});

describe('delete', () => {
  const confirmRow = () => entryList().querySelector('.tt-entry-confirm');

  function confirmDeleteOf(description) {
    mount({ timeEntries: THREE_ENTRIES });
    fireEvent.click(row(description));
    key('Delete');
  }

  test('Del asks inline with description, project and duration', () => {
    confirmDeleteOf('late');
    expect(confirmRow().textContent).toContain('Delete “late” · Website · 1:30?');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('y deletes permanently, removes the row and selects the next one', () => {
    confirmDeleteOf('late');
    key('y');
    expect(scheduleDomainEvent).toHaveBeenCalledOnce();
    expect(scheduleDomainEvent).toHaveBeenCalledWith({
      type: 'time_entry.deleted',
      scope: 'timetracking',
      entityId: 'late',
      payload: { timeEntry: THREE_ENTRIES[1] }
    });
    expect(row('late')).toBeUndefined();
    expect(confirmRow()).toBeNull();
    expect(selected()).toEqual(['morning']);
  });

  test('deleting the last row selects the previous one', () => {
    confirmDeleteOf('yesterday');
    key('y');
    expect(selected()).toEqual(['morning']);
  });

  test('Esc cancels and leaves the entry untouched', () => {
    confirmDeleteOf('late');
    key('Escape');
    expect(confirmRow()).toBeNull();
    expect(row('late')).toBeTruthy();
    expect(selected()).toEqual(['late']);
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('any other key cancels the confirmation and is then handled normally', () => {
    confirmDeleteOf('late');
    key('j');
    expect(confirmRow()).toBeNull();
    expect(selected()).toEqual(['morning']);
    expect(scheduleDomainEvent).not.toHaveBeenCalled();

    key('Delete');
    key('e');
    expect(confirmRow()).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Edit entry' })).toBeTruthy();
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('Tab cancels the confirmation without being swallowed', () => {
    confirmDeleteOf('late');
    expect(key('Tab')).toBe(true);
    expect(confirmRow()).toBeNull();
    expect(row('late')).toBeTruthy();
    key('y');
    expect(scheduleDomainEvent).not.toHaveBeenCalled();
  });

  test('the row delete action asks too; Cancel and Delete buttons work with the mouse', () => {
    mount({ timeEntries: THREE_ENTRIES });
    fireEvent.click(within(row('late')).getByRole('button', { name: 'Delete entry' }));
    fireEvent.click(within(confirmRow()).getByRole('button', { name: 'Cancel' }));
    expect(confirmRow()).toBeNull();
    expect(scheduleDomainEvent).not.toHaveBeenCalled();

    fireEvent.click(within(row('late')).getByRole('button', { name: 'Delete entry' }));
    fireEvent.click(within(confirmRow()).getByRole('button', { name: 'Delete' }));
    expect(scheduleDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'time_entry.deleted', entityId: 'late' }));
  });
});

describe('entry list filter', () => {
  const FILTERED = [
    entry('website-today', '2026-10-08T07:00:00.000Z', '2026-10-08T08:00:00.000Z'),
    entry('legacy-today', '2026-10-08T09:00:00.000Z', '2026-10-08T09:30:00.000Z', { projectId: 'p2' }),
    entry('support-today', '2026-10-08T05:00:00.000Z', '2026-10-08T07:00:00.000Z', { projectId: 'p3' }),
    entry('support-yesterday', '2026-10-07T07:00:00.000Z', '2026-10-07T08:00:00.000Z', { projectId: 'p3' })
  ];
  const customerFilter = () => screen.getByLabelText('Filter by customer');
  const projectFilter = () => screen.getByLabelText('Filter by project');
  const choose = (select, value) => fireEvent.change(select, { target: { value } });
  const descriptions = () => rows().map((r) => r.querySelector('.tt-entry-desc').textContent);
  const total = (heading) => within(entryList()).getByLabelText(`Total for ${heading}`).textContent;
  const count = () => screen.getByLabelText('Entry count').textContent;

  test('filter controls sit above the list and start at All', () => {
    mount({ timeEntries: FILTERED });
    const filterGroup = screen.getByRole('group', { name: 'Filter entries' });
    expect(filterGroup.compareDocumentPosition(entryList()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(customerFilter().value).toBe('');
    expect(descriptions()).toHaveLength(4);
    expect(count()).toBe('4 entries');
  });

  test('by customer, by project, both, and All resets', () => {
    mount({ timeEntries: FILTERED });
    choose(customerFilter(), 'c2');
    expect(descriptions()).toEqual(['support-today', 'support-yesterday']);

    choose(customerFilter(), '');
    choose(projectFilter(), 'p2');
    expect(descriptions()).toEqual(['legacy-today']);

    choose(customerFilter(), 'c1');
    choose(projectFilter(), 'p1');
    expect(descriptions()).toEqual(['website-today']);

    choose(projectFilter(), '');
    expect(descriptions()).toEqual(['legacy-today', 'website-today']);
    choose(customerFilter(), '');
    expect(descriptions()).toHaveLength(4);
  });

  test('day totals and the entry count reflect the filtered entries', () => {
    mount({ timeEntries: FILTERED });
    expect(total('Today')).toBe('3:30');
    choose(customerFilter(), 'c1');
    expect(total('Today')).toBe('1:30');
    expect(within(entryList()).queryByLabelText('Total for Yesterday')).toBeNull();
    expect(count()).toBe('2 entries');
    choose(projectFilter(), 'p1');
    expect(count()).toBe('1 entry');
  });

  test('a filter that matches nothing says so', () => {
    mount({ timeEntries: FILTERED.slice(0, 1) });
    choose(customerFilter(), 'c2');
    expect(within(entryList()).getByText('No entries match the filter.')).toBeTruthy();
    expect(count()).toBe('0 entries');
  });

  test('j / k only walk the visible entries and a hidden selection is dropped', () => {
    mount({ timeEntries: FILTERED });
    key('j');
    expect(selected()).toEqual(['legacy-today']);
    choose(customerFilter(), 'c2');
    expect(selected()).toEqual([]);
    key('j');
    key('j');
    key('j');
    expect(selected()).toEqual(['support-yesterday']);
    key('k');
    expect(selected()).toEqual(['support-today']);
  });

  test('/ focuses the customer filter; it is ignored while typing', () => {
    mount({ timeEntries: FILTERED });
    field('Description').focus();
    expect(press(field('Description'), '/')).toBe(true);
    expect(document.activeElement).toBe(field('Description'));
    fireEvent.blur(field('Description'));
    field('Description').blur();
    expect(press(document.body, '/')).toBe(false);
    expect(document.activeElement).toBe(customerFilter());
  });

  test('the filter survives new data and archived items stay selectable', () => {
    mount({ timeEntries: FILTERED });
    choose(customerFilter(), 'c2');
    state.timeEntries = [...FILTERED, entry('support-new', '2026-10-08T08:00:00.000Z', '2026-10-08T08:15:00.000Z', { projectId: 'p3' })];
    emitDataChanged();
    expect(customerFilter().value).toBe('c2');
    expect(descriptions()).toEqual(['support-new', 'support-today', 'support-yesterday']);
    expect(customerFilter().selectedOptions[0].textContent).toBe('Old Co (archived)');
  });

  test('/ is listed in the shortcut cheat-sheet', () => {
    mount();
    expect(within(document.getElementById('tt-help-rows')).getByText('Focus the entry filter')).toBeTruthy();
  });
});
