// Domain constants — single source of truth for values used across modules.

export const DONE_COLUMN_ID = 'done';

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
export const PRIORITY_SET = new Set(PRIORITIES);

export const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export const DEFAULT_PRIORITY = 'none';
export const DEFAULT_COLUMN_COLOR = '#3b82f6';

export const MAX_LABEL_NAME_LENGTH = 40;
