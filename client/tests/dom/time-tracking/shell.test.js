import { afterEach, beforeEach, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountToBody } from '../setup.js';

vi.mock('../../../src/modules/storage.js', () => ({
  loadTimeTracking: vi.fn(() => ({ customers: [], projects: [], timeEntries: [] })),
  loadGlobalSettings: vi.fn(() => ({}))
}));

vi.mock('../../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

vi.mock('../../../src/modules/event-sourcing/emitter.js', () => ({
  scheduleDomainEvent: vi.fn(() => Promise.resolve())
}));

const { mountTimeTracking } = await import('../../../src/modules/timetracking-ui.js');

const pageHtml = readFileSync(resolve(__dirname, '../../../src/timetracking.html'), 'utf-8');
const bodyHtml = pageHtml.slice(pageHtml.indexOf('<body>') + 6, pageHtml.indexOf('</body>'));

let unmount = null;

beforeEach(() => {
  mountToBody(bodyHtml);
  unmount = mountTimeTracking(document);
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

const helpModal = () => document.getElementById('tt-help-modal');
const section = (id) => document.getElementById(`tt-section-${id}`);

test('starts on the Time Tracker section', () => {
  expect(section('tracker').hidden).toBe(false);
  expect(section('projects').hidden).toBe(true);
  expect(document.getElementById('tt-nav-tracker').getAttribute('aria-current')).toBe('page');
  expect(screen.getByLabelText('Description')).toBeTruthy();
});

test('? opens the cheat-sheet and Escape closes it', () => {
  expect(helpModal().hidden).toBe(true);
  fireEvent.keyDown(document, { key: '?', shiftKey: true });
  expect(helpModal().hidden).toBe(false);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(helpModal().hidden).toBe(true);
});

test('cheat-sheet lists only implemented shortcuts', () => {
  const table = within(helpModal()).getByRole('table', { hidden: true });
  const keys = within(table).getAllByRole('row', { hidden: true }).map((row) => row.cells[0].textContent);
  expect(keys).toEqual([
    'n', 'Enter', '/', 'Alt+↑', 'Alt+↓', 'j', 'k', 'e', 'd', 'Del', 'y', '[', ']', 'g t', 'g r', 'g p', 'g s', '?', 'Esc'
  ]);
});

test('g then t switches to the Time Tracker section', () => {
  fireEvent.click(document.getElementById('tt-nav-projects'));
  fireEvent.keyDown(document, { key: 'g' });
  fireEvent.keyDown(document, { key: 't' });
  expect(section('tracker').hidden).toBe(false);
  expect(section('projects').hidden).toBe(true);
  expect(document.getElementById('tt-nav-tracker').getAttribute('aria-current')).toBe('page');
});

test('goto sequences are ignored while typing in an input', () => {
  const input = screen.getByLabelText('Description');
  input.focus();
  fireEvent.keyDown(input, { key: 'g' });
  fireEvent.keyDown(input, { key: 's' });
  expect(section('settings').hidden).toBe(true);
  expect(section('tracker').hidden).toBe(false);
});

test('clicking a sidebar entry switches section', () => {
  fireEvent.click(document.getElementById('tt-nav-reports'));
  expect(section('reports').hidden).toBe(false);
});

const reportMonth = () => screen.getByTestId('tt-report-period').textContent;
const gotoReports = () => {
  fireEvent.keyDown(document, { key: 'g' });
  fireEvent.keyDown(document, { key: 'r' });
};

test('g then r opens Reports on the current month', () => {
  gotoReports();
  expect(section('reports').hidden).toBe(false);
  expect(document.getElementById('tt-nav-reports').getAttribute('aria-current')).toBe('page');
  const now = new Date();
  const expected = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now);
  expect(reportMonth()).toBe(expected);
  expect(screen.getByRole('status').textContent).toBe('No time tracked this month');
});

test('[ and ] switch the month on Reports', () => {
  gotoReports();
  const start = reportMonth();
  fireEvent.keyDown(document, { key: '[' });
  const previous = reportMonth();
  expect(previous).not.toBe(start);
  fireEvent.keyDown(document, { key: ']' });
  expect(reportMonth()).toBe(start);
  fireEvent.keyDown(document, { key: ']' });
  expect(reportMonth()).not.toBe(start);
});

test('with Week selected, [ and ] step whole weeks', () => {
  gotoReports();
  fireEvent.click(screen.getByRole('button', { name: 'Week' }));
  const start = reportMonth();
  expect(start).toMatch(/^W\d+ · /);
  fireEvent.keyDown(document, { key: '[' });
  expect(reportMonth()).toMatch(/^W\d+ · /);
  expect(reportMonth()).not.toBe(start);
  fireEvent.keyDown(document, { key: ']' });
  expect(reportMonth()).toBe(start);
});

test('[ and ] do nothing outside Reports or while typing', () => {
  gotoReports();
  const start = reportMonth();
  const filter = screen.getByLabelText('Filter report by customer');
  filter.focus();
  fireEvent.keyDown(filter, { key: '[' });
  expect(reportMonth()).toBe(start);
  filter.blur();
  fireEvent.click(document.getElementById('tt-nav-tracker'));
  fireEvent.keyDown(document, { key: '[' });
  fireEvent.click(document.getElementById('tt-nav-reports'));
  expect(reportMonth()).toBe(start);
});

test('/ on Reports focuses the report filter and stays on Reports', () => {
  gotoReports();
  fireEvent.keyDown(document, { key: '/' });
  expect(section('reports').hidden).toBe(false);
  expect(document.activeElement).toBe(screen.getByLabelText('Filter report by customer'));
});

const pressSequence = (...keys) => keys.forEach((key) => fireEvent.keyDown(document, { key }));

test.each([
  ['t', 'tracker', 'Time Tracker'],
  ['r', 'reports', 'Reports'],
  ['p', 'projects', 'Customers & Projects'],
  ['s', 'settings', 'Settings']
])('g then %s moves focus to the %s heading', (key, id, heading) => {
  fireEvent.click(document.getElementById(key === 't' ? 'tt-nav-projects' : 'tt-nav-tracker'));
  pressSequence('g', key);
  expect(document.activeElement).toBe(within(section(id)).getByRole('heading', { name: heading }));
});

test('switching sections by shortcut keeps the heading out of the Tab order', () => {
  pressSequence('g', 'p');
  expect(document.activeElement.tabIndex).toBe(-1);
});

test('? moves focus into the cheat-sheet and Escape restores it', () => {
  const navBtn = document.getElementById('tt-nav-reports');
  navBtn.focus();
  fireEvent.keyDown(navBtn, { key: '?', shiftKey: true });
  expect(helpModal().contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(helpModal().hidden).toBe(true);
  expect(document.activeElement).toBe(navBtn);
});

test('Tab and Shift+Tab stay inside the open cheat-sheet', () => {
  fireEvent.keyDown(document, { key: '?', shiftKey: true });
  for (const shiftKey of [false, true]) {
    const notPrevented = fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey });
    expect(notPrevented).toBe(false);
    expect(helpModal().contains(document.activeElement)).toBe(true);
  }
});

test('closing the cheat-sheet with its Close button restores focus', () => {
  const navBtn = document.getElementById('tt-nav-settings');
  navBtn.focus();
  fireEvent.keyDown(navBtn, { key: '?', shiftKey: true });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(helpModal().hidden).toBe(true);
  expect(document.activeElement).toBe(navBtn);
});

test('shortcuts other than Esc do not reach the page behind the open cheat-sheet', () => {
  fireEvent.keyDown(document, { key: '?', shiftKey: true });
  pressSequence('g', 's');
  expect(section('settings').hidden).toBe(true);
  expect(helpModal().hidden).toBe(false);
});
