// Labels manager + individual label modal — extracted from modals.js

import { loadLabels } from './storage.js';
import { addLabel, updateLabel, deleteLabel } from './labels.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { renderIcons } from './icons.js';
import { createAccordionSection } from './accordion.js';
import { emit, DATA_CHANGED } from './events.js';
import { MAX_LABEL_NAME_LENGTH } from './constants.js';

let editingLabelId = null;
let hasShownLabelMaxLengthAlert = false;

// These are coordinated with task-modal.js
let taskModalState = null;

export function setTaskModalState(state) {
  taskModalState = state;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isValidHexColor(value) {
  return HEX_COLOR_RE.test(value);
}

function getLabelsManagerSearchQuery() {
  const input = document.getElementById('labels-search');
  return (input?.value || '').trim().toLowerCase();
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

function createLabelListItem(label) {
  const labelItem = document.createElement('div');
  labelItem.classList.add('label-item');

  const labelSpan = document.createElement('span');
  labelSpan.classList.add('task-label');
  labelSpan.style.backgroundColor = label.color;
  labelSpan.textContent = label.name;

  const actionsDiv = document.createElement('div');
  actionsDiv.classList.add('label-actions');

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
      emit(DATA_CHANGED);
    }
  });

  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  labelItem.appendChild(labelSpan);
  labelItem.appendChild(actionsDiv);
  return labelItem;
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

export function showLabelModal(labelId = null, { openedFromTaskEditor = false, initialName = '' } = {}) {
  editingLabelId = labelId;
  hasShownLabelMaxLengthAlert = false;

  if (taskModalState) {
    taskModalState.setSelectCreatedLabelFlag(!!openedFromTaskEditor);
  }

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
  if (taskModalState) {
    taskModalState.setSelectCreatedLabelFlag(false);
  }
}

export function showLabelsModal() {
  const input = document.getElementById('labels-search');
  if (input) input.value = '';
  renderLabelsList();
  const modal = document.getElementById('labels-modal');
  modal.classList.remove('hidden');

  const returnFlag = taskModalState?.getReturnToTaskModalFlag();
  if (!returnFlag) {
    document.getElementById('labels-search')?.focus();
  }
}

function hideLabelsModal() {
  const modal = document.getElementById('labels-modal');
  modal.classList.add('hidden');

  const input = document.getElementById('labels-search');
  if (input) input.value = '';

  if (taskModalState?.getReturnToTaskModalFlag()) {
    taskModalState.restoreTaskModalAfterLabelsManager();
  }
}

export function initializeLabelsModalHandlers(setupModalCloseHandlers) {
  const labelsSearch = document.getElementById('labels-search');
  labelsSearch?.addEventListener('input', renderLabelsList);

  document.getElementById('manage-labels-btn').addEventListener('click', showLabelsModal);
  document.getElementById('add-label-btn').addEventListener('click', () => showLabelModal());
  setupModalCloseHandlers('labels-modal', hideLabelsModal);

  // Listen for open-label-modal events from task-modal
  document.addEventListener('kanban:open-label-modal', (e) => {
    const detail = e.detail || {};
    showLabelModal(null, {
      openedFromTaskEditor: !!detail.openedFromTaskEditor,
      initialName: detail.initialName || ''
    });
  });

  const labelNameInput = document.getElementById('label-name');
  labelNameInput?.addEventListener('beforeinput', (e) => {
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
    if (val && !val.startsWith('#')) val = '#' + val;
    if (isValidHexColor(val)) {
      labelColorInput.value = val;
      e.target.classList.remove('invalid');
    } else {
      e.target.classList.toggle('invalid', val.length > 0);
    }
  });

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
    if (wasCreating && taskModalState?.getSelectCreatedLabelFlag() && result?.label?.id) {
      const selectedLabels = taskModalState.getSelectedTaskLabels();
      if (!selectedLabels.includes(result.label.id)) {
        selectedLabels.push(result.label.id);
        taskModalState.setSelectedTaskLabels(selectedLabels);
      }
      taskModalState.updateTaskLabelsSelection();
      document.getElementById('task-label-search')?.focus();
    }

    hideLabelModal();
    renderLabelsList();
    emit(DATA_CHANGED);

    if (taskModalState?.getReturnToTaskModalFlag() && wasCreating) {
      hideLabelsModal();
    }
  });

  setupModalCloseHandlers('label-modal', hideLabelModal);
}

export { hideLabelModal, hideLabelsModal };
