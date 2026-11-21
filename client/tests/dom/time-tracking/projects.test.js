import { afterEach, describe, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
import { mountToBody } from '../setup.js';
import { createTestTimeTracking } from '../../fixtures/time-tracking.js';

vi.mock('../../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

const { mountProjectsPanel } = await import('../../../src/modules/timetracking-ui.js');

let unmount = null;
let tt = null;

// The Time Tracking interface folds every event through the real reducer.
function mount({ customers = [], projects = [], timeEntries = [] } = {}) {
  tt = createTestTimeTracking({ customers, projects, timeEntries });
  mountToBody('<section id="tt-section-projects"></section>');
  unmount = mountProjectsPanel(document.getElementById('tt-section-projects'), { timeTracking: tt });
}

// An event from another device.
const receive = (type, entityId, payload = {}) => tt.receive({ type, scope: 'timetracking', entityId, payload });
const lastEmitted = () => tt.emitted.at(-1);

const customerInput = () => screen.getByLabelText('New customer name');
const projectInput = () => screen.getByLabelText('New project name');
const customerSelect = () => screen.getByLabelText('Select customer for new project');
const toastText = () => document.getElementById('tt-toast')?.textContent ?? '';
const list = () => screen.getByRole('list', { name: 'Customers and projects' });

afterEach(() => {
  unmount?.();
  unmount = null;
});

test('Enter in the customer input creates the customer and lists it', () => {
  mount();
  fireEvent.input(customerInput(), { target: { value: 'Acme' } });
  fireEvent.keyDown(customerInput(), { key: 'Enter' });

  expect(tt.emitted).toContainEqual(expect.objectContaining({ type: 'customer.created', scope: 'timetracking' }));
  expect(within(list()).getByText('Acme')).toBeTruthy();
  expect(customerInput().value).toBe('');
});

test('clicking Add customer creates the customer and keeps focus in the customer input', () => {
  mount();
  customerInput().focus();
  fireEvent.input(customerInput(), { target: { value: 'Acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));

  expect(tt.emitted).toHaveLength(1);
  expect(document.activeElement).toBe(customerInput());
});

test('a new customer becomes selectable for projects', () => {
  mount();
  fireEvent.input(customerInput(), { target: { value: 'Acme' } });
  fireEvent.keyDown(customerInput(), { key: 'Enter' });

  expect(within(customerSelect()).getByRole('option', { name: 'Acme' })).toBeTruthy();
});

test('empty customer name shows a toast and emits nothing', () => {
  mount();
  fireEvent.input(customerInput(), { target: { value: '   ' } });
  fireEvent.keyDown(customerInput(), { key: 'Enter' });

  expect(tt.emitted).toEqual([]);
  expect(toastText()).toContain('required');
});

test('duplicate customer name shows a toast and emits nothing', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.input(customerInput(), { target: { value: 'acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));

  expect(tt.emitted).toEqual([]);
  expect(toastText()).toContain('already exists');
});

test('Enter in the project input creates the project nested under its customer', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  fireEvent.input(projectInput(), { target: { value: 'Website' } });
  fireEvent.keyDown(projectInput(), { key: 'Enter' });

  expect(tt.emitted).toContainEqual(expect.objectContaining({ type: 'project.created', scope: 'timetracking' }));
  const projects = screen.getByRole('list', { name: 'Projects for Acme' });
  expect(within(projects).getByText('Website')).toBeTruthy();
  expect(projectInput().value).toBe('');
});

test('after adding a project the customer stays selected and focus stays in the project input', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  projectInput().focus();
  fireEvent.input(projectInput(), { target: { value: 'Website' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));
  fireEvent.input(projectInput(), { target: { value: 'Support' } });
  fireEvent.keyDown(projectInput(), { key: 'Enter' });

  expect(tt.emitted).toHaveLength(2);
  expect(customerSelect().value).toBe('c1');
  expect(document.activeElement).toBe(projectInput());
  expect(tt.state().projects.map((p) => p.name)).toEqual(['Website', 'Support']);
});

test('project without a selected customer shows a toast and emits nothing', () => {
  mount();
  fireEvent.input(projectInput(), { target: { value: 'Website' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));

  expect(tt.emitted).toEqual([]);
  expect(toastText()).toContain('Select a customer');
});

test('empty project name shows a toast and emits nothing', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  fireEvent.keyDown(projectInput(), { key: 'Enter' });

  expect(tt.emitted).toEqual([]);
  expect(toastText()).toContain('required');
});

test('duplicate project within the customer shows a toast and emits nothing', () => {
  mount({
    customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false }]
  });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  fireEvent.input(projectInput(), { target: { value: 'website' } });
  fireEvent.keyDown(projectInput(), { key: 'Enter' });

  expect(tt.emitted).toEqual([]);
  expect(toastText()).toContain('already exists');
});

test('text typed in the other input survives a data-change re-render', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  fireEvent.input(projectInput(), { target: { value: 'Half-typed' } });
  fireEvent.input(customerInput(), { target: { value: 'Globex' } });
  fireEvent.keyDown(customerInput(), { key: 'Enter' });

  expect(projectInput().value).toBe('Half-typed');
  expect(customerSelect().value).toBe('c1');
});

test('a remote data change refreshes the list without touching the forms', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  projectInput().focus();
  fireEvent.input(projectInput(), { target: { value: 'Typing' } });

  receive('customer.created', 'c2', { customer: { id: 'c2', name: 'Remote Co', color: '#111', archived: false } });

  expect(within(list()).getByText('Remote Co')).toBeTruthy();
  expect(projectInput().value).toBe('Typing');
  expect(customerSelect().value).toBe('c1');
  expect(document.activeElement).toBe(projectInput());
});

test('selection falls back to the placeholder when the selected customer disappears', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });

  receive('customer.archived', 'c1');

  expect(customerSelect().value).toBe('');
});

test('a customer can be renamed from the projects list', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.click(screen.getByRole('button', { name: 'Edit customer Acme' }));
  const input = screen.getByRole('textbox', { name: 'Customer name' });
  fireEvent.input(input, { target: { value: 'Acme Ltd' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
  expect(within(list()).getByText('Acme Ltd')).toBeTruthy();
  expect(within(customerSelect()).getByRole('option', { name: 'Acme Ltd' })).toBeTruthy();
});

test('a project can be renamed while keeping its customer', () => {
  mount({
    customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false }]
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit project Website' }));
  fireEvent.input(screen.getByRole('textbox', { name: 'Project name' }), { target: { value: 'Shop' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
  expect(within(screen.getByRole('list', { name: 'Projects for Acme' })).getByText('Shop')).toBeTruthy();
});

test('Enter saves an edited name and Escape cancels an edit', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.click(screen.getByRole('button', { name: 'Edit customer Acme' }));
  let input = screen.getByRole('textbox', { name: 'Customer name' });
  fireEvent.input(input, { target: { value: 'Acme Ltd' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit customer Acme Ltd' }));
  input = screen.getByRole('textbox', { name: 'Customer name' });
  fireEvent.input(input, { target: { value: 'Cancelled' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(within(list()).getByText('Acme Ltd')).toBeTruthy();
});

test('an unrelated data refresh preserves an in-progress project rename', () => {
  mount({
    customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false }]
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit project Website' }));
  fireEvent.input(screen.getByRole('textbox', { name: 'Project name' }), { target: { value: 'Shop' } });
  receive('customer.created', 'c2', { customer: { id: 'c2', name: 'Globex', color: '#111', archived: false } });
  expect(within(list()).getByText('Globex')).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Project name' }).value).toBe('Shop');
  fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
  expect(within(list()).getByText('Shop')).toBeTruthy();
});

test('saving one rename preserves another draft and its keyboard controls', () => {
  mount({
    customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }],
    projects: [{ id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false }]
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit customer Acme' }));
  fireEvent.input(screen.getByRole('textbox', { name: 'Customer name' }), { target: { value: 'Acme Ltd' } });
  fireEvent.click(screen.getByRole('button', { name: 'Edit project Website' }));
  fireEvent.input(screen.getByRole('textbox', { name: 'Project name' }), { target: { value: 'Shop' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
  const input = screen.getByRole('textbox', { name: 'Project name' });
  expect(input.value).toBe('Shop');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(within(list()).getByText('Shop')).toBeTruthy();
});

test('renaming rejects duplicate names and keeps the edit open', () => {
  mount({ customers: [
    { id: 'c1', name: 'Acme', color: '#000', archived: false },
    { id: 'c2', name: 'Globex', color: '#111', archived: false }
  ] });
  fireEvent.click(screen.getByRole('button', { name: 'Edit customer Acme' }));
  fireEvent.input(screen.getByRole('textbox', { name: 'Customer name' }), { target: { value: 'globex' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
  expect(toastText()).toContain('already exists');
  expect(screen.getByRole('textbox', { name: 'Customer name' }).value).toBe('globex');
  expect(tt.emitted).toEqual([]);
});

describe('archive and delete', () => {
  const ACME = { id: 'c1', name: 'Acme', color: '#000', archived: false };
  const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#000', archived: false };
  const ENTRY = { id: 'e1', projectId: 'p1', description: '', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };
  const button = (name) => screen.getByRole('button', { name });
  const customerRow = () => list().querySelector('[data-customer-id="c1"]');
  const projectRow = () => list().querySelector('[data-project-id="p1"]');

  test('archiving a customer emits customer.archived, mutes the row and offers Unarchive', () => {
    mount({ customers: [ACME] });
    fireEvent.click(button('Archive customer Acme'));

    expect(tt.emitted).toContainEqual(expect.objectContaining({ type: 'customer.archived', scope: 'timetracking', entityId: 'c1' }));
    expect(customerRow().classList.contains('tt-archived')).toBe(true);
    fireEvent.click(button('Unarchive customer Acme'));
    expect(lastEmitted()).toMatchObject({ type: 'customer.unarchived' });
    expect(customerRow().classList.contains('tt-archived')).toBe(false);
  });

  test('archiving a project emits project.archived and mutes the row; unarchive restores it', () => {
    mount({ customers: [ACME], projects: [WEBSITE] });
    fireEvent.click(button('Archive project Website'));

    expect(tt.emitted).toContainEqual(expect.objectContaining({ type: 'project.archived', scope: 'timetracking', entityId: 'p1' }));
    expect(projectRow().classList.contains('tt-archived')).toBe(true);
    fireEvent.click(button('Unarchive project Website'));
    expect(lastEmitted()).toMatchObject({ type: 'project.unarchived' });
    expect(projectRow().classList.contains('tt-archived')).toBe(false);
  });

  test('delete of a referenced item is disabled and explains why', () => {
    mount({ customers: [ACME], projects: [WEBSITE], timeEntries: [ENTRY] });

    for (const name of ['Delete customer Acme', 'Delete project Website']) {
      const del = button(name);
      expect(del.getAttribute('aria-disabled')).toBe('true');
      expect(del.title).toBe('In use — archive instead');
      expect(document.getElementById(del.getAttribute('aria-describedby')).textContent).toBe('In use — archive instead');
      fireEvent.click(del);
    }
    expect(tt.emitted).toEqual([]);
    expect(toastText()).toBe('In use — archive instead');
  });

  test('delete of an unreferenced project emits project.deleted and removes it; then its customer can go', () => {
    mount({ customers: [ACME], projects: [WEBSITE] });
    expect(button('Delete customer Acme').getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button('Delete project Website'));
    expect(tt.emitted).toContainEqual(expect.objectContaining({ type: 'project.deleted', scope: 'timetracking', entityId: 'p1' }));
    expect(projectRow()).toBeNull();

    expect(button('Delete customer Acme').getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(button('Delete customer Acme'));
    expect(lastEmitted()).toMatchObject({ type: 'customer.deleted', entityId: 'c1' });
    expect(customerRow()).toBeNull();
  });
});

describe('Work week editor', () => {
  const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
  const editor = (name = 'Acme') => within(list()).getByRole('group', { name: `Work week for ${name}` });
  const summary = (name) => editor(name).querySelector('summary');
  const hours = (name = 'Acme') => within(list()).getByLabelText(`Weekly hours for ${name}`);
  const day = (dayName, name = 'Acme') => within(within(list()).getByRole('group', { name: `Workdays for ${name}` }))
    .getByRole('checkbox', { name: dayName });
  const lastEvent = lastEmitted;

  test('is collapsed by default and summarises a Customer stored before Work weeks as "No target"', () => {
    mount({ customers: [ACME] });
    expect(editor().open).toBe(false);
    expect(summary().textContent.replace(/\s+/g, ' ').trim()).toBe('Work week No target');
    fireEvent.click(summary());
    expect(day('Mon').checked).toBe(true);
    expect(day('Fri').checked).toBe(true);
    expect(day('Sat').checked).toBe(false);
    expect(hours().value).toBe('');
  });

  test('summarises Weekly hours and Workdays', () => {
    mount({ customers: [
      { ...ACME, weeklyHours: 40, workdays: [1, 2, 3, 4, 5] },
      { id: 'c2', name: 'Beta', color: '#111111', archived: false, weeklyHours: 24, workdays: [1, 2, 3] },
      { id: 'c3', name: 'Gamma', color: '#222222', archived: false, weeklyHours: 7.5, workdays: [1, 3, 4, 5] }
    ] });
    expect(summary('Acme').textContent).toContain('40h · Mon–Fri');
    expect(summary('Beta').textContent).toContain('24h · Mon–Wed');
    expect(summary('Gamma').textContent).toContain('7.5h · Mon, Wed–Fri');
  });

  test('Weekly hours is a decimal input with step 0.5, above 0 and no maximum, and saves on change', () => {
    mount({ customers: [ACME] });
    expect(hours().type).toBe('number');
    expect(hours().getAttribute('inputmode')).toBe('decimal');
    expect(hours().getAttribute('step')).toBe('0.5');
    expect(hours().hasAttribute('max')).toBe(false);
    fireEvent.change(hours(), { target: { value: '37.5' } });
    expect(lastEvent()).toMatchObject({
      type: 'customer.updated', scope: 'timetracking', entityId: 'c1',
      payload: { fields: { weeklyHours: 37.5 }, before: { weeklyHours: null } }
    });
    expect(summary().textContent).toContain('37.5h · Mon–Fri');
  });

  test('keeps the editor open and focus on the input across the re-render a save causes', () => {
    mount({ customers: [ACME] });
    fireEvent.click(summary());
    editor().open = true;
    hours().focus();
    fireEvent.change(hours(), { target: { value: '40' } });
    expect(editor().open).toBe(true);
    expect(document.activeElement).toBe(hours());
  });

  test('clearing Weekly hours removes them, switching the Target off', () => {
    mount({ customers: [{ ...ACME, weeklyHours: 40, workdays: [1, 2, 3, 4, 5] }] });
    expect(hours().value).toBe('40');
    fireEvent.change(hours(), { target: { value: '' } });
    expect(lastEvent().payload).toEqual({ fields: { weeklyHours: null }, before: { weeklyHours: 40 } });
    expect(summary().textContent).toContain('No target');
  });

  test('a zero or negative value is not saved', () => {
    mount({ customers: [{ ...ACME, weeklyHours: 40 }] });
    fireEvent.change(hours(), { target: { value: '0' } });
    fireEvent.change(hours(), { target: { value: '-5' } });
    expect(tt.emitted).toEqual([]);
    expect(hours().value).toBe('40');
  });

  test('each Workday tick saves, and the last ticked day is disabled', () => {
    mount({ customers: [{ ...ACME, weeklyHours: 16, workdays: [4, 5] }] });
    fireEvent.click(day('Fri'));
    expect(lastEvent()).toMatchObject({
      type: 'customer.updated', entityId: 'c1', payload: { fields: { workdays: [4] }, before: { workdays: [4, 5] } }
    });
    expect(day('Thu').checked).toBe(true);
    expect(day('Thu').disabled).toBe(true);
    fireEvent.click(day('Mon'));
    expect(lastEvent().payload.fields).toEqual({ workdays: [1, 4] });
    expect(day('Thu').disabled).toBe(false);
    expect(summary().textContent).toContain('16h · Mon, Thu');
  });

  test('an archived Customer\'s Work week stays editable', () => {
    mount({ customers: [{ ...ACME, archived: true }] });
    expect(hours().disabled).toBe(false);
    fireEvent.change(hours(), { target: { value: '20' } });
    expect(lastEvent()).toMatchObject({ type: 'customer.updated', payload: { fields: { weeklyHours: 20 } } });
    fireEvent.click(day('Wed'));
    expect(lastEvent().payload.fields).toEqual({ workdays: [1, 2, 4, 5] });
  });

  test('is keyboard operable with labelled controls', () => {
    mount({ customers: [ACME] });
    expect(summary().tagName).toBe('SUMMARY');
    for (const control of [hours(), day('Mon'), day('Sun')]) {
      expect(control.tabIndex).toBe(0);
      expect(control.labels.length).toBeGreaterThan(0);
    }
    expect(day('Sun').labels[0].textContent.trim()).toBe('Sun');
    expect(hours().labels[0].textContent).toContain('Weekly hours');
  });
});
