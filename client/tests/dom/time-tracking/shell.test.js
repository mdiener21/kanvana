import { afterEach, beforeEach, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountToBody } from '../setup.js';

vi.mock('../../../src/modules/storage.js', () => ({
  loadTimeTracking: vi.fn(() => ({ customers: [], projects: [], timeEntries: [] }))
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
  expect(keys).toEqual(['n', 'Enter', 'Alt+↑', 'Alt+↓', 'g t', 'g r', 'g p', 'g s', '?', 'Esc']);
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
