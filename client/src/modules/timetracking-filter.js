import { projectById, customerById } from './timetracking-crud.js';
import { escapeHtml } from './security.js';

export const ALL_ENTRIES = Object.freeze({ customerId: null, projectId: null });

export function filterEntries(tt, filter) {
  const { customerId, projectId } = filter;
  if (!customerId && !projectId) return tt.timeEntries;
  return tt.timeEntries.filter((entry) => {
    if (projectId && entry.projectId !== projectId) return false;
    return !customerId || projectById(tt, entry.projectId)?.customerId === customerId;
  });
}

export function filterOptions(tt, filter) {
  const customers = tt.customers.map(({ id, name, archived }) => ({ id, name, archived: !!archived }));
  const projectGroups = tt.customers
    .filter((customer) => !filter.customerId || customer.id === filter.customerId)
    .map((customer) => ({
      customer: { id: customer.id, name: customer.name, archived: !!customer.archived },
      projects: tt.projects
        .filter((p) => p.customerId === customer.id)
        .map(({ id, name, archived }) => ({ id, name, archived: !!archived }))
    }))
    .filter((group) => group.projects.length > 0);
  return { customers, projectGroups };
}

export function reconcileFilter(tt, filter) {
  const customerId = customerById(tt, filter.customerId) ? filter.customerId : null;
  const project = projectById(tt, filter.projectId);
  const projectFits = project && (!customerId || project.customerId === customerId);
  return { customerId, projectId: projectFits ? filter.projectId : null };
}

const archivedLabel = ({ name, archived }) => (archived ? `${name} (archived)` : name);

const optionHtml = (item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(archivedLabel(item))}</option>`;

function optionsHtml(tt, filter) {
  const { customers, projectGroups } = filterOptions(tt, filter);
  return {
    customers: '<option value="">All customers</option>' + customers.map(optionHtml).join(''),
    projects: '<option value="">All projects</option>' + projectGroups.map(({ customer, projects }) => `
      <optgroup label="${escapeHtml(archivedLabel(customer))}">
        ${projects.map(optionHtml).join('')}
      </optgroup>`).join('')
  };
}

const FILTER_HTML = `
  <div class="tt-filter" role="group" aria-label="Filter entries">
    <select class="tt-select tt-filter-customer" aria-label="Filter by customer"></select>
    <select class="tt-select tt-filter-project" aria-label="Filter by project"></select>
  </div>
`;

export function mountEntryFilter(container, { getTimeTracking, onChange }) {
  container.innerHTML = FILTER_HTML;
  const customerSelect = container.querySelector('.tt-filter-customer');
  const projectSelect = container.querySelector('.tt-filter-project');
  let filter = ALL_ENTRIES;

  function render(tt) {
    const html = optionsHtml(tt, filter);
    customerSelect.innerHTML = html.customers;
    projectSelect.innerHTML = html.projects;
    customerSelect.value = filter.customerId ?? '';
    projectSelect.value = filter.projectId ?? '';
  }

  function apply(next) {
    const tt = getTimeTracking();
    const reconciled = reconcileFilter(tt, next);
    const changed = reconciled.customerId !== filter.customerId || reconciled.projectId !== filter.projectId;
    filter = reconciled;
    render(tt);
    if (changed) onChange(filter);
  }

  const onCustomer = () => apply({ ...filter, customerId: customerSelect.value || null });
  const onProject = () => apply({ ...filter, projectId: projectSelect.value || null });
  customerSelect.addEventListener('change', onCustomer);
  projectSelect.addEventListener('change', onProject);

  render(getTimeTracking());
  return {
    getFilter: () => filter,
    refresh: () => apply(filter),
    focus: () => customerSelect.focus(),
    unmount() {
      customerSelect.removeEventListener('change', onCustomer);
      projectSelect.removeEventListener('change', onProject);
      container.innerHTML = '';
    }
  };
}
