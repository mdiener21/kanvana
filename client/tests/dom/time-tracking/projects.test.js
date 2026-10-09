import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
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
      if (event.type === 'customer.created') state.customers = [...state.customers, event.payload.customer];
      if (event.type === 'project.created') state.projects = [...state.projects, event.payload.project];
      emit(DATA_CHANGED);
      return Promise.resolve();
    })
  };
});

const { mountProjectsPanel } = await import('../../../src/modules/timetracking-ui.js');
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');
const { emit, DATA_CHANGED } = await import('../../../src/modules/events.js');

let unmount = null;

function mount({ customers = [], projects = [] } = {}) {
  state.customers = customers;
  state.projects = projects;
  mountToBody('<section id="tt-section-projects"></section>');
  unmount = mountProjectsPanel(document.getElementById('tt-section-projects'));
}

const customerInput = () => screen.getByLabelText('New customer name');
const projectInput = () => screen.getByLabelText('New project name');
const customerSelect = () => screen.getByLabelText('Select customer for new project');
const toastText = () => document.getElementById('tt-toast')?.textContent ?? '';
const list = () => screen.getByRole('list', { name: 'Customers and projects' });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

test('Enter in the customer input creates the customer and lists it', () => {
  mount();
  fireEvent.input(customerInput(), { target: { value: 'Acme' } });
  fireEvent.keyDown(customerInput(), { key: 'Enter' });

  expect(scheduleDomainEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'customer.created', scope: 'timetracking' })
  );
  expect(within(list()).getByText('Acme')).toBeTruthy();
  expect(customerInput().value).toBe('');
});

test('clicking Add customer creates the customer and keeps focus in the customer input', () => {
  mount();
  customerInput().focus();
  fireEvent.input(customerInput(), { target: { value: 'Acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));

  expect(scheduleDomainEvent).toHaveBeenCalledOnce();
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

  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  expect(toastText()).toContain('required');
});

test('duplicate customer name shows a toast and emits nothing', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.input(customerInput(), { target: { value: 'acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));

  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  expect(toastText()).toContain('already exists');
});

test('Enter in the project input creates the project nested under its customer', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  fireEvent.input(projectInput(), { target: { value: 'Website' } });
  fireEvent.keyDown(projectInput(), { key: 'Enter' });

  expect(scheduleDomainEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'project.created', scope: 'timetracking' })
  );
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

  expect(scheduleDomainEvent).toHaveBeenCalledTimes(2);
  expect(customerSelect().value).toBe('c1');
  expect(document.activeElement).toBe(projectInput());
  expect(state.projects.map((p) => p.name)).toEqual(['Website', 'Support']);
});

test('project without a selected customer shows a toast and emits nothing', () => {
  mount();
  fireEvent.input(projectInput(), { target: { value: 'Website' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));

  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  expect(toastText()).toContain('Select a customer');
});

test('empty project name shows a toast and emits nothing', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });
  fireEvent.keyDown(projectInput(), { key: 'Enter' });

  expect(scheduleDomainEvent).not.toHaveBeenCalled();
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

  expect(scheduleDomainEvent).not.toHaveBeenCalled();
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

  state.customers = [...state.customers, { id: 'c2', name: 'Remote Co', color: '#111', archived: false }];
  emit(DATA_CHANGED);

  expect(within(list()).getByText('Remote Co')).toBeTruthy();
  expect(projectInput().value).toBe('Typing');
  expect(customerSelect().value).toBe('c1');
  expect(document.activeElement).toBe(projectInput());
});

test('selection falls back to the placeholder when the selected customer disappears', () => {
  mount({ customers: [{ id: 'c1', name: 'Acme', color: '#000', archived: false }] });
  fireEvent.change(customerSelect(), { target: { value: 'c1' } });

  state.customers = [{ id: 'c1', name: 'Acme', color: '#000', archived: true }];
  emit(DATA_CHANGED);

  expect(customerSelect().value).toBe('');
});
