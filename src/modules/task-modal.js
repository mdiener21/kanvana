// Task add/edit modal — extracted from modals.js

import { loadLabels, loadColumns, loadSettings, loadTasks } from './storage.js';
import { addTask, updateTask } from './tasks.js';
import { renderIcons } from './icons.js';
import { validateAndShowTaskTitleError, clearFieldError } from './validation.js';
import { emit, DATA_CHANGED } from './events.js';
import { createAccordionSection } from './accordion.js';

// Task modal state
let currentColumn = 'todo';
let editingTaskId = null;
let selectedTaskLabels = [];
let returnToTaskModalAfterLabelsManager = false;
let selectCreatedLabelInTaskEditor = false;

// Expose state getters/setters for coordination with labels-modal
export function getSelectedTaskLabels() { return selectedTaskLabels; }
export function setSelectedTaskLabels(labels) { selectedTaskLabels = labels; }
export function getReturnToTaskModalFlag() { return returnToTaskModalAfterLabelsManager; }
export function setReturnToTaskModalFlag(val) { returnToTaskModalAfterLabelsManager = val; }
export function getSelectCreatedLabelFlag() { return selectCreatedLabelInTaskEditor; }
export function setSelectCreatedLabelFlag(val) { selectCreatedLabelInTaskEditor = val; }

function setTaskModalFullscreen(isFullscreen) {
  const modal = document.getElementById('task-modal');
  if (!modal) return;
  modal.classList.toggle('fullscreen', !!isFullscreen);

  const btn = document.getElementById('task-fullpage-btn');
  btn?.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');

  if (btn) {
    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isFullscreen ? 'minimize-2' : 'maximize-2');
    }
    btn.title = isFullscreen ? 'Exit full page' : 'Open in full page';
  }

  renderIcons();
}

function getTaskLabelSearchQuery() {
  const input = document.getElementById('task-label-search');
  return (input?.value || '').trim().toLowerCase();
}

function renderActiveTaskLabels() {
  const container = document.getElementById('task-active-labels');
  if (!container) return;

  const allLabels = loadLabels();
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

function temporarilyHideTaskModalForLabelsManager() {
  const taskModal = document.getElementById('task-modal');
  if (!taskModal) return;
  taskModal.classList.add('hidden');
}

export function restoreTaskModalAfterLabelsManager() {
  const taskModal = document.getElementById('task-modal');
  if (!taskModal) return;

  taskModal.classList.remove('hidden');
  updateTaskLabelsSelection();
  document.getElementById('task-label-search')?.focus();
  returnToTaskModalAfterLabelsManager = false;
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

export function updateTaskLabelsSelection() {
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
        // Dispatch event so labels-modal can handle it
        document.dispatchEvent(new CustomEvent('kanban:open-label-modal', {
          detail: { openedFromTaskEditor: true, initialName: query }
        }));
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

export function showModal(columnName, swimlaneContext) {
  currentColumn = columnName || loadColumns()[0]?.id || 'todo';
  editingTaskId = null;
  selectedTaskLabels = [];
  returnToTaskModalAfterLabelsManager = false;
  selectCreatedLabelInTaskEditor = false;

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

  if (swimlaneContext) {
    const { groupBy, laneKey } = swimlaneContext;
    if (laneKey && laneKey !== '__no-group__') {
      if (groupBy === 'priority' && taskPriority) {
        taskPriority.value = laneKey;
      } else if (groupBy === 'label' || groupBy === 'label-group') {
        const labels = loadLabels();
        const label = labels.find((l) => l.id === laneKey);
        if (label) {
          selectedTaskLabels = [label.id];
        }
      }
    }
  }

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

  clearFieldError(taskTitle);

  modalTitle.textContent = 'Edit Task';
  submitBtn.textContent = 'Save Changes';
  columnSelect.value = task.column;

  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  taskTitle.value = (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  taskDescription.value = typeof task.description === 'string' ? task.description : '';
  if (taskPriority) taskPriority.value = typeof task.priority === 'string' ? task.priority : 'none';

  const rawDue = typeof task.dueDate === 'string' ? task.dueDate : '';
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

export function initializeTaskModalHandlers(setupModalCloseHandlers) {
  const taskLabelSearch = document.getElementById('task-label-search');
  taskLabelSearch?.addEventListener('input', updateTaskLabelsSelection);

  const taskAddLabelBtn = document.getElementById('task-add-label-btn');
  taskAddLabelBtn?.addEventListener('click', () => {
    returnToTaskModalAfterLabelsManager = false;
    document.dispatchEvent(new CustomEvent('kanban:open-label-modal', {
      detail: { openedFromTaskEditor: true }
    }));
  });

  const taskFullpageBtn = document.getElementById('task-fullpage-btn');
  taskFullpageBtn?.addEventListener('click', () => {
    const modal = document.getElementById('task-modal');
    if (!modal) return;
    setTaskModalFullscreen(!modal.classList.contains('fullscreen'));
  });

  document.getElementById('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('task-title');

    if (!validateAndShowTaskTitleError(titleInput)) return;

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
    emit(DATA_CHANGED);
  });

  setupModalCloseHandlers('task-modal', hideModal);
}

export { hideModal };
