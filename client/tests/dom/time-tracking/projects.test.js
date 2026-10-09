import { beforeEach, test, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/dom';
import { mountToBody } from '../setup.js';

// Provide minimal browser API stubs for the module under test
if (typeof window.localStorage === 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} }
  });
}

// Mock heavy dependencies that rely on IDB / emitter internals
vi.mock('../../../src/modules/storage.js', () => ({
  initStorage: vi.fn(() => Promise.resolve()),
  loadTimeTracking: vi.fn(() => ({ customers: [], projects: [], timeEntries: [] }))
}));

vi.mock('../../../src/modules/event-sourcing/emitter.js', () => ({
  scheduleDomainEvent: vi.fn(() => Promise.resolve())
}));

vi.mock('../../../src/modules/events.js', () => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  DATA_CHANGED: 'data:changed'
}));

const { addCustomer, addProject } = await import('../../../src/modules/timetracking-crud.js');
const { loadTimeTracking } = await import('../../../src/modules/storage.js');
const { scheduleDomainEvent } = await import('../../../src/modules/event-sourcing/emitter.js');

// Helper: render the Projects panel HTML into the DOM.
// We replicate the structure rendered by renderProjectsPanel() but simplified
// so we can test the wiring without a running initStorage.
function mountProjectsPanel(customers = [], projects = []) {
  vi.mocked(loadTimeTracking).mockReturnValue({ customers, projects, timeEntries: [] });

  const activeCustomers = customers.filter((c) => !c.archived);

  mountToBody(`
    <div class="tt-projects-panel">
      <div class="tt-add-row">
        <input id="tt-new-customer-input" type="text" aria-label="New customer name">
        <button id="tt-add-customer-btn" type="button">Add customer</button>
      </div>
      <div class="tt-add-row">
        <select id="tt-customer-select" aria-label="Select customer for new project">
          <option value="">— select customer —</option>
          ${activeCustomers.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
        <input id="tt-new-project-input" type="text" aria-label="New project name">
        <button id="tt-add-project-btn" type="button">Add project</button>
      </div>
      <div id="tt-toast" role="status" aria-live="polite"></div>
    </div>
  `);

  // Wire inputs / buttons manually (mirrors wireProjectsPanel)
  const container = document.body;

  const customerInput = container.querySelector('#tt-new-customer-input');
  const projectInput = container.querySelector('#tt-new-project-input');
  const addCustomerBtn = container.querySelector('#tt-add-customer-btn');
  const addProjectBtn = container.querySelector('#tt-add-project-btn');
  const customerSelect = container.querySelector('#tt-customer-select');

  function doAddCustomer() {
    const result = addCustomer(customerInput.value);
    if (!result.ok) {
      const msg = result.reason === 'EMPTY_NAME' ? 'Customer name is required.' : 'A customer with that name already exists.';
      const t = container.querySelector('#tt-toast');
      if (t) t.textContent = msg;
      customerInput.focus();
      return;
    }
    customerInput.value = '';
  }

  function doAddProject() {
    const customerId = customerSelect?.value || '';
    const result = addProject(customerId, projectInput.value);
    if (!result.ok) {
      const msg = result.reason === 'EMPTY_NAME'
        ? 'Project name is required.'
        : result.reason === 'NO_CUSTOMER'
          ? 'Select a customer first.'
          : 'A project with that name already exists for this customer.';
      const t = container.querySelector('#tt-toast');
      if (t) t.textContent = msg;
      projectInput.focus();
      return;
    }
    projectInput.value = '';
  }

  customerInput?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doAddCustomer(); } });
  projectInput?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doAddProject(); } });
  addCustomerBtn?.addEventListener('click', doAddCustomer);
  addProjectBtn?.addEventListener('click', doAddProject);

  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Customer inline creation ───────────────────────────────────────────────────

test('clicking Add customer with a valid name emits customer.created event', () => {
  mountProjectsPanel();
  const input = screen.getByLabelText('New customer name');
  fireEvent.change(input, { target: { value: 'Acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
  expect(scheduleDomainEvent).toHaveBeenCalledOnce();
  expect(scheduleDomainEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'customer.created', scope: 'timetracking' })
  );
});

test('pressing Enter on customer input adds the customer', () => {
  mountProjectsPanel();
  const input = screen.getByLabelText('New customer name');
  fireEvent.change(input, { target: { value: 'Acme' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(scheduleDomainEvent).toHaveBeenCalledOnce();
});

test('customer input clears after a successful add', () => {
  mountProjectsPanel();
  const input = screen.getByLabelText('New customer name');
  fireEvent.change(input, { target: { value: 'Acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
  expect(input.value).toBe('');
});

test('adding a customer with an empty name shows toast and does not emit event', () => {
  mountProjectsPanel();
  const input = screen.getByLabelText('New customer name');
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  const toast = document.getElementById('tt-toast');
  expect(toast?.textContent).toContain('required');
});

test('adding a duplicate customer name shows toast and does not emit event', () => {
  vi.mocked(loadTimeTracking).mockReturnValue({
    customers: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [],
    timeEntries: []
  });
  mountProjectsPanel([{ id: 'c1', name: 'Acme', archived: false }]);
  const input = screen.getByLabelText('New customer name');
  fireEvent.change(input, { target: { value: 'acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  const toast = document.getElementById('tt-toast');
  expect(toast?.textContent).toContain('already exists');
});

// ── Project inline creation ────────────────────────────────────────────────────

test('clicking Add project with a valid customer and name emits project.created event', () => {
  const customers = [{ id: 'c1', name: 'Acme', archived: false }];
  vi.mocked(loadTimeTracking).mockReturnValue({ customers, projects: [], timeEntries: [] });
  mountProjectsPanel(customers);

  const select = screen.getByLabelText('Select customer for new project');
  fireEvent.change(select, { target: { value: 'c1' } });
  const input = screen.getByLabelText('New project name');
  fireEvent.change(input, { target: { value: 'MVP' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));

  expect(scheduleDomainEvent).toHaveBeenCalledOnce();
  expect(scheduleDomainEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'project.created', scope: 'timetracking' })
  );
});

test('pressing Enter on project input adds the project', () => {
  const customers = [{ id: 'c1', name: 'Acme', archived: false }];
  vi.mocked(loadTimeTracking).mockReturnValue({ customers, projects: [], timeEntries: [] });
  mountProjectsPanel(customers);

  const select = screen.getByLabelText('Select customer for new project');
  fireEvent.change(select, { target: { value: 'c1' } });
  const input = screen.getByLabelText('New project name');
  fireEvent.change(input, { target: { value: 'Support' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(scheduleDomainEvent).toHaveBeenCalledOnce();
});

test('project input clears after a successful add', () => {
  const customers = [{ id: 'c1', name: 'Acme', archived: false }];
  vi.mocked(loadTimeTracking).mockReturnValue({ customers, projects: [], timeEntries: [] });
  mountProjectsPanel(customers);

  const select = screen.getByLabelText('Select customer for new project');
  fireEvent.change(select, { target: { value: 'c1' } });
  const input = screen.getByLabelText('New project name');
  fireEvent.change(input, { target: { value: 'MVP' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));

  expect(input.value).toBe('');
});

test('adding a project with no customer selected shows toast', () => {
  mountProjectsPanel();
  const input = screen.getByLabelText('New project name');
  fireEvent.change(input, { target: { value: 'MVP' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));
  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  const toast = document.getElementById('tt-toast');
  expect(toast?.textContent).toContain('customer');
});

test('adding a project with an empty name shows toast', () => {
  const customers = [{ id: 'c1', name: 'Acme', archived: false }];
  vi.mocked(loadTimeTracking).mockReturnValue({ customers, projects: [], timeEntries: [] });
  mountProjectsPanel(customers);

  const select = screen.getByLabelText('Select customer for new project');
  fireEvent.change(select, { target: { value: 'c1' } });
  const input = screen.getByLabelText('New project name');
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));

  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  const toast = document.getElementById('tt-toast');
  expect(toast?.textContent).toContain('required');
});

test('adding a duplicate project within the same customer shows toast', () => {
  const customers = [{ id: 'c1', name: 'Acme', archived: false }];
  const projects = [{ id: 'p1', customerId: 'c1', name: 'Website', archived: false }];
  vi.mocked(loadTimeTracking).mockReturnValue({ customers, projects, timeEntries: [] });
  mountProjectsPanel(customers, projects);

  const select = screen.getByLabelText('Select customer for new project');
  fireEvent.change(select, { target: { value: 'c1' } });
  const input = screen.getByLabelText('New project name');
  fireEvent.change(input, { target: { value: 'website' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));

  expect(scheduleDomainEvent).not.toHaveBeenCalled();
  const toast = document.getElementById('tt-toast');
  expect(toast?.textContent).toContain('already exists');
});
