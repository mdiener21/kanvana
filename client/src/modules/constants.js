// Domain constants — single source of truth for values used across modules.

export const LEGACY_DONE_COLUMN_ID = 'done';
export const DONE_COLUMN_ROLE = 'done';
export const DONE_COLUMN_ID = LEGACY_DONE_COLUMN_ID;

export function isDoneColumn(column) {
  return column?.role === DONE_COLUMN_ROLE || column?.id === LEGACY_DONE_COLUMN_ID;
}

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
export const PRIORITY_SET = new Set(PRIORITIES);

export const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export const DEFAULT_PRIORITY = 'none';
export const DEFAULT_COLUMN_COLOR = '#3b82f6';

export const MAX_LABEL_NAME_LENGTH = 40;

export const DEFAULT_APP_KEYBINDINGS = {
  openBoardsModal: { key: 'b', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }
};

export function matchesKey(event, binding) {
  return event.key?.toLowerCase() === binding.key.toLowerCase()
    && Boolean(event.ctrlKey) === binding.ctrlKey
    && Boolean(event.shiftKey) === binding.shiftKey
    && Boolean(event.altKey) === binding.altKey
    && Boolean(event.metaKey) === binding.metaKey;
}
