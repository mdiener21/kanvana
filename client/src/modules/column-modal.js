// Column add/edit modal — extracted from modals.js

import { loadColumns } from './storage.js';
import { addColumn, updateColumn } from './columns.js';
import { alertDialog } from './dialog.js';
import { validateAndShowColumnNameError, clearFieldError } from './validation.js';
import { emit, DATA_CHANGED } from './events.js';
import { $id } from './dom.js';

let editingColumnId = null;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isValidHexColor(value) {
  return HEX_COLOR_RE.test(value);
}

function updateColumnColorHex(color) {
  const hexInput = $id('column-color-hex');
  if (!hexInput) return;
  hexInput.value = color;
  hexInput.classList.remove('invalid');
}

export function showColumnModal() {
  editingColumnId = null;
  const modal = $id('column-modal');
  const columnName = $id('column-name');
  const columnColor = $id('column-color');
  const modalTitle = $id('column-modal-title');
  const submitBtn = $id('column-submit-btn');

  clearFieldError(columnName);

  modalTitle.textContent = 'Add New Column';
  submitBtn.textContent = 'Add Column';
  columnName.value = '';
  if (columnColor) {
    columnColor.value = '#3b82f6';
    updateColumnColorHex('#3b82f6');
  }
  modal.classList.remove('hidden');
  columnName.focus();
}

export function showEditColumnModal(columnId) {
  const columns = loadColumns();
  const column = columns.find(c => c.id === columnId);
  if (!column) return;

  editingColumnId = columnId;
  const modal = $id('column-modal');
  const columnName = $id('column-name');
  const columnColor = $id('column-color');
  const modalTitle = $id('column-modal-title');
  const submitBtn = $id('column-submit-btn');

  clearFieldError(columnName);

  modalTitle.textContent = 'Edit Column';
  submitBtn.textContent = 'Save Changes';
  columnName.value = column.name;
  if (columnColor) {
    const color = column.color || '#3b82f6';
    columnColor.value = color;
    updateColumnColorHex(color);
  }
  modal.classList.remove('hidden');
  columnName.focus();
}

function hideColumnModal() {
  const modal = $id('column-modal');
  modal.classList.add('hidden');
  editingColumnId = null;
}

export function initializeColumnModalHandlers(setupModalCloseHandlers) {
  $id('column-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = $id('column-name');

    if (!validateAndShowColumnNameError(nameInput)) return;

    const name = nameInput.value.trim();
    const hexInput = $id('column-color-hex');
    const hexVal = (hexInput?.value || '').trim();

    let color;
    if (hexVal && hexVal !== $id('column-color').value) {
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
      $id('column-color').value = normalized;
      color = normalized;
    } else {
      color = $id('column-color')?.value;
    }

    if (editingColumnId) {
      updateColumn(editingColumnId, name, color);
    } else {
      addColumn(name, color);
    }
    hideColumnModal();
    emit(DATA_CHANGED);
  });

  setupModalCloseHandlers('column-modal', hideColumnModal);

  const columnColorInput = $id('column-color');
  columnColorInput?.addEventListener('input', (e) => {
    updateColumnColorHex(e.target.value);
  });

  const columnColorHexInput = $id('column-color-hex');
  columnColorHexInput?.addEventListener('input', (e) => {
    let val = e.target.value;
    if (val && !val.startsWith('#')) val = '#' + val;
    if (isValidHexColor(val)) {
      columnColorInput.value = val;
      e.target.classList.remove('invalid');
    } else {
      e.target.classList.toggle('invalid', val.length > 0);
    }
  });

  // Add column button
  $id('add-column-btn').addEventListener('click', showColumnModal);
}

export { hideColumnModal };
