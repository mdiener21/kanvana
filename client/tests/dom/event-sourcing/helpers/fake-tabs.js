// What several tabs of one origin share, for tests that load one module graph per tab (#222).
// Delivery is asynchronous as in a browser, and tests can hold it to stage a message in flight.
export class FakeBroadcastChannel {
  static channels = new Set();
  static log = [];
  static held = null;

  constructor(name) {
    this.name = name;
    this.onmessage = null;
    FakeBroadcastChannel.channels.add(this);
  }

  postMessage(data) {
    const message = structuredClone(data);
    FakeBroadcastChannel.log.push(message);
    const deliver = () => {
      for (const peer of FakeBroadcastChannel.channels) {
        if (peer !== this && peer.name === this.name) peer.onmessage?.({ data: structuredClone(message) });
      }
    };
    if (FakeBroadcastChannel.held) FakeBroadcastChannel.held.push(deliver);
    else setTimeout(deliver, 0);
  }

  close() {
    FakeBroadcastChannel.channels.delete(this);
  }

  static hold() {
    FakeBroadcastChannel.held = [];
  }

  static release() {
    const held = FakeBroadcastChannel.held ?? [];
    FakeBroadcastChannel.held = null;
    held.forEach((deliver) => setTimeout(deliver, 0));
  }

  static reset() {
    FakeBroadcastChannel.channels.clear();
    FakeBroadcastChannel.log = [];
    FakeBroadcastChannel.held = null;
  }
}

export function createFakeLocks() {
  const holders = new Set();
  const queues = new Map();

  function grantNext(name) {
    if (holders.has(name)) return;
    const next = queues.get(name)?.shift();
    if (next) run(name, next);
  }

  function run(name, entry) {
    entry.signal?.removeEventListener('abort', entry.onAbort);
    holders.add(name);
    Promise.resolve()
      .then(() => entry.callback({ name }))
      .then(entry.resolve, entry.reject)
      .finally(() => {
        holders.delete(name);
        grantNext(name);
      });
  }

  return {
    request(name, optionsOrCallback, maybeCallback) {
      const options = maybeCallback ? optionsOrCallback : {};
      const callback = maybeCallback ?? optionsOrCallback;
      return new Promise((resolve, reject) => {
        const entry = { callback, resolve, reject, signal: options.signal };
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        const busy = holders.has(name) || queue.length > 0;
        if (!busy) {
          run(name, entry);
        } else if (options.ifAvailable) {
          Promise.resolve().then(() => callback(null)).then(resolve, reject);
        } else {
          queue.push(entry);
          entry.onAbort = () => {
            queues.set(name, queues.get(name).filter((item) => item !== entry));
            reject(new DOMException('Aborted', 'AbortError'));
          };
          options.signal?.addEventListener('abort', entry.onAbort);
        }
      });
    },
    waiting: (name) => queues.get(name)?.length ?? 0,
    held: (name) => holders.has(name),
  };
}

export function installLocks(locks) {
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

export function removeLocks() {
  delete navigator.locks;
}
