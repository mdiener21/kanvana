import { loadTimeTracking } from './storage.js';
import { on, off, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import { DEFAULT_APP_KEYBINDINGS, matchesKey } from './constants.js';
import {
  addCustomer, addProject, setCustomerArchived, setProjectArchived, deleteCustomer, deleteProject,
  isCustomerInUse, isProjectInUse, CRUD_ERROR
} from './timetracking-crud.js';
import { escapeHtml } from './security.js';
import { showToast } from './timetracking-toast.js';
import { mountTrackerPanel } from './timetracking-tracker.js';
import { timeTrackingPrefs } from './timetracking-time.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  customer: {
    [CRUD_ERROR.EMPTY_NAME]: 'Customer name is required.',
    [CRUD_ERROR.DUPLICATE_NAME]: 'A customer with that name already exists.'
  },
  project: {
    [CRUD_ERROR.EMPTY_NAME]: 'Project name is required.',
    [CRUD_ERROR.NO_CUSTOMER]: 'Select a customer first.',
    [CRUD_ERROR.DUPLICATE_NAME]: 'A project with that name already exists for this customer.'
  }
};

// ── Projects panel ─────────────────────────────────────────────────────────────

const IN_USE_MESSAGE = 'In use — archive instead';

const ITEM_ACTIONS = {
  customer: { setArchived: setCustomerArchived, remove: deleteCustomer },
  project: { setArchived: setProjectArchived, remove: deleteProject }
};

// aria-disabled rather than disabled: the control stays focusable and hoverable so it can explain itself.
function itemActionsHtml(kind, item, inUse) {
  const id = escapeHtml(item.id);
  const name = escapeHtml(item.name);
  const archiveLabel = `${item.archived ? 'Unarchive' : 'Archive'} ${kind} ${name}`;
  const deleteLabel = `Delete ${kind} ${name}`;
  const hintId = `tt-in-use-${kind}-${id}`;
  return `
    <span class="tt-item-actions">
      <button type="button" class="tt-entry-action" data-action="${item.archived ? 'unarchive' : 'archive'}" data-kind="${kind}" data-id="${id}"
        aria-label="${archiveLabel}" title="${archiveLabel}">
        <span data-lucide="${item.archived ? 'archive-restore' : 'archive'}" aria-hidden="true"></span>
      </button>
      <button type="button" class="tt-entry-action" data-action="delete" data-kind="${kind}" data-id="${id}"
        aria-label="${deleteLabel}" aria-disabled="${inUse}" title="${inUse ? IN_USE_MESSAGE : deleteLabel}"${inUse ? ` aria-describedby="${hintId}"` : ''}>
        <span data-lucide="trash-2" aria-hidden="true"></span>
      </button>
      ${inUse ? `<span id="${hintId}" class="sr-only">${IN_USE_MESSAGE}</span>` : ''}
    </span>`;
}

const PANEL_HTML = `
  <div class="tt-projects-panel">
    <h2 class="tt-section-title">Customers &amp; Projects</h2>

    <div class="tt-add-row" aria-label="Add customer">
      <input id="tt-new-customer-input" class="tt-input" type="text" placeholder="New customer name"
        aria-label="New customer name" autocomplete="off" maxlength="120">
      <button id="tt-add-customer-btn" class="tt-btn-add" type="button" aria-label="Add customer">
        <span data-lucide="plus" aria-hidden="true"></span>
        Add customer
      </button>
    </div>

    <div class="tt-add-row" aria-label="Add project">
      <select id="tt-customer-select" class="tt-select" aria-label="Select customer for new project"></select>
      <input id="tt-new-project-input" class="tt-input" type="text" placeholder="New project name"
        aria-label="New project name" autocomplete="off" maxlength="120">
      <button id="tt-add-project-btn" class="tt-btn-add" type="button" aria-label="Add project">
        <span data-lucide="plus" aria-hidden="true"></span>
        Add project
      </button>
    </div>

    <div class="tt-customer-list" role="list" aria-label="Customers and projects"></div>
  </div>
`;

function customerListHtml(tt) {
  if (tt.customers.length === 0) return '<p class="tt-empty">No customers yet. Add one above.</p>';
  return tt.customers.map((customer) => {
    const projs = tt.projects.filter((p) => p.customerId === customer.id);
    return `
      <div class="tt-customer-item${customer.archived ? ' tt-archived' : ''}" role="listitem" data-customer-id="${escapeHtml(customer.id)}">
        <div class="tt-customer-row">
          <span class="tt-color-dot" style="background:${escapeHtml(customer.color)};" aria-hidden="true"></span>
          <span class="tt-customer-name">${escapeHtml(customer.name)}</span>
          ${customer.archived ? '<span class="tt-tag">archived</span>' : ''}
          <span class="tt-spacer"></span>
          <span class="tt-count">${projs.length} project${projs.length !== 1 ? 's' : ''}</span>
          ${itemActionsHtml('customer', customer, isCustomerInUse(tt, customer.id))}
        </div>
        ${projs.length > 0 ? `
        <ul class="tt-project-list" aria-label="Projects for ${escapeHtml(customer.name)}">
          ${projs.map((project) => `
          <li class="tt-project-row${project.archived ? ' tt-archived' : ''}" data-project-id="${escapeHtml(project.id)}">
            <span class="tt-color-dot" style="background:${escapeHtml(project.color)};" aria-hidden="true"></span>
            <span class="tt-project-name">${escapeHtml(project.name)}</span>
            ${project.archived ? '<span class="tt-tag">archived</span>' : ''}
            ${itemActionsHtml('project', project, isProjectInUse(tt, project.id))}
          </li>`).join('')}
        </ul>` : ''}
      </div>`;
  }).join('');
}

function customerOptionsHtml(tt) {
  return '<option value="">— select customer —</option>'
    + tt.customers.filter((c) => !c.archived).map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
}

export function mountProjectsPanel(container) {
  container.innerHTML = PANEL_HTML;
  renderIcons(container);

  const customerInput = container.querySelector('#tt-new-customer-input');
  const projectInput = container.querySelector('#tt-new-project-input');
  const customerSelect = container.querySelector('#tt-customer-select');
  const list = container.querySelector('.tt-customer-list');

  function refresh() {
    const tt = loadTimeTracking();
    const selected = customerSelect.value;
    customerSelect.innerHTML = customerOptionsHtml(tt);
    customerSelect.value = [...customerSelect.options].some((o) => o.value === selected) ? selected : '';
    list.innerHTML = customerListHtml(tt);
  }

  function submit(input, entity, create) {
    const result = create(input.value);
    if (result.ok) input.value = '';
    else showToast(ERROR_MESSAGES[entity][result.reason]);
    input.focus();
  }

  const submitCustomer = () => submit(customerInput, 'customer', addCustomer);
  const submitProject = () => submit(projectInput, 'project', (name) => addProject(customerSelect.value, name));

  customerInput.addEventListener('keydown', (ev) => {
    if (matchesKey(ev, DEFAULT_APP_KEYBINDINGS.ttSubmitInline)) { ev.preventDefault(); submitCustomer(); }
  });
  projectInput.addEventListener('keydown', (ev) => {
    if (matchesKey(ev, DEFAULT_APP_KEYBINDINGS.ttSubmitInline)) { ev.preventDefault(); submitProject(); }
  });
  container.querySelector('#tt-add-customer-btn').addEventListener('click', submitCustomer);
  container.querySelector('#tt-add-project-btn').addEventListener('click', submitProject);

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const { action, kind, id } = btn.dataset;
    const actions = ITEM_ACTIONS[kind];
    const result = action === 'delete' ? actions.remove(id) : actions.setArchived(id, action === 'archive');
    if (result.reason === CRUD_ERROR.IN_USE) showToast(IN_USE_MESSAGE);
  });

  refresh();
  on(DATA_CHANGED, refresh);
  return () => off(DATA_CHANGED, refresh);
}

// ── Sidebar navigation ─────────────────────────────────────────────────────────

const SECTIONS = ['tracker', 'reports', 'projects', 'settings'];

function showSection(root, sectionId) {
  for (const id of SECTIONS) {
    const section = root.getElementById(`tt-section-${id}`);
    const navBtn = root.getElementById(`tt-nav-${id}`);
    if (section) section.hidden = id !== sectionId;
    if (navBtn) navBtn.setAttribute('aria-current', id === sectionId ? 'page' : 'false');
  }
}

function wireSidebar(root) {
  for (const id of SECTIONS) {
    root.getElementById(`tt-nav-${id}`)?.addEventListener('click', () => showSection(root, id));
  }

  const collapseBtn = root.getElementById('tt-sidebar-toggle');
  const shell = root.getElementById('tt-shell');
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

const {
  ttHelp, ttCloseModal, ttGotoTracker, ttGotoReports, ttGotoProjects, ttGotoSettings,
  ttNewEntry, ttSubmitInline, ttAdjustUp, ttAdjustDown,
  ttSelectNext, ttSelectPrev, ttEditEntry, ttDuplicateEntry, ttDeleteEntry, ttConfirmDelete
} = DEFAULT_APP_KEYBINDINGS;

const GOTO_BINDINGS = [
  { binding: ttGotoTracker, section: 'tracker', label: 'Go to Time Tracker' },
  { binding: ttGotoReports, section: 'reports', label: 'Go to Reports' },
  { binding: ttGotoProjects, section: 'projects', label: 'Go to Projects' },
  { binding: ttGotoSettings, section: 'settings', label: 'Go to Settings' }
];

const HELP_ROWS = [
  { binding: ttNewEntry, label: 'New entry' },
  { binding: ttSubmitInline, label: 'Save entry' },
  { binding: ttAdjustUp, label: '+15 min on Start / End / Duration' },
  { binding: ttAdjustDown, label: '−15 min on Start / End / Duration' },
  { binding: ttSelectNext, label: 'Select next entry' },
  { binding: ttSelectPrev, label: 'Select previous entry' },
  { binding: ttEditEntry, label: 'Edit selected entry' },
  { binding: ttDuplicateEntry, label: 'Duplicate selected entry' },
  { binding: ttDeleteEntry, label: 'Delete selected entry' },
  { binding: ttConfirmDelete, label: 'Confirm delete' },
  ...GOTO_BINDINGS,
  { binding: ttHelp, label: 'This cheat-sheet' },
  { binding: ttCloseModal, label: 'Cancel / close / leave field' }
];

const KEY_LABELS = { Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', Delete: 'Del' };
const SEQUENCE_TIMEOUT_MS = 1000;

function keyLabel(binding) {
  const key = KEY_LABELS[binding.key] ?? binding.key;
  if (binding.seq) return `${key} ${binding.seq}`;
  return binding.altKey ? `Alt+${key}` : key;
}

const secondKey = (binding) => ({ ...binding, key: binding.seq });

function isTyping(el) {
  return !!el && (el.matches('input,textarea,select') || el.isContentEditable);
}

const ENTRY_COMMANDS = [
  { binding: ttSelectNext, command: 'selectNext' },
  { binding: ttSelectPrev, command: 'selectPrev' },
  { binding: ttEditEntry, command: 'editSelected' },
  { binding: ttDuplicateEntry, command: 'duplicateSelected' },
  { binding: ttDeleteEntry, command: 'deleteSelected' }
];

function wireKeyboard(root, tracker) {
  const modal = root.getElementById('tt-help-modal');
  let pendingPrefix = null;
  let pendingTimer = null;

  function onKeyDown(ev) {
    const typing = isTyping(root.activeElement);

    if (pendingPrefix) {
      const prefix = pendingPrefix;
      pendingPrefix = null;
      clearTimeout(pendingTimer);
      const match = !typing && GOTO_BINDINGS.find(({ binding }) =>
        binding.key === prefix && matchesKey(ev, secondKey(binding)));
      if (match) { ev.preventDefault(); showSection(root, match.section); return; }
    }

    if (matchesKey(ev, ttCloseModal)) {
      if (tracker.cancel()) ev.preventDefault();
      else if (modal && !modal.hidden) modal.hidden = true;
      else if (typing) root.activeElement.blur();
      return;
    }

    if (typing || tracker.isEditing()) return;

    if (tracker.isConfirming()) {
      if (matchesKey(ev, ttConfirmDelete)) {
        ev.preventDefault();
        tracker.confirmDelete();
        return;
      }
      tracker.cancel();
    }

    if (matchesKey(ev, ttNewEntry)) {
      ev.preventDefault();
      showSection(root, 'tracker');
      tracker.focusNewEntry();
      return;
    }

    const entryCommand = ENTRY_COMMANDS.find(({ binding }) => matchesKey(ev, binding));
    if (entryCommand) {
      ev.preventDefault();
      tracker[entryCommand.command]();
      return;
    }

    const prefixBinding = GOTO_BINDINGS.find(({ binding }) => matchesKey(ev, binding));
    if (prefixBinding) {
      ev.preventDefault();
      pendingPrefix = prefixBinding.binding.key;
      pendingTimer = setTimeout(() => { pendingPrefix = null; }, SEQUENCE_TIMEOUT_MS);
      return;
    }

    if (matchesKey(ev, ttHelp)) {
      ev.preventDefault();
      if (modal) modal.hidden = !modal.hidden;
    }
  }

  root.addEventListener('keydown', onKeyDown);
  return () => {
    clearTimeout(pendingTimer);
    root.removeEventListener('keydown', onKeyDown);
  };
}

// ── Help modal ─────────────────────────────────────────────────────────────────

function wireHelpModal(root) {
  const modal = root.getElementById('tt-help-modal');
  const rows = root.getElementById('tt-help-rows');
  if (rows) {
    rows.innerHTML = HELP_ROWS
      .map(({ binding, label }) => `<tr><td>${escapeHtml(keyLabel(binding))}</td><td>${escapeHtml(label)}</td></tr>`)
      .join('');
  }
  root.getElementById('tt-help-modal-close')?.addEventListener('click', () => { if (modal) modal.hidden = true; });
  modal?.addEventListener('click', (ev) => { if (ev.target === modal) modal.hidden = true; });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function mountTimeTracking(root = document, { getPrefs = () => timeTrackingPrefs() } = {}) {
  wireSidebar(root);
  wireHelpModal(root);
  const tracker = mountTrackerPanel(root.getElementById('tt-section-tracker'), { getPrefs });
  const unwireKeyboard = wireKeyboard(root, tracker);
  const projects = root.getElementById('tt-section-projects');
  const unmountProjects = projects ? mountProjectsPanel(projects) : () => {};
  showSection(root, 'tracker');
  return () => {
    unwireKeyboard();
    tracker.unmount();
    unmountProjects();
  };
}
