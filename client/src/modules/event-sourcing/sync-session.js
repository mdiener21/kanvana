// Sync session (#219): the one owner of the sync lifecycle. Only this module reacts to
// auth, `online` and `offline`; the queue, realtime and snapshot upload take commands.

import { getUser, isAuthenticated } from '../sync.js';
import { catchUpAfterPending, startRealtime, stopRealtime } from './realtime.js';
import { startSnapshotSync, stopSnapshotSync, uploadStoredSnapshot } from './snapshot-sync.js';
import { drainSyncQueue, startSyncQueue, stopSyncQueue, SYNC_STATUS_CHANGED } from './sync-queue.js';

export const SESSION_STATE = Object.freeze({
  SIGNED_OUT: 'signed-out',
  CATCHING_UP: 'catching-up',
  LIVE: 'live',
  OFFLINE: 'offline',
  PAUSED: 'paused',
});

export const SESSION_EVENT = Object.freeze({
  SIGNED_IN: 'signed-in',
  SIGNED_IN_OFFLINE: 'signed-in-offline',
  SIGNED_OUT: 'signed-out',
  WENT_ONLINE: 'went-online',
  WENT_OFFLINE: 'went-offline',
  CATCH_UP_DONE: 'catch-up-done',
  REALTIME_RECONNECTED: 'realtime-reconnected',
  AUTH_REJECTED: 'auth-rejected',
});

const { SIGNED_OUT, CATCHING_UP, LIVE, OFFLINE, PAUSED } = SESSION_STATE;
const EVENT = SESSION_EVENT;

const TRANSITIONS = {
  [SIGNED_OUT]: {
    [EVENT.SIGNED_IN]: CATCHING_UP,
    [EVENT.SIGNED_IN_OFFLINE]: OFFLINE,
  },
  [CATCHING_UP]: {
    [EVENT.SIGNED_OUT]: SIGNED_OUT,
    [EVENT.WENT_OFFLINE]: OFFLINE,
    [EVENT.CATCH_UP_DONE]: LIVE,
    [EVENT.AUTH_REJECTED]: PAUSED,
  },
  [LIVE]: {
    [EVENT.SIGNED_OUT]: SIGNED_OUT,
    [EVENT.WENT_OFFLINE]: OFFLINE,
    [EVENT.REALTIME_RECONNECTED]: CATCHING_UP,
    [EVENT.AUTH_REJECTED]: PAUSED,
  },
  [OFFLINE]: {
    [EVENT.SIGNED_OUT]: SIGNED_OUT,
    [EVENT.WENT_ONLINE]: CATCHING_UP,
  },
  [PAUSED]: {
    [EVENT.SIGNED_IN]: CATCHING_UP,
    [EVENT.SIGNED_IN_OFFLINE]: OFFLINE,
    [EVENT.SIGNED_OUT]: SIGNED_OUT,
    [EVENT.WENT_OFFLINE]: OFFLINE,
  },
};

export function transitionSession(state, event) {
  return TRANSITIONS[state]?.[event] ?? state;
}

const DEFAULT_CONNECT_WAIT_MS = 3000;

export const POCKETBASE_NETWORK = {
  startRealtime: (onConnect) => startRealtime({ onConnect }),
  stopRealtime,
  catchUp: catchUpAfterPending,
  startQueue: (onAuthRejected) => {
    startSyncQueue({ onAuthRejected });
    drainSyncQueue();
  },
  stopQueue: stopSyncQueue,
  startSnapshots: startSnapshotSync,
  stopSnapshots: stopSnapshotSync,
  uploadStoredSnapshot,
};

function isAuthRejection(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 401 || status === 403;
}

// `network` is everything that talks to the server; a tab that must not (#222) passes
// one that does nothing. `beforeSignIn(userId)` runs on every new sign-in before any
// network work: while it is pending the session stays signed-out, and a false result
// keeps it there (#221).
export function createSyncSession({
  network = POCKETBASE_NETWORK,
  beforeSignIn = async () => true,
  getUserId = () => (isAuthenticated() ? getUser()?.id ?? null : null),
  isOnline = () => navigator.onLine,
  connectWaitMs = DEFAULT_CONNECT_WAIT_MS,
  onStateChange = () => {},
}) {
  let state = SIGNED_OUT;
  let userId = null;
  let signInAttempt = 0;
  let entry = 0; // bumped on every state change, so async work can tell it is stale
  let realtimeStopped = Promise.resolve();
  let pullStarted = false;
  let pullAgain = false;
  let listeners = null;

  function dispatch(event) {
    const next = transitionSession(state, event);
    if (next !== state) enter(next);
  }

  function enter(next) {
    state = next;
    entry += 1;
    enterState(next);
    onStateChange(next);
  }

  function enterState(next) {
    if (next === LIVE) {
      network.startQueue(() => dispatch(EVENT.AUTH_REJECTED));
    } else if (next === CATCHING_UP) {
      network.stopQueue();
      network.startSnapshots();
      runCatchUp(entry).catch((err) => console.error('[Kanvana] Sync catch-up failed', err));
    } else if (next === PAUSED) {
      network.stopQueue();
      network.stopSnapshots();
    } else {
      network.stopQueue();
      network.stopSnapshots();
      realtimeStopped = network.stopRealtime().catch((err) => console.error('[Kanvana] Realtime stop failed', err));
    }
  }

  // Subscribe before pulling: an event created after the pull reads the server arrives
  // over SSE, so one pull leaves no gap. The wait is capped because a stuck SSE
  // connection must not hold back the pull.
  async function connectRealtime() {
    const subscribed = network.startRealtime(onRealtimeConnect).then(() => true, (err) => {
      console.error('[Kanvana] Realtime subscribe failed', err);
      return false;
    });
    let timer;
    const timedOut = new Promise((res) => { timer = setTimeout(res, connectWaitMs, null); });
    const result = await Promise.race([subscribed, timedOut]);
    clearTimeout(timer);
    if (result === null) subscribed.then((ok) => { if (ok) onRealtimeConnect(); });
  }

  async function runCatchUp(current) {
    pullStarted = false;
    pullAgain = false;
    await realtimeStopped;
    if (current !== entry) return;
    await connectRealtime();
    if (current !== entry) return;
    do {
      pullStarted = true;
      pullAgain = false;
      try {
        await network.catchUp();
      } catch (err) {
        if (current !== entry) return;
        if (isAuthRejection(err)) { dispatch(EVENT.AUTH_REJECTED); return; }
        // Going live anyway keeps the queue retrying; the next SSE connect pulls again.
        console.error('[Kanvana] Sync catch-up failed', err);
      }
      if (current !== entry) return;
    } while (pullAgain);
    dispatch(EVENT.CATCH_UP_DONE);
  }

  // An SSE connect before the pull starts is covered by that pull, including the
  // initial connect; one after it means the pull may have missed events.
  function onRealtimeConnect() {
    if (state !== CATCHING_UP) { dispatch(EVENT.REALTIME_RECONNECTED); return; }
    if (pullStarted) pullAgain = true;
  }

  async function signIn(id) {
    userId = id;
    signInAttempt += 1;
    const attempt = signInAttempt;
    let allowed = false;
    try {
      allowed = await beforeSignIn(id);
    } catch (err) {
      console.error('[Kanvana] Sign-in check failed', err);
    }
    if (attempt !== signInAttempt || !allowed) return;
    dispatch(isOnline() ? EVENT.SIGNED_IN : EVENT.SIGNED_IN_OFFLINE);
  }

  // PocketBase also reports a token refresh as an auth change, so only a different
  // account is a sign-in. Fresh credentials are what a paused session is waiting for.
  function onAuthChanged() {
    const id = getUserId();
    if (id === userId) {
      if (id && state === PAUSED) dispatch(isOnline() ? EVENT.SIGNED_IN : EVENT.SIGNED_IN_OFFLINE);
      return;
    }
    if (userId) {
      userId = null;
      signInAttempt += 1;
      dispatch(EVENT.SIGNED_OUT);
    }
    if (id) signIn(id);
  }

  // This tab just became sync leader (#222), so nothing has run on the network from here
  // yet. A pull running now went through the old, inert network side, so it starts over.
  // Paused keeps its queue and upload stopped until fresh credentials; realtime stays up.
  function takeOver() {
    if (state === LIVE || state === CATCHING_UP) enter(CATCHING_UP);
    else if (state === PAUSED) runCatchUp(entry).catch((err) => console.error('[Kanvana] Sync catch-up failed', err));
  }

  // Only the leader's pushes can be rejected, so a follower learns of it here, which a
  // later takeover needs. Auth and network state are this tab's own.
  function noteLeaderState(leaderState) {
    if (leaderState === PAUSED) dispatch(EVENT.AUTH_REJECTED);
    else if (leaderState === LIVE && state === PAUSED) dispatch(isOnline() ? EVENT.SIGNED_IN : EVENT.SIGNED_IN_OFFLINE);
  }

  function start() {
    listeners = {
      auth: onAuthChanged,
      online: () => dispatch(EVENT.WENT_ONLINE),
      offline: () => dispatch(EVENT.WENT_OFFLINE),
    };
    window.addEventListener('auth-changed', listeners.auth);
    window.addEventListener('online', listeners.online);
    window.addEventListener('offline', listeners.offline);
    onAuthChanged();
  }

  function dispose() {
    if (!listeners) return;
    window.removeEventListener('auth-changed', listeners.auth);
    window.removeEventListener('online', listeners.online);
    window.removeEventListener('offline', listeners.offline);
    listeners = null;
    signInAttempt += 1;
    entry += 1;
  }

  return { start, dispose, takeOver, noteLeaderState, getState: () => state };
}

let _session = null;
let _leaderState = null; // the leader tab's session state, in a follower tab (#222)

export function initSyncSession(options = {}) {
  if (_session || typeof window === 'undefined') return;
  _session = createSyncSession({
    onStateChange: () => window.dispatchEvent(new CustomEvent(SYNC_STATUS_CHANGED)),
    ...options,
  });
  _session.start();
}

export function getSyncSessionState() {
  const own = _session?.getState() ?? SESSION_STATE.SIGNED_OUT;
  if (!_leaderState || own === SIGNED_OUT || own === OFFLINE) return own;
  return _leaderState;
}

export function takeOverSyncSession() {
  _session?.takeOver();
}

// Null once this tab is the leader itself.
export function setLeaderSessionState(leaderState) {
  _leaderState = leaderState;
  if (leaderState) _session?.noteLeaderState(leaderState);
}

export function _resetSyncSessionForTesting() {
  _session?.dispose();
  _session = null;
  _leaderState = null;
}
