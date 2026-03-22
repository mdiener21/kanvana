// Minimal browser API mocks for unit tests running in Node.
// Import this file BEFORE any source module that uses localStorage or navigator.

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

export function resetLocalStorage() {
  localStorage.clear();
}
