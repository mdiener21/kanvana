import { loadLabels, loadColumns, loadTasks, loadSettings, COLUMN_ID_TODO } from './storage.js';
import { addTask, updateTask, deleteTask } from './tasks.js';
import { addColumn, updateColumn, deleteColumn } from './columns.js';
import { addLabel, updateLabel, deleteLabel } from './labels.js';
import {
  ensureBoardsInitialized,
  listBoards,
  getActiveBoardId,
  setActiveBoardId,
  getActiveBoardName,
  renameBoard,
  deleteBoard as deleteBoardById
} from './storage.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { renderIcons } from './icons.js';
import { exportBoard } from './importexport.js';
import { validateAndShowTaskTitleError, validateAndShowColumnNameError, clearFieldError } from './validation.js';
import { createAccordionSection } from './accordion.js';

// Modal state
let currentColumn = 'todo';
let editingTaskId = null;
let editingColumnId = null;
let editingLabelId = null;
let editingBoardId = null;
let selectedTaskLabels = [];
let returnToTaskModalAfterLabelsManager = false;
let selectCreatedLabelInTaskEditor = false;
const MAX_LABEL_NAME_LENGTH = 40;
let hasShownLabelMaxLengthAlert = false;

function setTaskModalFullscreen(isFullscreen) {
  const modal = document.getElementById('task-modal');
  if (!modal) return;
  modal.classList.toggle('fullscreen', !!isFullscreen);

  const btn = document.getElementById('task-fullpage-btn');
  btn?.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
  
  // Update icon and title based on state
  if (btn) {
    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isFullscreen ? 'minimize-2' : 'maximize-2');
    }
    btn.title = isFullscreen ? 'Exit full page' : 'Open in full page';
  }
  
  // Re-render icons after changing the icon name
  renderIcons();
}

function isModalOpen(modalId) {
  const modal = document.getElementById(modalId);
  return !!modal && !modal.classList.contains('hidden');
}

/**
 * Generic modal close handler setup.
 * Automatically wires up backdrop click, close buttons (X), and cancel buttons.
 * @param {string} modalId - The ID of the modal element
 * @param {Function} closeHandler - The function to call when closing
 */
function setupModalCloseHandlers(modalId, closeHandler) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  // Backdrop click
  const backdrop = modal.querySelector('.modal-backdrop');
  backdrop?.addEventListener('click', closeHandler);

  // Close buttons (X icons) and cancel buttons - match by ID pattern
  const closeButtons = modal.querySelectorAll(
    '[id$="-close-btn"], [id$="-close-modal-btn"], [id$="-cancel-btn"], [id^="cancel-"]'
  );
  closeButtons.forEach((btn) => {
    btn.addEventListener('click', closeHandler);
  });
}

function temporarilyHideTaskModalForLabelsManager() {
  const taskModal = document.getElementById('task-modal');
  if (!taskModal) return;
  taskModal.classList.add('hidden');
}

function restoreTaskModalAfterLabelsManager() {
  const taskModal = document.getElementById('task-modal');
  if (!taskModal) return;

  taskModal.classList.remove('hidden');
  updateTaskLabelsSelection();
  document.getElementById('task-label-search')?.focus();
  returnToTaskModalAfterLabelsManager = false;
}

function getTaskLabelSearchQuery() {
  const input = document.getElementById('task-label-search');
  return (input?.value || '').trim().toLowerCase();
}

function getLabelsManagerSearchQuery() {
  const input = document.getElementById('labels-search');
  return (input?.value || '').trim().toLowerCase();
}

function renderActiveTaskLabels() {
  const container = document.getElementById('task-active-labels');
  if (!container) return;

  const allLabels = loadLabels();
  // De-dupe while preserving order
  const uniqueSelected = [];
  for (const labelId of selectedTaskLabels) {
    if (!uniqueSelected.includes(labelId)) uniqueSelected.push(labelId);
  }
  selectedTaskLabels = uniqueSelected;

  const selectedLabels = uniqueSelected
    .map((id) => allLabels.find((l) => l.id === id))
    .filter(Boolean);

  container.innerHTML = '';
  container.style.display = selectedLabels.length > 0 ? 'flex' : 'none';

  selectedLabels.forEach((label) => {
    const pill = document.createElement('span');
    pill.classList.add('task-label');
    pill.style.backgroundColor = label.color;
    pill.textContent = label.name;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.classList.add('active-label-remove');
    removeBtn.setAttribute('aria-label', `Remove label ${label.name}`);
    removeBtn.title = 'Remove label';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedTaskLabels = selectedTaskLabels.filter((id) => id !== label.id);
      renderActiveTaskLabels();
      updateTaskLabelsSelection();
    });

    pill.appendChild(removeBtn);
    container.appendChild(pill);
  });
}

export { setupModalCloseHandlers };

export function showModal(columnName) {
  currentColumn = columnName || loadColumns()[0]?.id || COLUMN_ID_TODO;
  editingTaskId = null;
  selectedTaskLabels = [];
  returnToTaskModalAfterLabelsManager = false;
  selectCreatedLabelInTaskEditor = false;

  // Add task: keep the modal in its default size and hide full-page toggle.
  setTaskModalFullscreen(false);
  document.getElementById('task-fullpage-btn')?.classList.add('hidden');
  
  const modal = document.getElementById('task-modal');
  const columnSelect = document.getElementById('task-column');
  const taskTitle = document.getElementById('task-title');
  const taskDescription = document.getElementById('task-description');
  const taskPriority = document.getElementById('task-priority');
  const taskDueDate = document.getElementById('task-due-date');
  const modalTitle = document.getElementById('task-modal-title');
  const submitBtn = document.getElementById('task-submit-btn');
  
  // Clear error state on the title field
  clearFieldError(taskTitle);
  
  modalTitle.textContent = 'Add New Task';
  submitBtn.textContent = 'Add Task';
  columnSelect.value = currentColumn;
  taskTitle.value = '';
  taskDescription.value = '';
  if (taskPriority) {
    const settings = loadSettings();
    taskPriority.value = settings.defaultPriority || 'none';
  }
  if (taskDueDate) taskDueDate.value = '';

  const labelSearch = document.getElementById('task-label-search');
  if (labelSearch) labelSearch.value = '';

  updateTaskLabelsSelection();
  modal.classList.remove('hidden');
  taskTitle.focus();
}

export function showEditModal(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  editingTaskId = taskId;
  selectedTaskLabels = task.labels || [];
  returnToTaskModalAfterLabelsManager = false;
  selectCreatedLabelInTaskEditor = false;

  // Edit task: allow user to toggle full-page mode.
  setTaskModalFullscreen(false);
  document.getElementById('task-fullpage-btn')?.classList.remove('hidden');
  
  const modal = document.getElementById('task-modal');
  const columnSelect = document.getElementById('task-column');
  const taskTitle = document.getElementById('task-title');
  const taskDescription = document.getElementById('task-description');
  const taskPriority = document.getElementById('task-priority');
  const taskDueDate = document.getElementById('task-due-date');
  const modalTitle = document.getElementById('task-modal-title');
  const submitBtn = document.getElementById('task-submit-btn');
  
  // Clear error state on the title field
  clearFieldError(taskTitle);
  
  modalTitle.textContent = 'Edit Task';
  submitBtn.textContent = 'Save Changes';
  columnSelect.value = task.column;

  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  taskTitle.value = (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  taskDescription.value = typeof task.description === 'string' ? task.description : '';
  if (taskPriority) taskPriority.value = typeof task.priority === 'string' ? task.priority : 'none';

  const rawDue = typeof task.dueDate === 'string' ? task.dueDate : '';
  // If dueDate is ISO, reduce to YYYY-MM-DD for <input type="date">
  const dueForInput = rawDue.includes('T') ? rawDue.slice(0, 10) : rawDue;
  if (taskDueDate) taskDueDate.value = dueForInput;

  const labelSearch = document.getElementById('task-label-search');
  if (labelSearch) labelSearch.value = '';

  updateTaskLabelsSelection();
  modal.classList.remove('hidden');
  taskTitle.focus();
}

function hideModal() {
  const modal = document.getElementById('task-modal');
  modal.classList.add('hidden');
  editingTaskId = null;
  returnToTaskModalAfterLabelsManager = false;

  setTaskModalFullscreen(false);
  document.getElementById('task-fullpage-btn')?.classList.add('hidden');
}

export function showColumnModal() {
  editingColumnId = null;
  const modal = document.getElementById('column-modal');
  const columnName = document.getElementById('column-name');
  const columnColor = document.getElementById('column-color');
  const modalTitle = document.getElementById('column-modal-title');
  const submitBtn = document.getElementById('column-submit-btn');
  
  // Clear error state on the name field
  clearFieldError(columnName);
  
  modalTitle.textContent = 'Add New Column';
  submitBtn.textContent = 'Add Column';
  columnName.value = '';
  if (columnColor) columnColor.value = '#3b82f6';
  modal.classList.remove('hidden');
  columnName.focus();
}

export function showEditColumnModal(columnId) {
  const columns = loadColumns();
  const column = columns.find(c => c.id === columnId);
  if (!column) return;
  
  editingColumnId = columnId;
  const modal = document.getElementById('column-modal');
  const columnName = document.getElementById('column-name');
  const columnColor = document.getElementById('column-color');
  const modalTitle = document.getElementById('column-modal-title');
  const submitBtn = document.getElementById('column-submit-btn');
  
  // Clear error state on the name field
  clearFieldError(columnName);
  
  modalTitle.textContent = 'Edit Column';
  submitBtn.textContent = 'Save Changes';
  columnName.value = column.name;
  if (columnColor) columnColor.value = column.color || '#3b82f6';
  modal.classList.remove('hidden');
  columnName.focus();
}

function hideColumnModal() {
  const modal = document.getElementById('column-modal');
  modal.classList.add('hidden');
  editingColumnId = null;
}

export function showLabelsModal() {
  const input = document.getElementById('labels-search');
  if (input) input.value = '';
  renderLabelsList();
  const modal = document.getElementById('labels-modal');
  modal.classList.remove('hidden');

  // If the labels manager was opened from the task modal, the caller will
  // choose focus (currently the Add Label button). Otherwise focus search.
  if (!returnToTaskModalAfterLabelsManager) {
    document.getElementById('labels-search')?.focus();
  }
}

function hideLabelsModal() {
  const modal = document.getElementById('labels-modal');
  modal.classList.add('hidden');

  const input = document.getElementById('labels-search');
  if (input) input.value = '';

  if (returnToTaskModalAfterLabelsManager) {
    restoreTaskModalAfterLabelsManager();
  }
}

export function showHelpModal() {
  const modal = document.getElementById('help-modal');
  modal.classList.remove('hidden');
}

function hideHelpModal() {
  const modal = document.getElementById('help-modal');
  modal.classList.add('hidden');
}

export function hideLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) modal.classList.add('hidden');
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isValidHexColor(value) {
  return HEX_COLOR_RE.test(value);
}

function updateLabelColorHex(color) {
  const hexInput = document.getElementById('label-color-hex');
  if (!hexInput) return;
  hexInput.value = color;
  hexInput.classList.remove('invalid');
}

function populateLabelGroupSuggestions() {
  const datalist = document.getElementById('label-group-suggestions');
  if (!datalist) return;
  datalist.innerHTML = '';
  const labels = loadLabels();
  const groups = [...new Set(
    labels.map(l => (l.group || '').trim()).filter(g => g.length > 0)
  )].sort((a, b) => a.localeCompare(b));
  groups.forEach(g => {
    const option = document.createElement('option');
    option.value = g;
    datalist.appendChild(option);
  });
}

function showLabelModal(labelId = null, { openedFromTaskEditor = false, initialName = '' } = {}) {
  editingLabelId = labelId;
  hasShownLabelMaxLengthAlert = false;
  selectCreatedLabelInTaskEditor = !!openedFromTaskEditor;
  const modal = document.getElementById('label-modal');
  const modalTitle = document.getElementById('label-modal-title');
  const nameInput = document.getElementById('label-name');
  const colorInput = document.getElementById('label-color');
  const groupInput = document.getElementById('label-group');
  const submitBtn = document.getElementById('label-submit-btn');

  if (labelId) {
    const labels = loadLabels();
    const label = labels.find(l => l.id === labelId);
    if (label) {
      modalTitle.textContent = 'Edit Label';
      submitBtn.textContent = 'Update Label';
      nameInput.value = label.name;
      colorInput.value = label.color;
      if (groupInput) groupInput.value = label.group || '';
    }
  } else {
    modalTitle.textContent = 'Add Label';
    submitBtn.textContent = 'Add Label';
    nameInput.value = initialName || '';
    colorInput.value = '#3b82f6';
    if (groupInput) groupInput.value = '';
  }

  populateLabelGroupSuggestions();
  updateLabelColorHex(colorInput.value);
  modal.classList.remove('hidden');
  nameInput.focus();
}

function hideLabelModal() {
  const modal = document.getElementById('label-modal');
  modal.classList.add('hidden');
  editingLabelId = null;
  selectCreatedLabelInTaskEditor = false;
}

function createLabelListItem(label) {
  const labelItem = document.createElement('div');
  labelItem.classList.add('label-item');
  labelItem.style.display = 'flex';
  labelItem.style.alignItems = 'center';
  labelItem.style.justifyContent = 'space-between';

  const labelSpan = document.createElement('span');
  labelSpan.classList.add('task-label');
  labelSpan.style.backgroundColor = label.color;
  labelSpan.textContent = label.name;

  const actionsDiv = document.createElement('div');
  actionsDiv.classList.add('label-actions');
  actionsDiv.style.display = 'flex';
  actionsDiv.style.gap = '4px';

  const editBtn = document.createElement('button');
  editBtn.classList.add('btn-small');
  const editIcon = document.createElement('span');
  editIcon.dataset.lucide = 'pencil';
  editBtn.appendChild(editIcon);
  editBtn.title = 'Edit label';
  editBtn.addEventListener('click', () => showLabelModal(label.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.classList.add('btn-small', 'btn-danger');
  const deleteIcon = document.createElement('span');
  deleteIcon.dataset.lucide = 'trash-2';
  deleteBtn.appendChild(deleteIcon);
  deleteBtn.title = 'Delete label';
  deleteBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete Label',
      message: `Delete label "${label.name}"? This will remove it from all tasks.`,
      confirmText: 'Delete'
    });
    if (ok) {
      deleteLabel(label.id);
      renderLabelsList();
      const { renderBoard } = await import('./render.js');
      renderBoard();
    }
  });

  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  labelItem.appendChild(labelSpan);
  labelItem.appendChild(actionsDiv);
  return labelItem;
}

function groupLabels(labels) {
  const ungrouped = labels.filter(l => !(l.group || '').trim());
  const groupMap = new Map();
  labels.forEach(label => {
    const group = (label.group || '').trim();
    if (!group) return;
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group).push(label);
  });
  const sortedGroups = [...groupMap.keys()].sort((a, b) => a.localeCompare(b));
  return { ungrouped, groupMap, sortedGroups };
}

function renderLabelsList() {
  const container = document.getElementById('labels-list');
  container.innerHTML = '';

  const labels = loadLabels();
  const query = getLabelsManagerSearchQuery();
  const filtered = query
    ? labels.filter((label) => {
        const name = (label.name || '').toLowerCase();
        const id = (label.id || '').toLowerCase();
        const group = (label.group || '').toLowerCase();
        return name.includes(query) || id.includes(query) || group.includes(query);
      })
    : labels;

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.classList.add('labels-empty');
    empty.textContent = query ? 'No matching labels' : 'No labels yet';
    container.appendChild(empty);
    return;
  }

  const { ungrouped, groupMap, sortedGroups } = groupLabels(filtered);

  let firstSection = true;

  if (ungrouped.length > 0) {
    container.appendChild(createAccordionSection('Ungrouped', ungrouped, firstSection, createLabelListItem));
    firstSection = false;
  }

  sortedGroups.forEach(groupName => {
    container.appendChild(createAccordionSection(groupName, groupMap.get(groupName), firstSection, createLabelListItem));
    firstSection = false;
  });

  renderIcons();
}

function renderBoardsSelect() {
  const selectEl = document.getElementById('board-select');
  if (!selectEl) return;

  const boards = listBoards();
  const active = getActiveBoardId();
  selectEl.innerHTML = '';

  boards.forEach((b) => {
    const option = document.createElement('option');
    option.value = b.id;
    option.textContent = (typeof b.name === 'string' && b.name.trim()) ? b.name.trim() : 'Untitled board';
    selectEl.appendChild(option);
  });

  if (active) selectEl.value = active;

  const brandEl = document.getElementById('brand-text') || document.querySelector('.brand-text');
  if (brandEl) brandEl.textContent = getActiveBoardName();
}

function renderBoardsList() {
  ensureBoardsInitialized();
  const container = document.getElementById('boards-list');
  if (!container) return;

  container.innerHTML = '';
  const boards = listBoards();
  const activeId = getActiveBoardId();

  boards.forEach((board) => {
    const item = document.createElement('div');
    item.classList.add('label-item');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'space-between';
    item.style.gap = '10px';

    const nameWrap = document.createElement('div');
    nameWrap.style.display = 'flex';
    nameWrap.style.alignItems = 'center';
    nameWrap.style.gap = '8px';

    const nameEl = document.createElement('span');
    nameEl.textContent = (board.name || '').toString();
    nameWrap.appendChild(nameEl);

    if (board.id === activeId) {
      const activeBadge = document.createElement('span');
      activeBadge.classList.add('task-label');
      activeBadge.style.backgroundColor = 'var(--color-primary)';
      activeBadge.textContent = 'Active';
      nameWrap.appendChild(activeBadge);
    }

    const actions = document.createElement('div');
    actions.classList.add('label-actions');
    actions.style.display = 'flex';
    actions.style.gap = '4px';

    const switchBtn = document.createElement('button');
    switchBtn.classList.add('btn-small');
    switchBtn.textContent = 'Open';
    switchBtn.title = 'Open board';
    switchBtn.addEventListener('click', async () => {
      setActiveBoardId(board.id);
      renderBoardsSelect();
      renderBoardsList();
      const { renderBoard } = await import('./render.js');
      renderBoard();
    });

    const exportBtn = document.createElement('button');
    exportBtn.classList.add('btn-small');
    exportBtn.type = 'button';
    exportBtn.title = 'Export board';
    exportBtn.setAttribute('aria-label', `Export board ${String(board.name || 'Untitled board')}`);
    const exportIcon = document.createElement('span');
    exportIcon.dataset.lucide = 'download';
    exportBtn.appendChild(exportIcon);
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      exportBoard(board.id);
    });

    const editBtn = document.createElement('button');
    editBtn.classList.add('btn-small');
    const editIcon = document.createElement('span');
    editIcon.dataset.lucide = 'pencil';
    editBtn.appendChild(editIcon);
    editBtn.title = 'Rename board';
    editBtn.addEventListener('click', () => showBoardRenameModal(board.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('btn-small', 'btn-danger');
    const deleteIcon = document.createElement('span');
    deleteIcon.dataset.lucide = 'trash-2';
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.title = 'Delete board';
    deleteBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete Board',
        message: `Do you really want to delete the board "${board.name}"? This cannot be undone.`,
        confirmText: 'Delete'
      });
      if (!ok) return;
      const deleted = deleteBoardById(board.id);
      if (!deleted) {
        await alertDialog({
          title: 'Unable to Delete',
          message: 'Unable to delete board (you may be trying to delete the last board).'
        });
        return;
      }
      renderBoardsSelect();
      renderBoardsList();
      const { renderBoard } = await import('./render.js');
      renderBoard();
    });

    actions.appendChild(switchBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(nameWrap);
    item.appendChild(actions);
    container.appendChild(item);
  });

  renderIcons();
}

function showBoardsModal() {
  renderBoardsList();
  const modal = document.getElementById('boards-modal');
  modal?.classList.remove('hidden');
}

function hideBoardsModal() {
  const modal = document.getElementById('boards-modal');
  modal?.classList.add('hidden');
}

export function refreshBoardsModalList() {
  const modal = document.getElementById('boards-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  renderBoardsList();
}

function showBoardRenameModal(boardId) {
  ensureBoardsInitialized();
  const board = listBoards().find((b) => b.id === boardId);
  if (!board) return;

  editingBoardId = boardId;
  const modal = document.getElementById('board-rename-modal');
  const input = document.getElementById('board-rename-name');
  const title = document.getElementById('board-rename-modal-title');
  const submitBtn = document.getElementById('board-rename-submit-btn');

  if (title) title.textContent = 'Rename Board';
  if (submitBtn) submitBtn.textContent = 'Save';
  if (input) input.value = (board.name || '').toString();

  modal?.classList.remove('hidden');
  input?.focus();
}

function hideBoardRenameModal() {
  const modal = document.getElementById('board-rename-modal');
  modal?.classList.add('hidden');
  editingBoardId = null;
}

function createLabelCheckboxItem(label) {
  const labelEl = document.createElement('label');
  labelEl.classList.add('label-checkbox');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = label.id;
  checkbox.checked = selectedTaskLabels.includes(label.id);
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (!selectedTaskLabels.includes(label.id)) selectedTaskLabels.push(label.id);
    } else {
      selectedTaskLabels = selectedTaskLabels.filter(id => id !== label.id);
    }
    renderActiveTaskLabels();
  });

  const labelPill = document.createElement('span');
  labelPill.classList.add('task-label', 'label-color-swatch');
  labelPill.style.backgroundColor = label.color;
  labelPill.textContent = label.name;

  labelEl.appendChild(checkbox);
  labelEl.appendChild(labelPill);
  return labelEl;
}

function updateTaskLabelsSelection() {
  renderActiveTaskLabels();
  const container = document.getElementById('task-labels-selection');
  container.innerHTML = '';

  const query = getTaskLabelSearchQuery();
  const labels = loadLabels();
  const filteredLabels = query
    ? labels.filter(label => {
        const name = (label.name || '').toLowerCase();
        const id = (label.id || '').toLowerCase();
        const group = (label.group || '').toLowerCase();
        return name.includes(query) || id.includes(query) || group.includes(query);
      })
    : labels;

  if (filteredLabels.length === 0) {
    if (query) {
      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.classList.add('labels-empty-button');
      createBtn.textContent = `No label found "${query}" - Create label`;
      createBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showLabelModal(null, { openedFromTaskEditor: true, initialName: query });
      });
      container.appendChild(createBtn);
    } else {
      const empty = document.createElement('div');
      empty.classList.add('labels-empty');
      empty.textContent = 'No matching labels';
      container.appendChild(empty);
    }
    return;
  }

  const { ungrouped, groupMap, sortedGroups } = groupLabels(filteredLabels);

  ungrouped.forEach(label => {
    container.appendChild(createLabelCheckboxItem(label));
  });

  sortedGroups.forEach(groupName => {
    const header = document.createElement('div');
    header.classList.add('label-group-header', 'label-group-header-picker');
    header.textContent = groupName;
    container.appendChild(header);

    groupMap.get(groupName).forEach(label => {
      container.appendChild(createLabelCheckboxItem(label));
    });
  });
}

export function initializeModalHandlers() {
  document.addEventListener('kanban:boards-changed', () => {
    refreshBoardsModalList();
  });

  const taskLabelSearch = document.getElementById('task-label-search');
  taskLabelSearch?.addEventListener('input', updateTaskLabelsSelection);

  const labelsSearch = document.getElementById('labels-search');
  labelsSearch?.addEventListener('input', renderLabelsList);

  const taskAddLabelBtn = document.getElementById('task-add-label-btn');
  taskAddLabelBtn?.addEventListener('click', () => {
    // From the task editor, '+' should open the Add Label modal directly.
    // Keep the task modal open behind it so edits are preserved.
    returnToTaskModalAfterLabelsManager = false;
    showLabelModal(null, { openedFromTaskEditor: true });
  });

  const taskFullpageBtn = document.getElementById('task-fullpage-btn');
  taskFullpageBtn?.addEventListener('click', () => {
    const modal = document.getElementById('task-modal');
    if (!modal) return;
    setTaskModalFullscreen(!modal.classList.contains('fullscreen'));
  });

  // Task modal
  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('task-title');
    
    // Validate title is not empty
    if (!validateAndShowTaskTitleError(titleInput)) {
      return;
    }
    
    const title = titleInput.value.trim();
    const description = document.getElementById('task-description').value;
    const priority = document.getElementById('task-priority')?.value;
    const dueDate = document.getElementById('task-due-date')?.value;
    const column = document.getElementById('task-column').value;
    
    if (editingTaskId) {
      updateTask(editingTaskId, title, description, priority, dueDate, column, selectedTaskLabels);
    } else {
      addTask(title, description, priority, dueDate, column, selectedTaskLabels);
    }
    hideModal();
    const { renderBoard } = await import('./render.js');
    renderBoard();
  });

  setupModalCloseHandlers('task-modal', hideModal);

  // Column modal
  document.getElementById('column-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('column-name');
    
    // Validate name is not empty
    if (!validateAndShowColumnNameError(nameInput)) {
      return;
    }
    
    const name = nameInput.value.trim();
    const color = document.getElementById('column-color')?.value;
    
    if (editingColumnId) {
      updateColumn(editingColumnId, name, color);
    } else {
      addColumn(name, color);
    }
    hideColumnModal();
    const { renderBoard } = await import('./render.js');
    renderBoard();
  });

  setupModalCloseHandlers('column-modal', hideColumnModal);

  // Labels modal
  document.getElementById('manage-labels-btn').addEventListener('click', showLabelsModal);
  document.getElementById('add-label-btn').addEventListener('click', () => showLabelModal());
  setupModalCloseHandlers('labels-modal', hideLabelsModal);

  const labelNameInput = document.getElementById('label-name');
  labelNameInput?.addEventListener('beforeinput', (e) => {
    // Intercept attempts to exceed max length and show an alert.
    // This covers typing + paste in modern browsers.
    if (!e || typeof e.data !== 'string' || e.data.length === 0) return;
    const input = e.target;
    if (!input || typeof input.value !== 'string') return;

    const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
    const nextValue = input.value.slice(0, start) + e.data + input.value.slice(end);
    if (nextValue.trim().length <= MAX_LABEL_NAME_LENGTH) return;

    e.preventDefault();
    if (hasShownLabelMaxLengthAlert) return;
    hasShownLabelMaxLengthAlert = true;
    void alertDialog({
      title: 'Label Name Too Long',
      message: `Label names are limited to ${MAX_LABEL_NAME_LENGTH} characters.`
    });
  });

  const labelColorInput = document.getElementById('label-color');
  labelColorInput?.addEventListener('input', (e) => {
    updateLabelColorHex(e.target.value);
  });

  const labelColorHexInput = document.getElementById('label-color-hex');
  labelColorHexInput?.addEventListener('input', (e) => {
    let val = e.target.value;
    // Auto-prepend '#' if the user types raw hex digits
    if (val && !val.startsWith('#')) val = '#' + val;
    if (isValidHexColor(val)) {
      labelColorInput.value = val;
      e.target.classList.remove('invalid');
    } else {
      e.target.classList.toggle('invalid', val.length > 0);
    }
  });

  // Fallback: if a browser bypasses beforeinput (or maxlength), clamp and alert.
  labelNameInput?.addEventListener('input', (e) => {
    const input = e.target;
    if (!input || typeof input.value !== 'string') return;
    const trimmed = input.value.trim();
    if (trimmed.length <= MAX_LABEL_NAME_LENGTH) return;

    input.value = trimmed.slice(0, MAX_LABEL_NAME_LENGTH);
    if (hasShownLabelMaxLengthAlert) return;
    hasShownLabelMaxLengthAlert = true;
    void alertDialog({
      title: 'Label Name Too Long',
      message: `Label names are limited to ${MAX_LABEL_NAME_LENGTH} characters.`
    });
  });
  
  document.getElementById('label-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('label-name').value;
    const hexInput = document.getElementById('label-color-hex');
    const hexVal = (hexInput?.value || '').trim();

    // If the user typed a hex value, validate and sync it to the color picker
    let color;
    if (hexVal && hexVal !== document.getElementById('label-color').value) {
      const normalized = hexVal.startsWith('#') ? hexVal : '#' + hexVal;
      if (!isValidHexColor(normalized)) {
        hexInput?.classList.add('invalid');
        await alertDialog({
          title: 'Invalid Hex Color',
          message: 'Please enter a valid hex color code (e.g. #3b82f6).'
        });
        hexInput?.focus();
        return;
      }
      document.getElementById('label-color').value = normalized;
      color = normalized;
    } else {
      color = document.getElementById('label-color').value;
    }

    const trimmedName = (name || '').trim();
    if (trimmedName.length > MAX_LABEL_NAME_LENGTH) {
      await alertDialog({
        title: 'Label Name Too Long',
        message: `Label names are limited to ${MAX_LABEL_NAME_LENGTH} characters.`
      });
      return;
    }

    const group = (document.getElementById('label-group')?.value || '').trim();
    const wasCreating = !editingLabelId;

    const result = editingLabelId
      ? updateLabel(editingLabelId, trimmedName, color, group)
      : addLabel(trimmedName, color, group);

    if (!result?.success) {
      let title = 'Unable to Save Label';
      let message = 'Could not save label.';

      if (result?.reason === 'DUPLICATE_NAME') {
        title = 'Label Already Exists';
        message = result?.message || 'A label with that name already exists (case-insensitive).';
      } else if (result?.reason === 'EMPTY_NAME') {
        title = 'Label Name Required';
        message = 'Please enter a label name.';
      }

      await alertDialog({ title, message });
      document.getElementById('label-name')?.focus();
      return;
    }

    // If the label was created from within the task editor, auto-select it.
    if (wasCreating && selectCreatedLabelInTaskEditor && result?.label?.id) {
      if (!selectedTaskLabels.includes(result.label.id)) {
        selectedTaskLabels.push(result.label.id);
      }
      updateTaskLabelsSelection();
      document.getElementById('task-label-search')?.focus();
    }

    hideLabelModal();
    renderLabelsList();
    const { renderBoard } = await import('./render.js');
    renderBoard();

    // If the label manager was launched from the task modal, return immediately
    // after creating a new label so the user can apply it to the task.
    if (returnToTaskModalAfterLabelsManager && wasCreating) {
      hideLabelsModal();
    }
  });

  setupModalCloseHandlers('label-modal', hideLabelModal);

  // Boards modal
  document.getElementById('manage-boards-btn')?.addEventListener('click', showBoardsModal);
  document.getElementById('add-board-btn')?.addEventListener('click', async () => {
    document.dispatchEvent(new CustomEvent('kanban:open-board-create'));
  });
  document.getElementById('boards-import-btn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Import Board (New Board)',
      message:
        'Import will CREATE A NEW BOARD and switch to it. Your current active board will not be overwritten.\n\nContinue with import?',
      confirmText: 'Import'
    });
    if (!ok) return;
    document.getElementById('import-file')?.click();
  });
  setupModalCloseHandlers('boards-modal', hideBoardsModal);

  // Board rename modal
  document.getElementById('board-rename-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editingBoardId) return;

    const input = document.getElementById('board-rename-name');
    const name = (input?.value || '').trim();
    if (!name) {
      alert('Board name cannot be empty.');
      return;
    }

    if (!renameBoard(editingBoardId, name)) {
      alert('Unable to rename board.');
      return;
    }

    hideBoardRenameModal();
    renderBoardsSelect();
    renderBoardsList();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  });

  setupModalCloseHandlers('board-rename-modal', hideBoardRenameModal);

  // Help modal
  document.getElementById('help-btn').addEventListener('click', showHelpModal);
  setupModalCloseHandlers('help-modal', hideHelpModal);

  // Add column button
  document.getElementById('add-column-btn').addEventListener('click', showColumnModal);

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close the top-most modal only (prevents closing underlying modals when
      // using the label manager from inside the task modal).
      if (isModalOpen('label-modal')) {
        hideLabelModal();
        return;
      }
      if (isModalOpen('labels-modal')) {
        hideLabelsModal();
        return;
      }
      if (isModalOpen('board-rename-modal')) {
        hideBoardRenameModal();
        return;
      }
      if (isModalOpen('boards-modal')) {
        hideBoardsModal();
        return;
      }
      if (isModalOpen('help-modal')) {
        hideHelpModal();
        return;
      }
      if (isModalOpen('login-modal')) {
        hideLoginModal();
        return;
      }
      if (isModalOpen('column-modal')) {
        hideColumnModal();
        return;
      }
      if (isModalOpen('task-modal')) {
        hideModal();
      }
    }
  });
}

export { updateTaskLabelsSelection };
