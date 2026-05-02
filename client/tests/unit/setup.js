// Minimal browser API mocks for unit tests running in Node.
// Import this file BEFORE any source module that uses storage or navigator.

// Polyfill IndexedDB with fake-indexeddb so the idb wrapper works in Node.
import 'fake-indexeddb/auto';

import { _resetStorageForTesting } from '../../src/modules/storage.js';

const store = {};

globalThis.localStorage = {
  _store: store,
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null;
  },
  setItem(key, value) {
    this._store[key] = String(value);
  },
  removeItem(key) {
    delete this._store[key];
  },
  clear() {
    for (const k in this._store) delete this._store[k];
  }
};

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { language: 'en-US' };
}

if (typeof globalThis.window === 'undefined') {
  const listeners = {};
  globalThis.window = {
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach(fn => fn(event));
      return true;
    },
  };
}

export function resetLocalStorage() {
  localStorage.clear();
  // Also reset the in-memory IDB state so each test gets a clean slate.
  _resetStorageForTesting();
}
