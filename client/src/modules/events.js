// Lightweight event bus — replaces `await import('./render.js')` pattern
// and eliminates circular-dependency workarounds.

const bus = new EventTarget();

/**
 * Subscribe to an event.
 * @param {string} event
 * @param {Function} handler
 */
export function on(event, handler) {
  bus.addEventListener(event, handler);
}

/**
 * Unsubscribe from an event.
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
  bus.removeEventListener(event, handler);
}

/**
 * Emit an event, optionally with detail data.
 * @param {string} event
 * @param {*} [detail]
 */
export function emit(event, detail) {
  bus.dispatchEvent(new CustomEvent(event, { detail }));
}

// Well-known event names
export const BOARD_CHANGED = 'board:changed';
export const DATA_CHANGED = 'data:changed';
