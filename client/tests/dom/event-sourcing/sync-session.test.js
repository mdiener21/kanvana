// #219: the session's lifecycle against a fake network side. It covers the orderings
// and races a page boot can't stage on demand; sync-session-boot.test.js covers the real thing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncSession } from '../../../src/modules/event-sourcing/sync-session.js';

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((res, rej) => { resolvePromise = res; rejectPromise = rej; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeNetwork() {
  const log = [];
  const network = {
    log,
    connect: null,
    authRejected: null,
    catchUpResult: () => Promise.resolve(),
    realtimeResult: () => Promise.resolve(),
    stopRealtimeResult: () => Promise.resolve(),
    startRealtime: vi.fn(async (onConnect) => { log.push('realtime start'); network.connect = onConnect; await network.realtimeResult(); }),
    stopRealtime: vi.fn(async () => { log.push('realtime stop'); await network.stopRealtimeResult(); }),
    catchUp: vi.fn(async () => { log.push('catch-up'); await network.catchUpResult(); }),
    startQueue: vi.fn((onAuthRejected) => { log.push('queue start'); network.authRejected = onAuthRejected; }),
    stopQueue: vi.fn(() => { log.push('queue stop'); }),
    startSnapshots: vi.fn(() => { log.push('snapshots start'); }),
    stopSnapshots: vi.fn(() => { log.push('snapshots stop'); }),
  };
  return network;
}

let session = null;
let auth = null;
let online = true;

function startSession(network, options = {}) {
  session = createSyncSession({
    network,
    getUserId: () => auth,
    isOnline: () => online,
    connectWaitMs: 5,
    ...options,
  });
  session.start();
  return session;
}

function signIn(id = 'user-a') {
  auth = id;
  window.dispatchEvent(new CustomEvent('auth-changed'));
}

function signOut() {
  auth = null;
  window.dispatchEvent(new CustomEvent('auth-changed'));
}

function setOnline(value) {
  online = value;
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

beforeEach(() => {
  auth = null;
  online = true;
});

afterEach(() => {
  session?.dispose();
  session = null;
});

describe('sign-in', () => {
  it('stays signed out with no network work until someone signs in', async () => {
    const network = fakeNetwork();
    startSession(network);
    await flush();

    expect(session.getState()).toBe('signed-out');
    expect(network.catchUp).not.toHaveBeenCalled();
    expect(network.startRealtime).not.toHaveBeenCalled();
    expect(network.startQueue).not.toHaveBeenCalled();
  });

  it('subscribes first, pulls once, and only then goes live and starts the queue', async () => {
    const network = fakeNetwork();
    const states = [];
    startSession(network, { onStateChange: (state) => states.push(state) });

    signIn();
    await flush();
    await flush();

    expect(states).toEqual(['catching-up', 'live']);
    expect(network.catchUp).toHaveBeenCalledTimes(1);
    const order = network.log.filter((entry) => ['realtime start', 'catch-up', 'queue start'].includes(entry));
    expect(order).toEqual(['realtime start', 'catch-up', 'queue start']);
  });

  it('treats an already signed-in launch as a sign-in', async () => {
    const network = fakeNetwork();
    auth = 'user-a';
    startSession(network);
    await flush();
    await flush();

    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('goes straight to offline when signed in with no network', async () => {
    const network = fakeNetwork();
    online = false;
    auth = 'user-a';
    startSession(network);
    await flush();

    expect(session.getState()).toBe('offline');
    expect(network.catchUp).not.toHaveBeenCalled();
    expect(network.startRealtime).not.toHaveBeenCalled();
  });

  it('ignores the initial SSE connect that arrives while it is subscribing', async () => {
    const network = fakeNetwork();
    const connecting = deferred();
    network.realtimeResult = () => connecting.promise;
    startSession(network, { connectWaitMs: 1000 });

    signIn();
    await flush();
    network.connect();
    connecting.resolve();
    await flush();
    await flush();

    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('ignores a token refresh for the same account', async () => {
    const network = fakeNetwork();
    startSession(network);
    signIn();
    await flush();
    await flush();

    signIn();
    signIn();
    await flush();

    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('runs a fresh sign-in when the account changes with no sign-out between', async () => {
    const network = fakeNetwork();
    startSession(network);
    signIn('user-a');
    await flush();
    await flush();

    signIn('user-b');
    await flush();
    await flush();

    expect(session.getState()).toBe('live');
    expect(network.stopRealtime).toHaveBeenCalledTimes(1);
    expect(network.catchUp).toHaveBeenCalledTimes(2);
  });
});

describe('failures while catching up', () => {
  it('still pulls when the SSE subscription fails, and goes live', async () => {
    const network = fakeNetwork();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    network.realtimeResult = () => Promise.reject(new Error('SSE unavailable'));
    startSession(network);

    signIn();
    await flush();
    await flush();
    log.mockRestore();

    expect(network.catchUp).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe('live');
  });

  it('does not wait forever for a slow SSE subscription, and pulls again once it is up', async () => {
    const network = fakeNetwork();
    const connecting = deferred();
    network.realtimeResult = () => connecting.promise;
    startSession(network, { connectWaitMs: 1 });

    signIn();
    await new Promise((r) => setTimeout(r, 20));
    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);

    connecting.resolve();
    await flush();
    await flush();

    // Events from before the subscription came up may have been missed by the first pull.
    expect(network.catchUp).toHaveBeenCalledTimes(2);
    expect(session.getState()).toBe('live');
  });

  it('goes live after a failed pull so the queue and realtime keep working', async () => {
    const network = fakeNetwork();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    network.catchUpResult = () => Promise.reject(Object.assign(new Error('down'), { status: 503 }));
    startSession(network);

    signIn();
    await flush();
    await flush();
    log.mockRestore();

    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('pauses when the pull is rejected for auth', async () => {
    const network = fakeNetwork();
    network.catchUpResult = () => Promise.reject(Object.assign(new Error('nope'), { status: 401 }));
    startSession(network);

    signIn();
    await flush();
    await flush();

    expect(session.getState()).toBe('paused');
    expect(network.startQueue).not.toHaveBeenCalled();
  });
});

describe('SSE reconnect', () => {
  it('runs one catch-up and returns to live, holding the queue meanwhile', async () => {
    const network = fakeNetwork();
    startSession(network);
    signIn();
    await flush();
    await flush();
    const pull = deferred();
    network.catchUpResult = () => pull.promise;

    network.connect();
    await flush();

    expect(session.getState()).toBe('catching-up');
    expect(network.stopQueue).toHaveBeenCalled();
    expect(network.catchUp).toHaveBeenCalledTimes(2);

    pull.resolve();
    await flush();
    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(2);
    expect(network.startQueue).toHaveBeenCalledTimes(2);
  });

  it('pulls once more when SSE reconnects during a pull, since that pull may have missed events', async () => {
    const network = fakeNetwork();
    const pull = deferred();
    network.catchUpResult = () => pull.promise;
    startSession(network);
    signIn();
    await flush();
    await flush();
    expect(network.catchUp).toHaveBeenCalledTimes(1);

    network.connect();
    network.connect();
    network.catchUpResult = () => Promise.resolve();
    pull.resolve();
    await flush();
    await flush();

    expect(network.catchUp).toHaveBeenCalledTimes(2);
    expect(session.getState()).toBe('live');
  });
});

describe('offline and online', () => {
  async function liveSession() {
    const network = fakeNetwork();
    startSession(network);
    signIn();
    await flush();
    await flush();
    network.log.length = 0;
    return network;
  }

  it('stops realtime, the queue and snapshot upload on offline', async () => {
    const network = await liveSession();

    setOnline(false);
    await flush();

    expect(session.getState()).toBe('offline');
    expect(network.log).toEqual(expect.arrayContaining(['queue stop', 'snapshots stop', 'realtime stop']));
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('runs exactly one catch-up on online, then restarts the queue', async () => {
    const network = await liveSession();
    setOnline(false);
    await flush();
    network.log.length = 0;

    setOnline(true);
    await flush();
    await flush();

    expect(session.getState()).toBe('live');
    expect(network.log.filter((entry) => entry === 'catch-up')).toHaveLength(1);
    expect(network.log.indexOf('catch-up')).toBeLessThan(network.log.indexOf('queue start'));
  });

  it('does not restart realtime until the previous stop has finished', async () => {
    const network = await liveSession();
    const stopping = deferred();
    network.stopRealtimeResult = () => stopping.promise;
    setOnline(false);
    await flush();
    network.log.length = 0;

    setOnline(true);
    await flush();
    expect(network.log).not.toContain('realtime start');

    stopping.resolve();
    await flush();
    await flush();
    expect(network.log).toContain('realtime start');
    expect(session.getState()).toBe('live');
  });

  it('abandons a pull when the browser goes offline during it', async () => {
    const network = fakeNetwork();
    const pull = deferred();
    network.catchUpResult = () => pull.promise;
    startSession(network);
    signIn();
    await flush();
    await flush();

    setOnline(false);
    pull.resolve();
    await flush();

    expect(session.getState()).toBe('offline');
    expect(network.startQueue).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('stops realtime, the queue and snapshot upload', async () => {
    const network = fakeNetwork();
    startSession(network);
    signIn();
    await flush();
    await flush();
    network.log.length = 0;

    signOut();
    await flush();

    expect(session.getState()).toBe('signed-out');
    expect(network.log).toEqual(expect.arrayContaining(['queue stop', 'snapshots stop', 'realtime stop']));
  });

  it('ignores online and offline while signed out', async () => {
    const network = fakeNetwork();
    startSession(network);

    setOnline(false);
    setOnline(true);
    await flush();

    expect(session.getState()).toBe('signed-out');
    expect(network.catchUp).not.toHaveBeenCalled();
  });

  it('does not go live when sign-out lands during the pull', async () => {
    const network = fakeNetwork();
    const pull = deferred();
    network.catchUpResult = () => pull.promise;
    startSession(network);
    signIn();
    await flush();
    await flush();

    signOut();
    pull.resolve();
    await flush();

    expect(session.getState()).toBe('signed-out');
    expect(network.startQueue).not.toHaveBeenCalled();
  });
});

describe('paused', () => {
  async function pausedSession() {
    const network = fakeNetwork();
    startSession(network);
    signIn();
    await flush();
    await flush();
    network.authRejected();
    return network;
  }

  it('enters paused on a rejected push and stops the queue', async () => {
    const network = await pausedSession();

    expect(session.getState()).toBe('paused');
    expect(network.stopQueue).toHaveBeenCalled();
  });

  it('resumes through catching-up on re-authentication, with one catch-up', async () => {
    const network = await pausedSession();
    const pullsBefore = network.catchUp.mock.calls.length;
    const pull = deferred();
    network.catchUpResult = () => pull.promise;

    signIn();
    await flush();
    expect(session.getState()).toBe('catching-up');

    pull.resolve();
    await flush();
    expect(session.getState()).toBe('live');
    expect(network.catchUp.mock.calls.length).toBe(pullsBefore + 1);
  });

  it('stays paused through an online event', async () => {
    const network = await pausedSession();

    window.dispatchEvent(new Event('online'));
    await flush();

    expect(session.getState()).toBe('paused');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });
});

// Seam for the Data Owner check (#221): it runs on every sign-in, before any network work.
describe('beforeSignIn', () => {
  it('holds the session in signed-out with no network work until it resolves', async () => {
    const network = fakeNetwork();
    const check = deferred();
    startSession(network, { beforeSignIn: () => check.promise });

    signIn();
    await flush();
    expect(session.getState()).toBe('signed-out');
    expect(network.log).toEqual([]);

    check.resolve(true);
    await flush();
    await flush();
    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('stays signed out when it declines the sign-in', async () => {
    const network = fakeNetwork();
    startSession(network, { beforeSignIn: async () => false });

    signIn();
    await flush();
    await flush();

    expect(session.getState()).toBe('signed-out');
    expect(network.log).toEqual([]);
  });

  it('stays signed out when it throws', async () => {
    const network = fakeNetwork();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    startSession(network, { beforeSignIn: async () => { throw new Error('boom'); } });

    signIn();
    await flush();
    log.mockRestore();

    expect(session.getState()).toBe('signed-out');
    expect(network.log).toEqual([]);
  });

  it('is passed the account that is signing in', async () => {
    const network = fakeNetwork();
    const seen = [];
    startSession(network, { beforeSignIn: async (id) => { seen.push(id); return true; } });

    signIn('user-b');
    await flush();

    expect(seen).toEqual(['user-b']);
  });

  it('drops a held sign-in when the user signs out meanwhile', async () => {
    const network = fakeNetwork();
    const check = deferred();
    startSession(network, { beforeSignIn: () => check.promise });

    signIn();
    await flush();
    signOut();
    check.resolve(true);
    await flush();

    expect(session.getState()).toBe('signed-out');
    expect(network.log).not.toContain('catch-up');
  });

  it('does not run again on a token refresh while holding', async () => {
    const network = fakeNetwork();
    const check = deferred();
    const beforeSignIn = vi.fn(() => check.promise);
    startSession(network, { beforeSignIn });

    signIn();
    signIn();
    await flush();

    expect(beforeSignIn).toHaveBeenCalledTimes(1);
    check.resolve(true);
  });

  it('does not run when a paused session re-authenticates as the same account', async () => {
    const network = fakeNetwork();
    const beforeSignIn = vi.fn(async () => true);
    startSession(network, { beforeSignIn });
    signIn();
    await flush();
    await flush();
    network.authRejected();

    signIn();
    await flush();
    await flush();

    expect(beforeSignIn).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe('live');
  });

  it('runs for a sign-in with no network, so offline launches are checked too', async () => {
    const network = fakeNetwork();
    const beforeSignIn = vi.fn(async () => true);
    online = false;
    startSession(network, { beforeSignIn });

    signIn();
    await flush();

    expect(beforeSignIn).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe('offline');
  });
});

describe('dispose', () => {
  it('stops listening to the window', async () => {
    const network = fakeNetwork();
    startSession(network);
    session.dispose();

    signIn();
    await flush();

    expect(network.log).toEqual([]);
  });
});

// #222: a follower tab's session runs on a network side that does nothing; becoming sync
// leader must then do the network work the session's current state calls for.
describe('taking over as sync leader', () => {
  async function liveFollower(network) {
    startSession(network);
    signIn();
    await flush();
    await flush();
    expect(session.getState()).toBe('live');
    network.catchUp.mockClear();
    network.startRealtime.mockClear();
    network.startQueue.mockClear();
    network.startSnapshots.mockClear();
    network.log.length = 0;
  }

  it('from live: subscribes, pulls once, then goes live and starts the queue', async () => {
    const network = fakeNetwork();
    await liveFollower(network);

    session.takeOver();
    expect(session.getState()).toBe('catching-up');
    await flush();
    await flush();

    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
    expect(network.startSnapshots).toHaveBeenCalledTimes(1);
    const order = network.log.filter((entry) => ['realtime start', 'catch-up', 'queue start'].includes(entry));
    expect(order).toEqual(['realtime start', 'catch-up', 'queue start']);
  });

  it('while catching up: drops the pull in progress and runs one that counts', async () => {
    const network = fakeNetwork();
    const stuck = deferred();
    network.catchUpResult = () => stuck.promise;
    startSession(network);
    signIn();
    await flush();
    expect(network.catchUp).toHaveBeenCalledTimes(1);

    network.catchUpResult = () => Promise.resolve();
    session.takeOver();
    await flush();
    await flush();
    stuck.resolve();
    await flush();

    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(2);
    expect(network.startQueue).toHaveBeenCalledTimes(1);
  });

  it('while signed out: does nothing until someone signs in', async () => {
    const network = fakeNetwork();
    startSession(network);

    session.takeOver();
    await flush();

    expect(session.getState()).toBe('signed-out');
    expect(network.startRealtime).not.toHaveBeenCalled();
    expect(network.catchUp).not.toHaveBeenCalled();
    expect(network.startQueue).not.toHaveBeenCalled();

    signIn();
    await flush();
    await flush();
    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('while the sign-in check is pending: leaves the sign-in to run once the check passes', async () => {
    const network = fakeNetwork();
    const check = deferred();
    startSession(network, { beforeSignIn: () => check.promise });
    signIn();
    await flush();

    session.takeOver();
    await flush();
    expect(session.getState()).toBe('signed-out');
    expect(network.catchUp).not.toHaveBeenCalled();

    check.resolve(true);
    await flush();
    await flush();
    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('while offline: stays offline with no network work, and catches up on the online event', async () => {
    const network = fakeNetwork();
    online = false;
    auth = 'user-a';
    startSession(network);
    await flush();

    session.takeOver();
    await flush();
    expect(session.getState()).toBe('offline');
    expect(network.startRealtime).not.toHaveBeenCalled();
    expect(network.catchUp).not.toHaveBeenCalled();

    setOnline(true);
    await flush();
    await flush();
    expect(session.getState()).toBe('live');
    expect(network.catchUp).toHaveBeenCalledTimes(1);
  });

  it('while paused: holds realtime and pulls once, but pushes nothing until fresh credentials', async () => {
    const network = fakeNetwork();
    await liveFollower(network);
    session.noteLeaderState('paused');
    expect(session.getState()).toBe('paused');
    network.startQueue.mockClear();

    session.takeOver();
    await flush();
    await flush();

    expect(session.getState()).toBe('paused');
    expect(network.startRealtime).toHaveBeenCalledTimes(1);
    expect(network.catchUp).toHaveBeenCalledTimes(1);
    expect(network.startQueue).not.toHaveBeenCalled();
    expect(network.startSnapshots).not.toHaveBeenCalled();

    signIn();
    await flush();
    await flush();
    expect(session.getState()).toBe('live');
    expect(network.startQueue).toHaveBeenCalledTimes(1);
  });
});

describe('following the leader tab', () => {
  async function liveFollower(network) {
    startSession(network);
    signIn();
    await flush();
    await flush();
  }

  it('pauses with the leader and leaves paused when the leader is live again', async () => {
    const network = fakeNetwork();
    await liveFollower(network);

    session.noteLeaderState('paused');
    expect(session.getState()).toBe('paused');

    session.noteLeaderState('live');
    await flush();
    await flush();
    expect(session.getState()).toBe('live');
  });

  it('does not take auth or network state from the leader', async () => {
    const network = fakeNetwork();
    startSession(network);

    session.noteLeaderState('paused');
    session.noteLeaderState('live');
    expect(session.getState()).toBe('signed-out');

    auth = 'user-a';
    online = false;
    window.dispatchEvent(new CustomEvent('auth-changed'));
    await flush();
    session.noteLeaderState('paused');
    session.noteLeaderState('live');
    expect(session.getState()).toBe('offline');
  });
});
