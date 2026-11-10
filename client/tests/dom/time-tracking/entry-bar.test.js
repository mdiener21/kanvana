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
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

const NOW = '2026-10-08T13:20:00.000Z'; // 15:20 in Europe/Berlin
const prefs = () => ({ tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.now() });

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };

let unmount = null;
const fakeChart = () => ({ setOption() {}, resize() {}, dispose() {} });

function mount(timeEntries = []) {
  state.customers = [ACME];
  state.projects = [WEBSITE];
  state.timeEntries = timeEntries;
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document, { getPrefs: prefs, createChart: fakeChart });
}

const entry = (id, start, end) => ({ id, projectId: 'p1', description: '', start, end });
const bar = () => screen.getByRole('group', { name: 'New time entry' });
const field = (name) => within(bar()).getByLabelText(name);
const type = (name, value) => fireEvent.input(field(name), { target: { value } });
const times = () => ['Start', 'End', 'Duration'].map((n) => field(n).value);
const projectDot = () => bar().querySelector('.tt-entry-project-dot');

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

describe('entry bar layout', () => {
  test('every field has a visible label tied to its input, with the same accessible names as before', () => {
    mount();
    for (const name of ['Description', 'Project', 'Date', 'Start', 'End', 'Duration']) {
      const input = field(name);
      expect(input.tagName).toBe('INPUT');
      expect([...input.labels].map((label) => label.textContent.trim())).toEqual([name]);
      expect(input.hasAttribute('aria-label')).toBe(false);
    }
    expect(within(bar()).getByRole('textbox', { name: 'Description' })).toBe(field('Description'));
    expect(within(bar()).getByRole('combobox', { name: 'Project' })).toBe(field('Project'));
    expect(within(bar()).getByRole('textbox', { name: 'Duration' })).toBe(field('Duration'));
  });

  test('Date, Start, End and Duration form one time block with an arrow between Start and End', () => {
    mount();
    const block = bar().querySelector('.tt-time-block');
    expect(['Date', 'Start', 'End', 'Duration'].every((n) => block.contains(field(n)))).toBe(true);
    const arrow = block.querySelector('.tt-entry-arrow');
    expect(arrow.getAttribute('aria-hidden')).toBe('true');
    const order = (node) => [...block.querySelectorAll('input, .tt-entry-arrow')].indexOf(node);
    expect(order(arrow)).toBe(order(field('Start')) + 1);
    expect(order(field('End'))).toBe(order(arrow) + 1);
  });

  test('placeholder, sentence-case Add button with an Enter hint, and a shorthand hint row', () => {
    mount();
    expect(field('Description').placeholder).toBe('What did you work on?');
    const add = within(bar()).getByRole('button', { name: 'Add entry' });
    expect(add.textContent.replace(/\s+/g, ' ').trim()).toBe('Add Enter');
    expect(add.querySelector('kbd').textContent).toBe('Enter');
    const hint = bar().querySelector('.tt-entry-hint');
    expect([...hint.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['930', '90m', '1.5', 'Alt+↑/↓']);
    expect(hint.textContent).toContain('±15 min');
  });

  test('the Project field shows the selected project colour dot, and none without a project', () => {
    mount();
    expect(projectDot().hidden).toBe(true);
    type('Project', 'website');
    expect(projectDot().hidden).toBe(false);
    expect(projectDot().style.background).toBe('rgb(3, 169, 244)');
    type('Project', '');
    expect(projectDot().hidden).toBe(true);
  });
});

describe('Start continues from the last entry', () => {
  test('today has an entry ending at 14:45 and it is 15:20 → Start 14:45, End 15:20, 0:35', () => {
    mount([
      entry('e1', '2026-10-08T07:00:00.000Z', '2026-10-08T09:00:00.000Z'),
      entry('e2', '2026-10-08T12:00:00.000Z', '2026-10-08T12:45:00.000Z')
    ]);
    expect(times()).toEqual(['14:45', '15:20', '0:35']);
  });

  test("today's latest End later than now → Start = End = now", () => {
    mount([entry('e1', '2026-10-08T13:00:00.000Z', '2026-10-08T14:00:00.000Z')]);
    expect(times()).toEqual(['15:20', '15:20', '0:00']);
  });

  test('no entry today (only yesterday) → Start = End = now', () => {
    mount([entry('e1', '2026-10-07T12:00:00.000Z', '2026-10-07T12:45:00.000Z')]);
    expect(times()).toEqual(['15:20', '15:20', '0:00']);
  });

  test('after saving, the new Start is the saved entry End and focus returns to Description', () => {
    mount();
    type('Project', 'website');
    type('Start', '13:00');
    type('End', '14:10');
    fireEvent.keyDown(field('End'), { key: 'Enter' });

    expect(scheduleDomainEvent).toHaveBeenCalledOnce();
    expect(times()).toEqual(['14:10', '15:20', '1:10']);
    expect(document.activeElement).toBe(field('Description'));
  });
});
