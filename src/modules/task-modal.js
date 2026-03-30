// Task add/edit modal — extracted from modals.js

import { loadLabels, loadColumns, loadSettings, loadTasks } from './storage.js';
import { addTask, updateTask } from './tasks.js';
import { renderIcons } from './icons.js';
import { validateAndShowTaskTitleError, clearFieldError } from './validation.js';
import { emit, DATA_CHANGED } from './events.js';
import { createAccordionSection } from './accordion.js';
import { generateUUID } from './utils.js';
import Sortable from 'sortablejs';

// Task modal state
let currentColumn = 'todo';
let editingTaskId = null;
let selectedTaskLabels = [];
let selectedTaskRelationships = []; // [{ type, targetTaskId }]
let selectedTaskSubTasks = []; // [{ id, title, completed, order }]
let subtaskSortable = null;
let returnToTaskModalAfterLabelsManager = false;
let selectCreatedLabelInTaskEditor = false;

const RELATIONSHIP_LABELS = { prerequisite: 'Prerequisite', dependent: 'Dependent', related: 'Related' };

function shortId(id) {
  return '#' + (typeof id === 'string' ? id.slice(-5) : '');
}

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

function renderActiveTaskRelationships() {
  const container = document.getElementById('task-active-relationships');
  if (!container) return;

  container.innerHTML = '';
  container.style.display = selectedTaskRelationships.length > 0 ? 'flex' : 'none';

  selectedTaskRelationships.forEach((rel) => {
    const badge = document.createElement('span');
    badge.classList.add('relationship-badge', `relationship-badge--${rel.type}`);

    const typeLabel = document.createElement('span');
    typeLabel.classList.add('relationship-badge__type');
    typeLabel.textContent = RELATIONSHIP_LABELS[rel.type] || rel.type;

    const idLink = document.createElement('button');
    idLink.type = 'button';
    idLink.classList.add('relationship-badge__id');
    idLink.textContent = shortId(rel.targetTaskId);
    idLink.setAttribute('aria-label', `Open task ${shortId(rel.targetTaskId)}`);
    idLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showEditModal(rel.targetTaskId);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.classList.add('relationship-badge__remove');
    removeBtn.setAttribute('aria-label', `Remove relationship with ${shortId(rel.targetTaskId)}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedTaskRelationships = selectedTaskRelationships.filter((r) => r.targetTaskId !== rel.targetTaskId);
      renderActiveTaskRelationships();
    });

    badge.appendChild(typeLabel);
    badge.appendChild(idLink);
    badge.appendChild(removeBtn);
    container.appendChild(badge);
  });
}

function updateRelationshipSearchResults(query) {
  const resultsEl = document.getElementById('task-relationship-results');
  if (!resultsEl) return;

  const trimmed = (query || '').trim().toLowerCase();
  if (!trimmed) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }

  const allTasks = loadTasks();
  const matches = allTasks.filter((t) => {
    if (t.id === editingTaskId) return false;
    if (t.column === 'done') return false;
    const sid = shortId(t.id).toLowerCase();
    const title = (t.title || '').toLowerCase();
    return sid.includes(trimmed) || title.includes(trimmed);
  }).slice(0, 8);

  resultsEl.innerHTML = '';

  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.classList.add('relationship-results__empty');
    empty.textContent = 'No tasks found';
    resultsEl.appendChild(empty);
    resultsEl.hidden = false;
    return;
  }

  matches.forEach((t) => {
    const existing = selectedTaskRelationships.find((r) => r.targetTaskId === t.id);
    const item = document.createElement('button');
    item.type = 'button';
    item.classList.add('relationship-result-item');
    if (existing) item.classList.add('relationship-result-item--linked');

    const idSpan = document.createElement('span');
    idSpan.classList.add('relationship-result-item__id');
    idSpan.textContent = shortId(t.id);

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('relationship-result-item__title');
    titleSpan.textContent = t.title || '(untitled)';

    if (existing) {
      const currentType = document.createElement('span');
      currentType.classList.add('relationship-result-item__current-type');
      currentType.textContent = `[${RELATIONSHIP_LABELS[existing.type] || existing.type}]`;
      item.appendChild(currentType);
    }

    item.appendChild(idSpan);
    item.appendChild(titleSpan);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const typeSelect = document.getElementById('task-relationship-type');
      const selectedType = typeSelect?.value || 'related';
      // Upsert: replace if same target, otherwise add
      selectedTaskRelationships = selectedTaskRelationships.filter((r) => r.targetTaskId !== t.id);
      selectedTaskRelationships.push({ type: selectedType, targetTaskId: t.id });
      renderActiveTaskRelationships();
      const searchInput = document.getElementById('task-relationship-search');
      if (searchInput) searchInput.value = '';
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    });

    resultsEl.appendChild(item);
  });

  resultsEl.hidden = false;
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

function updateSubTasksProgressLegend() {
  const legend = document.getElementById('task-subtasks-progress-legend');
  if (!legend) return;
  const total = selectedTaskSubTasks.length;
  if (total === 0) {
    legend.hidden = true;
    legend.textContent = '';
  } else {
    const completed = selectedTaskSubTasks.filter((s) => s.completed).length;
    legend.textContent = `${completed} / ${total}`;
    legend.hidden = false;
  }
}

function activateSubTaskInlineEdit(li, subtaskId) {
  const titleSpan = li.querySelector('.subtask-title');
  if (!titleSpan || li.querySelector('.subtask-inline-input')) return;

  const st = selectedTaskSubTasks.find((s) => s.id === subtaskId);
  if (!st) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('subtask-inline-input');
  input.value = st.title;
  input.maxLength = 200;
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  function commit() {
    const val = input.value.trim();
    if (val) st.title = val;
    renderSubTaskList();
  }

  function cancel() {
    renderSubTaskList();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

function renderSubTaskList() {
  const listEl = document.getElementById('task-subtasks-list');
  if (!listEl) return;

  // Sort by order before rendering
  const sorted = [...selectedTaskSubTasks].sort((a, b) => a.order - b.order);

  listEl.innerHTML = '';
  sorted.forEach((st) => {
    const li = document.createElement('li');
    li.classList.add('subtask-item');
    if (st.completed) li.classList.add('subtask-completed');
    li.dataset.subtaskId = st.id;

    const handle = document.createElement('span');
    handle.classList.add('subtask-drag-handle');
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = st.completed;
    checkbox.setAttribute('aria-label', `Mark "${st.title}" complete`);
    checkbox.addEventListener('change', () => {
      st.completed = checkbox.checked;
      li.classList.toggle('subtask-completed', st.completed);
      updateSubTasksProgressLegend();
    });

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('subtask-title');
    titleSpan.textContent = st.title;
    titleSpan.title = 'Click to edit';
    titleSpan.addEventListener('click', () => activateSubTaskInlineEdit(li, st.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('subtask-delete-btn');
    deleteBtn.setAttribute('aria-label', `Delete sub-task "${st.title}"`);
    deleteBtn.title = 'Delete sub-task';
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    deleteBtn.addEventListener('click', () => {
      selectedTaskSubTasks = selectedTaskSubTasks.filter((s) => s.id !== st.id);
      renderSubTaskList();
      updateSubTasksProgressLegend();
    });

    li.appendChild(handle);
    li.appendChild(checkbox);
    li.appendChild(titleSpan);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });

  // Init/reinit SortableJS
  if (subtaskSortable) subtaskSortable.destroy();
  subtaskSortable = new Sortable(listEl, {
    animation: 150,
    handle: '.subtask-drag-handle',
    onEnd: () => {
      const items = listEl.querySelectorAll('[data-subtask-id]');
      items.forEach((el, i) => {
        const s = selectedTaskSubTasks.find((x) => x.id === el.dataset.subtaskId);
        if (s) s.order = i + 1;
      });
    }
  });

  updateSubTasksProgressLegend();
}

export function showModal(columnName, swimlaneContext) {
  currentColumn = columnName || loadColumns()[0]?.id || 'todo';
  editingTaskId = null;
  selectedTaskLabels = [];
  selectedTaskRelationships = [];
  selectedTaskSubTasks = [];
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

  const relSearch = document.getElementById('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = document.getElementById('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  updateTaskLabelsSelection();
  renderActiveTaskRelationships();
  renderSubTaskList();
  modal.classList.remove('hidden');
  taskTitle.focus();
}

export function showEditModal(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;
  selectedTaskLabels = task.labels || [];
  selectedTaskRelationships = Array.isArray(task.relationships) ? [...task.relationships] : [];
  selectedTaskSubTasks = Array.isArray(task.subTasks) ? task.subTasks.map((s) => ({ ...s })) : [];
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

  const relSearch = document.getElementById('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = document.getElementById('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  updateTaskLabelsSelection();
  renderActiveTaskRelationships();
  renderSubTaskList();
  modal.classList.remove('hidden');
  taskTitle.focus();
}

function hideModal() {
  const modal = document.getElementById('task-modal');
  modal.classList.add('hidden');
  editingTaskId = null;
  selectedTaskRelationships = [];
  selectedTaskSubTasks = [];
  if (subtaskSortable) { subtaskSortable.destroy(); subtaskSortable = null; }
  returnToTaskModalAfterLabelsManager = false;

  const relResults = document.getElementById('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  setTaskModalFullscreen(false);
  document.getElementById('task-fullpage-btn')?.classList.add('hidden');
}

export function initializeTaskModalHandlers(setupModalCloseHandlers) {
  const taskLabelSearch = document.getElementById('task-label-search');
  taskLabelSearch?.addEventListener('input', updateTaskLabelsSelection);

  const relSearch = document.getElementById('task-relationship-search');
  relSearch?.addEventListener('input', (e) => updateRelationshipSearchResults(e.target.value));
  relSearch?.addEventListener('focus', (e) => { if (e.target.value.trim()) updateRelationshipSearchResults(e.target.value); });

  document.addEventListener('click', (e) => {
    const resultsEl = document.getElementById('task-relationship-results');
    if (!resultsEl || resultsEl.hidden) return;
    const fieldset = document.getElementById('task-relationships-fieldset');
    if (fieldset && !fieldset.contains(e.target)) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }
  });

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

  const subtaskInput = document.getElementById('task-subtask-input');
  subtaskInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = subtaskInput.value.trim();
    if (!val) return;
    const nextOrder = selectedTaskSubTasks.length + 1;
    selectedTaskSubTasks.push({ id: generateUUID(), title: val, completed: false, order: nextOrder });
    subtaskInput.value = '';
    renderSubTaskList();
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
      updateTask(editingTaskId, title, description, priority, dueDate, column, selectedTaskLabels, selectedTaskRelationships, selectedTaskSubTasks);
    } else {
      addTask(title, description, priority, dueDate, column, selectedTaskLabels, selectedTaskRelationships, selectedTaskSubTasks);
    }
    hideModal();
    emit(DATA_CHANGED);
  });

  setupModalCloseHandlers('task-modal', hideModal);
}

export { hideModal };
