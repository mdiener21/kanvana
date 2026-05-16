// Labels manager + individual label modal — extracted from modals.js

import { loadLabels } from './storage.js';
import { addLabel, updateLabel, deleteLabel } from './labels.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { renderIcons } from './icons.js';
import { createAccordionSection } from './accordion.js';
import { emit, DATA_CHANGED } from './events.js';
import { MAX_LABEL_NAME_LENGTH } from './constants.js';
import { labelTextColor } from './utils.js';
import { $id, h } from './dom.js';

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
  const input = $id('labels-search');
  return (input?.value || '').trim().toLowerCase();
}

function updateLabelColorHex(color) {
  const hexInput = $id('label-color-hex');
  if (!hexInput) return;
  hexInput.value = color;
  hexInput.classList.remove('invalid');
}

function populateLabelGroupSuggestions() {
  const datalist = $id('label-group-suggestions');
  if (!datalist) return;
  datalist.innerHTML = '';
  const labels = loadLabels();
  const groups = [...new Set(
    labels.map(l => (l.group || '').trim()).filter(g => g.length > 0)
  )].sort((a, b) => a.localeCompare(b));
  groups.forEach(g => datalist.appendChild(h('option', { value: g })));
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
  return h('div', { class: 'label-item' },
    h('span', {
      class: 'task-label',
      style: { backgroundColor: label.color, color: labelTextColor(label.color) }
    }, label.name),
    h('div', { class: 'label-actions' },
      h('button', {
        class: 'btn-small',
        title: 'Edit label',
        onClick: () => showLabelModal(label.id)
      }, h('span', { 'data-lucide': 'pencil' })),
      h('button', {
        class: 'btn-small btn-danger',
        title: 'Delete label',
        onClick: async () => {
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
        }
      }, h('span', { 'data-lucide': 'trash-2' }))
    )
  );
}

function renderLabelsList() {
  const container = $id('labels-list');
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
    container.appendChild(h('div', { class: 'labels-empty' },
      query ? 'No matching labels' : 'No labels yet'
    ));
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

  const modal = $id('label-modal');
  const modalTitle = $id('label-modal-title');
  const nameInput = $id('label-name');
  const colorInput = $id('label-color');
  const groupInput = $id('label-group');
  const submitBtn = $id('label-submit-btn');

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
  $id('label-modal').classList.add('hidden');
  editingLabelId = null;
  if (taskModalState) {
    taskModalState.setSelectCreatedLabelFlag(false);
  }
}

export function showLabelsModal() {
  const input = $id('labels-search');
  if (input) input.value = '';
  renderLabelsList();
  $id('labels-modal').classList.remove('hidden');

  const returnFlag = taskModalState?.getReturnToTaskModalFlag();
  if (!returnFlag) {
    $id('labels-search')?.focus();
  }
}

function hideLabelsModal() {
  $id('labels-modal').classList.add('hidden');

  const input = $id('labels-search');
  if (input) input.value = '';

  if (taskModalState?.getReturnToTaskModalFlag()) {
    taskModalState.restoreTaskModalAfterLabelsManager();
  }
}

export function initializeLabelsModalHandlers(setupModalCloseHandlers) {
  $id('labels-search')?.addEventListener('input', renderLabelsList);

  $id('manage-labels-btn').addEventListener('click', showLabelsModal);
  $id('add-label-btn').addEventListener('click', () => showLabelModal());
  setupModalCloseHandlers('labels-modal', hideLabelsModal);

  // Listen for open-label-modal events from task-modal
  document.addEventListener('kanban:open-label-modal', (e) => {
    const detail = e.detail || {};
    showLabelModal(null, {
      openedFromTaskEditor: !!detail.openedFromTaskEditor,
      initialName: detail.initialName || ''
    });
  });

  const labelNameInput = $id('label-name');
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

  $id('label-color')?.addEventListener('input', (e) => {
    updateLabelColorHex(e.target.value);
  });

  $id('label-color-hex')?.addEventListener('input', (e) => {
    let val = e.target.value;
    if (val && !val.startsWith('#')) val = '#' + val;
    if (isValidHexColor(val)) {
      $id('label-color').value = val;
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

  $id('label-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $id('label-name').value;
    const hexInput = $id('label-color-hex');
    const hexVal = (hexInput?.value || '').trim();

    let color;
    if (hexVal && hexVal !== $id('label-color').value) {
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
      $id('label-color').value = normalized;
      color = normalized;
    } else {
      color = $id('label-color').value;
    }

    const trimmedName = (name || '').trim();
    if (trimmedName.length > MAX_LABEL_NAME_LENGTH) {
      await alertDialog({
        title: 'Label Name Too Long',
        message: `Label names are limited to ${MAX_LABEL_NAME_LENGTH} characters.`
      });
      return;
    }

    const group = ($id('label-group')?.value || '').trim();
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
      $id('label-name')?.focus();
      return;
    }

    // If the label was created from within the task editor, auto-select it.
    if (wasCreating && taskModalState?.getSelectCreatedLabelFlag() && result?.label?.id) {
      const selectedLabels = taskModalState.getSelectedTaskLabels();
      if (!selectedLabels.includes(result.label.id)) {
        selectedLabels.push(result.label.id);
        taskModalState.setSelectedTaskLabels(selectedLabels);
      }
      const labelSearch = $id('task-label-search');
      if (labelSearch) labelSearch.value = '';
      taskModalState.updateTaskLabelsSelection();
      labelSearch?.focus();
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
