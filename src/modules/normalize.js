// Shared normalizers and validators — eliminates duplication across modules.

import { PRIORITY_SET, DEFAULT_PRIORITY, DEFAULT_COLUMN_COLOR } from './constants.js';

/**
 * Validate and normalize a priority value.
 * Returns DEFAULT_PRIORITY ('none') for invalid values.
 */
export function normalizePriority(value) {
  const v = (value || '').toString().trim().toLowerCase();
  return PRIORITY_SET.has(v) ? v : DEFAULT_PRIORITY;
}

/**
 * Check whether a string is a valid hex color (#abc or #aabbcc).
 */
export function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/**
 * Normalize a hex color value, falling back to DEFAULT_COLUMN_COLOR.
 */
export function normalizeHexColor(value, fallback = DEFAULT_COLUMN_COLOR) {
  return isHexColor(value) ? value.trim() : fallback;
}

/**
 * Display name for a board object, falling back to 'Untitled board'.
 */
export function boardDisplayName(board) {
  const name = typeof board?.name === 'string' ? board.name.trim() : '';
  return name || 'Untitled board';
}

/**
 * Normalize a due date value.
 * Strips ISO time portion if present.
 */
export function normalizeDueDate(value) {
  const v = (value || '').toString().trim();
  if (v.length >= 10 && v.includes('T')) return v.slice(0, 10);
  return v;
}

/**
 * Deduplicate an array of string keys, trimming whitespace.
 */
export function normalizeStringKeys(keys) {
  if (!Array.isArray(keys)) return [];

  const seen = new Set();
  return keys
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}
