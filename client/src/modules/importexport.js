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

function boardDisplayName(board) {
  const name = typeof board?.name === 'string' ? board.name.trim() : '';
  return name || 'Untitled board';
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

function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

const allowedPriorities = new Set(['urgent', 'high', 'medium', 'low', 'none']);

function normalizePriority(value) {
  const v = (value || '').toString().trim().toLowerCase();
  return allowedPriorities.has(v) ? v : 'none';
}

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
  return { showPriority, showDueDate, showAge, showChangeDate, locale, defaultPriority, notificationDays };
}

function normalizeDueDate(value) {
  const v = (value || '').toString().trim();
  // Prefer storing/exporting YYYY-MM-DD; tolerate ISO and keep as-is if unknown.
  if (v.length >= 10 && v.includes('T')) return v.slice(0, 10);
  return v;
}

function normalizeTaskForExport(task) {
  const legacyTitle = typeof task?.text === 'string' ? task.text : '';
  const title = typeof task?.title === 'string' ? task.title : legacyTitle;
  const description = typeof task?.description === 'string' ? task.description : '';
  const dueDate = normalizeDueDate(task?.dueDate ?? task?.['due-date']);
  const changeDate =
    typeof task?.changeDate === 'string'
      ? task.changeDate
      : (typeof task?.changedDate === 'string' ? task.changedDate : undefined);

  const isDone = task?.column === 'done';
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
    const isDone = column.trim() === 'done';
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
  if (!normalized.some((c) => c.id === 'done')) {
    const maxOrder = normalized.reduce((max, c) => Math.max(max, Number.isFinite(c?.order) ? c.order : 0), 0);
    normalized.push({ id: 'done', name: 'Done', color: '#16a34a', order: maxOrder + 1, collapsed: false });
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
  return {
    showPriority,
    showDueDate,
    showAge,
    showChangeDate,
    ...(locale ? { locale } : {})
    ,...(defaultPriority ? { defaultPriority } : {})
    ,...(notificationDays !== undefined ? { notificationDays } : {})
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
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      // Support multiple formats for backward compatibility
      let tasks, columns, labels, settings, boardName;
      
      if (Array.isArray(data)) {
        // Old format: just tasks array
        tasks = data;
        columns = null;
        labels = null;
        settings = null;
        boardName = null;
      } else if (data.tasks && data.columns) {
        // New format: object with columns and tasks (and optionally labels)
        tasks = data.tasks;
        columns = data.columns;
        labels = Object.prototype.hasOwnProperty.call(data, 'labels') ? data.labels : null;
        settings = Object.prototype.hasOwnProperty.call(data, 'settings') ? data.settings : null;
        boardName = typeof data.boardName === 'string' ? data.boardName.trim() : null;
      } else {
        alert('Invalid JSON file format');
        return;
      }

      const normalizedTasks = normalizeImportedTasks(tasks);
      const normalizedColumns = columns ? normalizeImportedColumns(columns) : null;
      const normalizedLabels = labels ? normalizeImportedLabels(labels) : null;
      const normalizedSettings = settings ? normalizeImportedSettings(settings) : null;

      if (!normalizedTasks || (columns && !normalizedColumns) || (labels && !normalizedLabels) || (settings && !normalizedSettings)) {
        alert('Invalid data structure');
        return;
      }

      const importedName = boardName || boardNameFromFile(file) || 'Imported board';
      const newBoard = createBoard(importedName);
      if (newBoard?.id) setActiveBoardId(newBoard.id);

      if (normalizedColumns) saveColumns(normalizedColumns);
      saveTasks(normalizedTasks);
      if (normalizedLabels) saveLabels(normalizedLabels);
      if (normalizedSettings) {
        // Merge with current defaults (e.g., locale)
        const current = loadSettings();
        saveSettings({ ...current, ...normalizedSettings });
      }

      refreshBoardsUI(newBoard?.id);
      
      const { renderBoard } = await import('./render.js');
      renderBoard();
      document.dispatchEvent(new CustomEvent('kanban:boards-changed'));
      alert('Board imported successfully!');
    } catch (error) {
      alert('Error parsing JSON file: ' + error.message);
    }
  };
  reader.readAsText(file);
}
