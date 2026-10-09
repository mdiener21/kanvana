// Domain constants — single source of truth for values used across modules.

export const LEGACY_DONE_COLUMN_ID = 'done';
export const DONE_COLUMN_ROLE = 'done';
export const DONE_COLUMN_ID = LEGACY_DONE_COLUMN_ID;

export function isDoneColumn(column) {
  return column?.role === DONE_COLUMN_ROLE || column?.id === LEGACY_DONE_COLUMN_ID;
}

// Event scopes (ADR-0004). Events without a scope (legacy) are board-scoped.
export const EVENT_SCOPE = Object.freeze({
  BOARD: 'board',
  GLOBAL: 'global',
  TIMETRACKING: 'timetracking'
});

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
export const PRIORITY_SET = new Set(PRIORITIES);

export const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export const DEFAULT_PRIORITY = 'none';
export const DEFAULT_COLUMN_COLOR = '#3b82f6';

export const MAX_LABEL_NAME_LENGTH = 40;

const NO_MODIFIERS = Object.freeze({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });

// `seq` marks the second key of a two-key sequence; `key` is the prefix, matched with matchesKey.
export const DEFAULT_APP_KEYBINDINGS = {
  openBoardsModal: { key: 'b', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  ttHelp: { key: '?', ctrlKey: false, shiftKey: true, altKey: false, metaKey: false },
  ttCloseModal: { key: 'Escape', ...NO_MODIFIERS },
  ttSubmitInline: { key: 'Enter', ...NO_MODIFIERS },
  ttGotoTracker: { key: 'g', seq: 't', ...NO_MODIFIERS },
  ttGotoReports: { key: 'g', seq: 'r', ...NO_MODIFIERS },
  ttGotoProjects: { key: 'g', seq: 'p', ...NO_MODIFIERS },
  ttGotoSettings: { key: 'g', seq: 's', ...NO_MODIFIERS }
};

export const TT_COLOR_PALETTE = [
  '#03a9f4', '#e91e63', '#8bc34a', '#ff9800',
  '#9c27b0', '#009688', '#795548', '#3f51b5'
];

export function matchesKey(event, binding) {
  return event.key?.toLowerCase() === binding.key.toLowerCase()
    && Boolean(event.ctrlKey) === binding.ctrlKey
    && Boolean(event.shiftKey) === binding.shiftKey
    && Boolean(event.altKey) === binding.altKey
    && Boolean(event.metaKey) === binding.metaKey;
}
