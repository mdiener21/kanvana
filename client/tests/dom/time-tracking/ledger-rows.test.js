import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/dom';
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

const { mountTimeTracking } = await import('../../../src/modules/timetracking-ui.js');

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

const NOW = '2026-10-08T10:00:00.000Z'; // 12:00 in Europe/Berlin
const prefs = () => ({ tz: 'Europe/Berlin', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', now: Date.now() });

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };
const LIME = { id: 'p2', customerId: 'c1', name: 'Lime', color: '#8bc34a', archived: false };

let unmount = null;
const fakeChart = () => ({ setOption() {}, resize() {}, dispose() {} });
const entry = (id, start, end, projectId = 'p1') => ({ id, projectId, description: id, start, end });

function mount(timeEntries) {
  state.customers = [ACME];
  state.projects = [WEBSITE, LIME];
  state.timeEntries = timeEntries;
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document, { getPrefs: prefs, createChart: fakeChart });
}

const entryList = () => screen.getByRole('region', { name: 'Time entries' });
const dayOf = (heading) => within(entryList()).getByRole('list', { name: heading }).closest('.tt-day');
const coverageOf = (heading) => dayOf(heading).querySelector('.tt-day-coverage');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
});

describe('ledger rows', () => {
  test('the project colour shows only on the row rail and the dot; names keep text colours', () => {
    mount([entry('e1', '2026-10-08T07:00:00.000Z', '2026-10-08T08:30:00.000Z', 'p2')]);
    const row = within(entryList()).getByRole('listitem');
    expect(row.style.getPropertyValue('--tt-project-color')).toBe('#8bc34a');
    expect(row.querySelector('.tt-entry-project .tt-color-dot').style.background).toBe('rgb(139, 195, 74)');
    expect(within(row).getByText('Lime').style.color).toBe('');
    expect(within(row).getByText('Acme').style.color).toBe('');
    expect(row.querySelectorAll('[style*="color"]:not(.tt-color-dot)')).toHaveLength(0);
  });
});

describe('day coverage bar', () => {
  test('today shows one block per entry in its project colour and a now-marker, hidden from assistive tech', () => {
    mount([
      entry('a', '2026-10-08T06:00:00.000Z', '2026-10-08T07:00:00.000Z', 'p1'),
      entry('b', '2026-10-08T08:00:00.000Z', '2026-10-08T09:30:00.000Z', 'p2'),
      entry('old', '2026-10-07T07:00:00.000Z', '2026-10-07T08:00:00.000Z')
    ]);
    const bar = coverageOf('Today');
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    const blocks = [...bar.querySelectorAll('.tt-coverage-block')].map((b) => b.style.background);
    expect(blocks.sort()).toEqual(['rgb(139, 195, 74)', 'rgb(3, 169, 244)'].sort());
    expect(bar.querySelectorAll('.tt-coverage-now')).toHaveLength(1);
    // 07:00–19:00 Berlin: 08:00 → 1/12 of the bar, 10:00 → 3/12, now 12:00 → 5/12
    const lefts = [...bar.querySelectorAll('.tt-coverage-block')].map((b) => b.style.left);
    expect(lefts.sort()).toEqual(['25%', '8.33%']);
    expect(bar.querySelector('.tt-coverage-now').style.left).toBe('41.67%');
  });

  test('a past day has blocks but no now-marker', () => {
    mount([entry('old', '2026-10-07T07:00:00.000Z', '2026-10-07T08:00:00.000Z')]);
    const bar = coverageOf('Yesterday');
    expect(bar.querySelectorAll('.tt-coverage-block')).toHaveLength(1);
    expect(bar.querySelector('.tt-coverage-now')).toBeNull();
  });

  test('an entry before 07:00 widens the bar to start at its hour', () => {
    mount([entry('early', '2026-10-07T03:30:00.000Z', '2026-10-07T04:00:00.000Z')]);
    const bar = coverageOf('Yesterday');
    expect(bar.querySelector('.tt-coverage-scale').textContent).toBe('0519');
    expect(bar.querySelector('.tt-coverage-block').style.left).toBe('3.57%');
  });

  test('under a project filter the bar still shows all of the day, like its gaps', () => {
    mount([
      entry('a', '2026-10-08T06:00:00.000Z', '2026-10-08T07:00:00.000Z', 'p1'),
      entry('b', '2026-10-08T08:00:00.000Z', '2026-10-08T09:30:00.000Z', 'p2')
    ]);
    fireEvent.change(screen.getByLabelText('Filter by project'), { target: { value: 'p2' } });
    expect(within(entryList()).getAllByRole('listitem')).toHaveLength(1);
    expect(coverageOf('Today').querySelectorAll('.tt-coverage-block')).toHaveLength(2);
  });

  test('the bar is not a list item, so rows stay the only list entries', () => {
    mount([entry('a', '2026-10-08T06:00:00.000Z', '2026-10-08T07:00:00.000Z')]);
    expect(within(entryList()).getAllByRole('listitem')).toHaveLength(1);
  });
});
