import {
  loadTasks,
  loadColumns,
  loadLabels,
  loadSettings,
  saveColumns,
  saveTasks,
  saveLabels,
  saveSettings
} from './storage.js';

import { createBoard, getActiveBoardName, listBoards, setActiveBoardId } from './storage.js';
import { emit, DATA_CHANGED } from './events.js';
import { normalizePriority, isHexColor, boardDisplayName, normalizeDueDate } from './normalize.js';
import { DONE_COLUMN_ID } from './constants.js';
import { formatBytes } from './security.js';

export const IMPORT_LIMITS = {
  maxFileSizeBytes: 2 * 1024 * 1024,
  warningFileSizeBytes: 512 * 1024,
  maxTasks: 5000,
  warningTasks: 1000,
  maxColumns: 100,
  warningColumns: 25,
  maxLabels: 500,
  warningLabels: 100
};

function safeParseArrayFromStorage(key) {
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeParseObjectFromStorage(key) {
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function refreshBoardsUI(activeBoardId) {
  const brandEl = document.getElementById('brand-text') || document.querySelector('.brand-text');
  if (brandEl) brandEl.textContent = getActiveBoardName();

  const selectEl = document.getElementById('board-select');
  if (!selectEl) return;

  const boards = listBoards();
  selectEl.innerHTML = '';

  boards.forEach((b) => {
    const option = document.createElement('option');
    option.value = b.id;
    option.textContent = boardDisplayName(b);
    selectEl.appendChild(option);
  });

  if (activeBoardId) selectEl.value = activeBoardId;
}

function boardNameFromFile(file) {
  const name = typeof file?.name === 'string' ? file.name.trim() : '';
  if (!name) return '';
  return name.replace(/\.[^.]+$/, '').trim();
}

function getImportSections(data) {
  if (Array.isArray(data)) {
    return {
      tasks: data,
      columns: null,
      labels: null,
      settings: null,
      boardName: null,
      format: 'legacy-tasks'
    };
  }

  if (data && typeof data === 'object' && data.tasks && data.columns) {
    return {
      tasks: data.tasks,
      columns: data.columns,
      labels: Object.prototype.hasOwnProperty.call(data, 'labels') ? data.labels : null,
      settings: Object.prototype.hasOwnProperty.call(data, 'settings') ? data.settings : null,
      boardName: typeof data.boardName === 'string' ? data.boardName.trim() : null,
      format: 'board-export'
    };
  }

  return null;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function validateImportFileMetadata(file) {
  const errors = [];
  const warnings = [];
  const fileSize = Number.isFinite(file?.size) ? file.size : 0;

  if (fileSize > IMPORT_LIMITS.maxFileSizeBytes) {
    errors.push(`Import file is too large (${formatBytes(fileSize)}). Maximum supported size is ${formatBytes(IMPORT_LIMITS.maxFileSizeBytes)}.`);
  } else if (fileSize > IMPORT_LIMITS.warningFileSizeBytes) {
    warnings.push(`Large import file detected (${formatBytes(fileSize)}). Importing may be slow on some browsers.`);
  }

  return { errors, warnings, fileSize };
}

export function inspectImportPayload(data, file = null) {
  const metadata = validateImportFileMetadata(file);
  const errors = [...metadata.errors];
  const warnings = [...metadata.warnings];
  const fileSize = metadata.fileSize;

  const sections = getImportSections(data);
  if (!sections) {
    errors.push('Invalid JSON file format. Expected either a task array or a board export object containing tasks and columns.');
    return { errors, warnings, fileSize };
  }

  const { tasks, columns, labels, settings, boardName, format } = sections;
  const normalizedTasks = normalizeImportedTasks(tasks);
  const normalizedColumns = columns ? normalizeImportedColumns(columns) : null;
  const normalizedLabels = labels ? normalizeImportedLabels(labels) : null;
  const normalizedSettings = settings ? normalizeImportedSettings(settings) : null;

  if (!normalizedTasks || (columns && !normalizedColumns) || (labels && !normalizedLabels) || (settings && !normalizedSettings)) {
    errors.push('Invalid data structure. One or more imported sections do not match the expected schema.');
    return { errors, warnings, fileSize, format };
  }

  if (format === 'legacy-tasks') {
    warnings.push('Legacy task-only import detected. Default columns, labels, and settings will be used for the new board.');
  }

  if (normalizedTasks.length > IMPORT_LIMITS.maxTasks) {
    errors.push(`Import contains too many tasks (${normalizedTasks.length}). Maximum supported task count is ${IMPORT_LIMITS.maxTasks}.`);
  } else if (normalizedTasks.length > IMPORT_LIMITS.warningTasks) {
    warnings.push(`Import contains ${normalizedTasks.length} tasks. Rendering and storage operations may feel slow.`);
  }

  const columnCount = normalizedColumns?.length ?? 0;
  if (columnCount > IMPORT_LIMITS.maxColumns) {
    errors.push(`Import contains too many columns (${columnCount}). Maximum supported column count is ${IMPORT_LIMITS.maxColumns}.`);
  } else if (columnCount > IMPORT_LIMITS.warningColumns) {
    warnings.push(`Import contains ${columnCount} columns. Board navigation may become difficult on smaller screens.`);
  }

  const labelCount = normalizedLabels?.length ?? 0;
  if (labelCount > IMPORT_LIMITS.maxLabels) {
    errors.push(`Import contains too many labels (${labelCount}). Maximum supported label count is ${IMPORT_LIMITS.maxLabels}.`);
  } else if (labelCount > IMPORT_LIMITS.warningLabels) {
    warnings.push(`Import contains ${labelCount} labels. Label pickers may become harder to manage.`);
  }

  if (normalizedColumns) {
    const columnIds = new Set(normalizedColumns.map((column) => column.id));
    const missingColumns = [...new Set(normalizedTasks.filter((task) => !columnIds.has(task.column)).map((task) => task.column))];
    if (missingColumns.length > 0) {
      errors.push(`Import references unknown columns: ${missingColumns.join(', ')}.`);
    }
  }

  let tasksWithKnownLabels = normalizedTasks;
  if (normalizedLabels) {
    const labelIds = new Set(normalizedLabels.map((label) => label.id));
    let removedLabelRefs = 0;
    tasksWithKnownLabels = normalizedTasks.map((task) => {
      const nextLabels = task.labels.filter((labelId) => labelIds.has(labelId));
      removedLabelRefs += task.labels.length - nextLabels.length;
      return nextLabels.length === task.labels.length ? task : { ...task, labels: nextLabels };
    });

    if (removedLabelRefs > 0) {
      warnings.push(`Removed ${removedLabelRefs} label reference${removedLabelRefs === 1 ? '' : 's'} that did not exist in the imported label list.`);
    }
  }

  const importedName = boardName || boardNameFromFile(file) || 'Imported board';

  return {
    errors,
    warnings,
    fileSize,
    format,
    importedName,
    normalizedTasks: tasksWithKnownLabels,
    normalizedColumns,
    normalizedLabels,
    normalizedSettings,
    summary: {
      tasks: tasksWithKnownLabels.length,
      columns: columnCount,
      labels: labelCount,
      includesSettings: Boolean(normalizedSettings)
    }
  };
}

export function buildImportConfirmationMessage(preview) {
  const summaryParts = [
    pluralize(preview?.summary?.tasks ?? 0, 'task'),
    pluralize(preview?.summary?.columns ?? 0, 'column'),
    pluralize(preview?.summary?.labels ?? 0, 'label')
  ];

  if (preview?.summary?.includesSettings) {
    summaryParts.push('settings included');
  }

  const parts = [
    `This import will create a new board named "${preview?.importedName || 'Imported board'}" and switch to it.`,
    `File size: ${formatBytes(preview?.fileSize ?? 0)}.`,
    `Contents: ${summaryParts.join(', ')}.`
  ];

  if (Array.isArray(preview?.warnings) && preview.warnings.length > 0) {
    parts.push(`Warnings: ${preview.warnings.join(' ')}`);
  }

  return parts.join(' ');
}

// normalizePriority, isHexColor imported from normalize.js

function normalizeSettingsForExport(settings) {
  const obj = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const showPriority = obj.showPriority !== false;
  const showDueDate = obj.showDueDate !== false;
  const showAge = obj.showAge !== false;
  const showChangeDate = obj.showChangeDate !== false;
  const locale = typeof obj.locale === 'string' && obj.locale.trim()
    ? obj.locale.trim()
    : (typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'en-US');
  const defaultPriority = normalizePriority(obj.defaultPriority);
  const rawNotificationDays = Number.parseInt((obj.notificationDays ?? '').toString(), 10);
  const notificationDays = Number.isFinite(rawNotificationDays)
    ? Math.min(365, Math.max(0, rawNotificationDays))
    : 3;
  const swimLanesEnabled = obj.swimLanesEnabled === true;
  const swimLaneGroupBy = ['label', 'label-group', 'priority'].includes(obj.swimLaneGroupBy)
    ? obj.swimLaneGroupBy
    : 'label';
  const swimLaneLabelGroup = typeof obj.swimLaneLabelGroup === 'string' ? obj.swimLaneLabelGroup.trim() : '';
  const swimLaneCollapsedKeys = Array.isArray(obj.swimLaneCollapsedKeys)
    ? obj.swimLaneCollapsedKeys
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => entry.trim())
    : [];
  return {
    showPriority,
    showDueDate,
    showAge,
    showChangeDate,
    locale,
    defaultPriority,
    notificationDays,
    swimLanesEnabled,
    swimLaneGroupBy,
    swimLaneLabelGroup,
    swimLaneCollapsedKeys
  };
}

// normalizeDueDate imported from normalize.js as normalizeDueDateFn

function normalizeTaskForExport(task) {
  const legacyTitle = typeof task?.text === 'string' ? task.text : '';
  const title = typeof task?.title === 'string' ? task.title : legacyTitle;
  const description = typeof task?.description === 'string' ? task.description : '';
  const dueDate = normalizeDueDate(task?.dueDate ?? task?.['due-date']);
  const changeDate =
    typeof task?.changeDate === 'string'
      ? task.changeDate
      : (typeof task?.changedDate === 'string' ? task.changedDate : undefined);

  const isDone = task?.column === DONE_COLUMN_ID;
  const doneDate = typeof task?.doneDate === 'string' ? task.doneDate.toString().trim() : '';

  const columnHistory = Array.isArray(task?.columnHistory)
    ? task.columnHistory
        .map((e) => {
          const column = typeof e?.column === 'string' ? e.column.trim() : '';
          const at = typeof e?.at === 'string' ? e.at.trim() : '';
          if (!column || !at) return null;
          return { column, at };
        })
        .filter(Boolean)
    : undefined;

  return {
    ...task,
    title: title.toString().trim(),
    description: description.toString().trim(),
    priority: normalizePriority(task?.priority),
    dueDate,
    ...(typeof changeDate === 'string' ? { changeDate: changeDate.toString().trim() } : {}),
    ...(isDone && doneDate ? { doneDate } : { doneDate: undefined }),
    ...(columnHistory && columnHistory.length ? { columnHistory } : { columnHistory: undefined }),
    ...(typeof task?.swimlaneLabelId === 'string' ? { swimlaneLabelId: task.swimlaneLabelId } : {}),
    ...(typeof task?.swimlaneLabelGroup === 'string' ? { swimlaneLabelGroup: task.swimlaneLabelGroup } : {}),
    // Avoid exporting the legacy field name.
    changedDate: undefined
  };
}

function normalizeImportedTasks(tasks) {
  if (!Array.isArray(tasks)) return null;

  const normalized = tasks.map((t) => {
    const id = typeof t?.id === 'string' ? t.id : String(t?.id ?? '');
    const legacyText = typeof t?.text === 'string' ? t.text : String(t?.text ?? '');
    const title = typeof t?.title === 'string' ? t.title : legacyText;
    const description = typeof t?.description === 'string' ? t.description : String(t?.description ?? '');
    const priority = normalizePriority(t?.priority);
    const dueDateRaw =
      typeof t?.dueDate === 'string'
        ? t.dueDate
        : (typeof t?.['due-date'] === 'string' ? t['due-date'] : String(t?.dueDate ?? t?.['due-date'] ?? ''));
    const dueDate = normalizeDueDate(dueDateRaw);
    const column = typeof t?.column === 'string' ? t.column : String(t?.column ?? '');

    const labels = Array.isArray(t?.labels) ? t.labels.map((l) => (typeof l === 'string' ? l : String(l))) : [];
    const order = Number.isFinite(t?.order) ? t.order : undefined;
    const creationDate = typeof t?.creationDate === 'string' ? t.creationDate : undefined;
    const changeDate =
      typeof t?.changeDate === 'string'
        ? t.changeDate
        : (typeof t?.changedDate === 'string' ? t.changedDate : undefined);

    const doneDateRaw = typeof t?.doneDate === 'string' ? t.doneDate.trim() : '';
    const isDone = column.trim() === DONE_COLUMN_ID;
    const doneDate = isDone
      ? (doneDateRaw || (typeof changeDate === 'string' ? changeDate.trim() : '') || (creationDate || ''))
      : '';

    const columnHistory = Array.isArray(t?.columnHistory)
      ? t.columnHistory
          .map((e) => {
            const column = typeof e?.column === 'string' ? e.column.trim() : String(e?.column ?? '').trim();
            const at = typeof e?.at === 'string' ? e.at.trim() : String(e?.at ?? '').trim();
            if (!column || !at) return null;
            return { column, at };
          })
          .filter(Boolean)
      : undefined;
    const swimlaneLabelId = typeof t?.swimlaneLabelId === 'string' ? t.swimlaneLabelId.trim() : undefined;
    const swimlaneLabelGroup = typeof t?.swimlaneLabelGroup === 'string' ? t.swimlaneLabelGroup.trim() : undefined;

    return {
      id: id.trim(),
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate.trim(),
      column: column.trim(),
      ...(order !== undefined ? { order } : {}),
      ...(creationDate ? { creationDate } : {}),
      ...(typeof changeDate === 'string' && changeDate.trim() ? { changeDate: changeDate.trim() } : {}),
      ...(doneDate ? { doneDate } : {}),
      ...(columnHistory && columnHistory.length ? { columnHistory } : {}),
      ...(swimlaneLabelId !== undefined ? { swimlaneLabelId } : {}),
      ...(swimlaneLabelGroup !== undefined ? { swimlaneLabelGroup } : {}),
      labels
    };
  });

  const isValid = normalized.every((t) => t.id && t.title && t.column);
  return isValid ? normalized : null;
}

function normalizeImportedColumns(columns) {
  if (!Array.isArray(columns)) return null;

  const normalized = columns.map((c) => {
    const id = typeof c?.id === 'string' ? c.id : String(c?.id ?? '');
    const name = typeof c?.name === 'string' ? c.name : String(c?.name ?? '');
    const order = Number.isFinite(c?.order) ? c.order : undefined;
    const color = isHexColor(c?.color) ? c.color.trim() : '#3b82f6';
    const collapsed = c?.collapsed === true;
    return {
      id: id.trim(),
      name: name.trim(),
      color,
      collapsed,
      ...(order !== undefined ? { order } : {})
    };
  });

  // Ensure the permanent Done column always exists.
  if (!normalized.some((c) => c.id === DONE_COLUMN_ID)) {
    const maxOrder = normalized.reduce((max, c) => Math.max(max, Number.isFinite(c?.order) ? c.order : 0), 0);
    normalized.push({ id: DONE_COLUMN_ID, name: 'Done', color: '#6d6d6d', order: maxOrder + 1, collapsed: false });
  }

  const isValid = normalized.every((c) => c.id && c.name);
  return isValid ? normalized : null;
}

function normalizeImportedLabels(labels) {
  if (!Array.isArray(labels)) return null;

  const normalized = labels.map((l) => {
    const id = typeof l?.id === 'string' ? l.id : String(l?.id ?? '');
    const name = typeof l?.name === 'string' ? l.name : String(l?.name ?? '');
    const color = isHexColor(l?.color) ? l.color.trim() : '#3b82f6';
    const group = typeof l?.group === 'string' ? l.group.trim() : '';
    return { id: id.trim(), name: name.trim(), color, group };
  });

  const isValid = normalized.every((l) => l.id && l.name && l.color);
  return isValid ? normalized : null;
}

function normalizeImportedSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;

  const showPriority = settings.showPriority !== false;
  const showDueDate = settings.showDueDate !== false;
  const showAge = settings.showAge !== false;
  const showChangeDate = settings.showChangeDate !== false;
  const locale = typeof settings.locale === 'string' && settings.locale.trim() ? settings.locale.trim() : undefined;
  const defaultPriorityRaw = typeof settings.defaultPriority === 'string' ? settings.defaultPriority : undefined;
  const defaultPriority = defaultPriorityRaw ? normalizePriority(defaultPriorityRaw) : undefined;
  const rawNotificationDays = Number.parseInt((settings.notificationDays ?? '').toString(), 10);
  const notificationDays = Number.isFinite(rawNotificationDays)
    ? Math.min(365, Math.max(0, rawNotificationDays))
    : undefined;
  const swimLanesEnabled = settings.swimLanesEnabled === true;
  const swimLaneGroupBy = ['label', 'label-group', 'priority'].includes(settings.swimLaneGroupBy)
    ? settings.swimLaneGroupBy
    : 'label';
  const swimLaneLabelGroup = typeof settings.swimLaneLabelGroup === 'string' ? settings.swimLaneLabelGroup.trim() : '';
  const swimLaneCollapsedKeys = Array.isArray(settings.swimLaneCollapsedKeys)
    ? settings.swimLaneCollapsedKeys
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => entry.trim())
    : [];
  return {
    showPriority,
    showDueDate,
    showAge,
    showChangeDate,
    ...(locale ? { locale } : {})
    ,...(defaultPriority ? { defaultPriority } : {})
    ,...(notificationDays !== undefined ? { notificationDays } : {})
    ,swimLanesEnabled
    ,swimLaneGroupBy
    ,swimLaneLabelGroup
    ,swimLaneCollapsedKeys
  };
}

// Export tasks and columns to JSON file
export function exportTasks() {
  const tasks = loadTasks().map(normalizeTaskForExport);
  const columns = loadColumns().map((c) => ({
    ...c,
    color: isHexColor(c?.color) ? c.color.trim() : '#3b82f6'
  }));
  const labels = loadLabels();
  const settings = loadSettings();
  const boardName = getActiveBoardName();
  const exportData = { boardName, columns, tasks, labels, settings };
  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${boardName.replaceAll(' ', '_').replaceAll('.', '_')}_board_${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export a specific board to JSON by boardId (does not switch active board).
export function exportBoard(boardId) {
  const id = typeof boardId === 'string' ? boardId.trim() : '';
  if (!id) return;

  const board = listBoards().find((b) => b.id === id);
  const boardName = boardDisplayName(board);

  const columnsKey = `kanbanBoard:${id}:columns`;
  const tasksKey = `kanbanBoard:${id}:tasks`;
  const labelsKey = `kanbanBoard:${id}:labels`;
  const settingsKey = `kanbanBoard:${id}:settings`;

  const rawTasks = safeParseArrayFromStorage(tasksKey) || [];
  const rawColumns = safeParseArrayFromStorage(columnsKey) || [];
  const rawLabels = safeParseArrayFromStorage(labelsKey) || [];
  const rawSettings = safeParseObjectFromStorage(settingsKey) || null;

  const tasks = rawTasks.map(normalizeTaskForExport);
  const columns = rawColumns.map((c) => ({
    ...c,
    color: isHexColor(c?.color) ? c.color.trim() : '#3b82f6',
    collapsed: c?.collapsed === true
  }));
  const labels = Array.isArray(rawLabels) ? rawLabels : [];
  const settings = normalizeSettingsForExport(rawSettings);

  const exportData = { boardName, columns, tasks, labels, settings };
  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${boardName.replaceAll(' ', '_').replaceAll('.', '_')}_board_${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import tasks and columns from JSON file
export function importTasks(file) {
  const metadataPreview = validateImportFileMetadata(file);
  if (metadataPreview.errors.length > 0) {
    import('./dialog.js').then(({ alertDialog }) => alertDialog({
      title: 'Import Error',
      message: metadataPreview.errors.join(' ')
    }));
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      const preview = inspectImportPayload(data, file);
      if (preview.errors.length > 0) {
        const { alertDialog } = await import('./dialog.js');
        await alertDialog({ title: 'Import Error', message: preview.errors.join(' ') });
        return;
      }

      const { confirmDialog } = await import('./dialog.js');
      const confirmed = await confirmDialog({
        title: 'Review Import',
        message: buildImportConfirmationMessage(preview),
        confirmText: 'Import Board',
        cancelText: 'Cancel'
      });

      if (!confirmed) return;

      const importedName = preview.importedName || 'Imported board';
      const newBoard = createBoard(importedName);
      if (newBoard?.id) setActiveBoardId(newBoard.id);

      if (preview.normalizedColumns) saveColumns(preview.normalizedColumns);
      saveTasks(preview.normalizedTasks);
      if (preview.normalizedLabels) saveLabels(preview.normalizedLabels);
      if (preview.normalizedSettings) {
        // Merge with current defaults (e.g., locale)
        const current = loadSettings();
        saveSettings({ ...current, ...preview.normalizedSettings });
      }

      refreshBoardsUI(newBoard?.id);

      emit(DATA_CHANGED);
      document.dispatchEvent(new CustomEvent('kanban:boards-changed'));
      const { alertDialog } = await import('./dialog.js');
      await alertDialog({ title: 'Import Complete', message: 'Board imported successfully!' });
    } catch (error) {
      const { alertDialog } = await import('./dialog.js');
      await alertDialog({ title: 'Import Error', message: 'Error parsing JSON file: ' + error.message });
    }
  };
  reader.readAsText(file);
}
