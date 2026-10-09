import { initStorage, loadTimeTracking } from './storage.js';
import { on, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import { initializeThemeToggle } from './theme.js';
export { addCustomer, addProject } from './timetracking-crud.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('tt-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'tt-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderProjectsPanel(container) {
  const tt = loadTimeTracking();

  container.innerHTML = `
    <div class="tt-projects-panel">
      <h2 class="tt-section-title">Customers &amp; Projects</h2>

      <div class="tt-add-row" aria-label="Add customer">
        <input
          id="tt-new-customer-input"
          class="tt-input"
          type="text"
          placeholder="New customer name"
          aria-label="New customer name"
          autocomplete="off"
          maxlength="120"
        >
        <button id="tt-add-customer-btn" class="tt-btn-add" type="button" aria-label="Add customer">
          <span data-lucide="plus" aria-hidden="true"></span>
          Add customer
        </button>
      </div>

      <div class="tt-add-row" aria-label="Add project">
        <select id="tt-customer-select" class="tt-select" aria-label="Select customer for new project">
          <option value="">— select customer —</option>
          ${tt.customers.filter((c) => !c.archived).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
        </select>
        <input
          id="tt-new-project-input"
          class="tt-input"
          type="text"
          placeholder="New project name"
          aria-label="New project name"
          autocomplete="off"
          maxlength="120"
        >
        <button id="tt-add-project-btn" class="tt-btn-add" type="button" aria-label="Add project">
          <span data-lucide="plus" aria-hidden="true"></span>
          Add project
        </button>
      </div>

      <div class="tt-customer-list" role="list" aria-label="Customers and projects">
        ${tt.customers.length === 0 ? '<p class="tt-empty">No customers yet. Add one above.</p>' : ''}
        ${tt.customers.map((customer) => {
          const projs = tt.projects.filter((p) => p.customerId === customer.id);
          return `
            <div class="tt-customer-item${customer.archived ? ' tt-archived' : ''}" role="listitem" data-customer-id="${esc(customer.id)}">
              <div class="tt-customer-row">
                <span class="tt-color-dot" style="background:${esc(customer.color)};" aria-hidden="true"></span>
                <span class="tt-customer-name">${esc(customer.name)}</span>
                ${customer.archived ? '<span class="tt-tag">archived</span>' : ''}
                <span class="tt-spacer"></span>
                <span class="tt-count">${projs.length} project${projs.length !== 1 ? 's' : ''}</span>
              </div>
              ${projs.length > 0 ? `
              <ul class="tt-project-list" aria-label="Projects for ${esc(customer.name)}">
                ${projs.map((project) => `
                <li class="tt-project-row${project.archived ? ' tt-archived' : ''}" data-project-id="${esc(project.id)}">
                  <span class="tt-color-dot" style="background:${esc(project.color)};" aria-hidden="true"></span>
                  <span class="tt-project-name">${esc(project.name)}</span>
                  ${project.archived ? '<span class="tt-tag">archived</span>' : ''}
                </li>`).join('')}
              </ul>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  renderIcons(container);
  wireProjectsPanel(container);
}

function wireProjectsPanel(container) {
  const customerInput = container.querySelector('#tt-new-customer-input');
  const projectInput = container.querySelector('#tt-new-project-input');
  const addCustomerBtn = container.querySelector('#tt-add-customer-btn');
  const addProjectBtn = container.querySelector('#tt-add-project-btn');
  const customerSelect = container.querySelector('#tt-customer-select');

  // Import dynamically avoids circular dep; crud module has no DOM dependency.
  async function doAddCustomer() {
    const { addCustomer } = await import('./timetracking-crud.js');
    const result = addCustomer(customerInput.value);
    if (!result.ok) {
      const msg = result.reason === 'EMPTY_NAME'
        ? 'Customer name is required.'
        : 'A customer with that name already exists.';
      showToast(msg);
      customerInput.focus();
      return;
    }
    customerInput.value = '';
  }

  async function doAddProject() {
    const { addProject } = await import('./timetracking-crud.js');
    const customerId = customerSelect?.value || '';
    const result = addProject(customerId, projectInput.value);
    if (!result.ok) {
      const msg = result.reason === 'EMPTY_NAME'
        ? 'Project name is required.'
        : result.reason === 'NO_CUSTOMER'
          ? 'Select a customer first.'
          : 'A project with that name already exists for this customer.';
      showToast(msg);
      projectInput.focus();
      return;
    }
    projectInput.value = '';
  }

  customerInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); doAddCustomer(); }
  });

  projectInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); doAddProject(); }
  });

  addCustomerBtn?.addEventListener('click', () => doAddCustomer());
  addProjectBtn?.addEventListener('click', () => doAddProject());
}

// ── Sidebar navigation ─────────────────────────────────────────────────────────

const SECTIONS = ['tracker', 'reports', 'projects', 'settings'];

function showSection(sectionId) {
  for (const id of SECTIONS) {
    const section = document.getElementById(`tt-section-${id}`);
    const navBtn = document.getElementById(`tt-nav-${id}`);
    if (section) section.hidden = id !== sectionId;
    if (navBtn) navBtn.setAttribute('aria-current', id === sectionId ? 'page' : 'false');
  }
  document.body.dataset.ttSection = sectionId;

  if (sectionId === 'projects') {
    const container = document.getElementById('tt-section-projects');
    if (container) renderProjectsPanel(container);
  }
}

function wireSidebar() {
  for (const id of SECTIONS) {
    const btn = document.getElementById(`tt-nav-${id}`);
    btn?.addEventListener('click', () => showSection(id));
  }

  const collapseBtn = document.getElementById('tt-sidebar-toggle');
  const shell = document.getElementById('tt-shell');
  collapseBtn?.addEventListener('click', () => {
    const collapsed = shell?.classList.toggle('sidebar-collapsed');
    collapseBtn.setAttribute('aria-pressed', String(!!collapsed));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    const icon = collapseBtn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', collapsed ? 'panel-left-open' : 'panel-left-close');
      renderIcons(collapseBtn);
    }
  });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────

function wireKeyboard() {
  let pending = null;

  document.addEventListener('keydown', (ev) => {
    const active = document.activeElement;
    const inInput = active && (active.matches('input,textarea,select') || active.isContentEditable);

    // Two-key sequences (g t, g r, g p, g s)
    if (pending === 'g') {
      pending = null;
      if (!inInput) {
        if (ev.key === 't') { ev.preventDefault(); showSection('tracker'); return; }
        if (ev.key === 'r') { ev.preventDefault(); showSection('reports'); return; }
        if (ev.key === 'p') { ev.preventDefault(); showSection('projects'); return; }
        if (ev.key === 's') { ev.preventDefault(); showSection('settings'); return; }
      }
    }

    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;

    if (ev.key === 'g' && !inInput) {
      ev.preventDefault();
      pending = 'g';
      setTimeout(() => { pending = null; }, 1000);
      return;
    }

    if (ev.key === 'Escape') {
      const modal = document.getElementById('tt-help-modal');
      if (modal && !modal.hidden) { modal.hidden = true; return; }
      return;
    }

    if (inInput) return;

    if (ev.key === '?') {
      ev.preventDefault();
      const modal = document.getElementById('tt-help-modal');
      if (modal) modal.hidden = !modal.hidden;
      return;
    }

    if (ev.key === '[' || ev.key === ']') {
      ev.preventDefault();
      // month navigation handled by reports section when active
    }
  });
}

// ── Help modal ─────────────────────────────────────────────────────────────────

function wireHelpModal() {
  const modal = document.getElementById('tt-help-modal');
  const closeBtn = document.getElementById('tt-help-modal-close');
  closeBtn?.addEventListener('click', () => { if (modal) modal.hidden = true; });
  modal?.addEventListener('click', (ev) => { if (ev.target === modal) modal.hidden = true; });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

async function main() {
  initializeThemeToggle();
  wireSidebar();
  wireKeyboard();
  wireHelpModal();
  showSection('projects');

  on(DATA_CHANGED, () => {
    const section = document.body.dataset.ttSection;
    if (section === 'projects') {
      const container = document.getElementById('tt-section-projects');
      if (container) renderProjectsPanel(container);
    }
  });
}

initStorage().then(main).catch((err) => {
  console.error('[Kanvana] Failed to initialise storage for time tracking:', err);
  main();
});
