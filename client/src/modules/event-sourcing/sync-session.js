// Sync session (#219): the one owner of the sync lifecycle, and the only module reacting to auth, online and offline.

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
  PAUSED_OFFLINE: 'paused-offline',
});

const EVENT = Object.freeze({
  SIGNED_IN: 'signed-in',
  SIGNED_IN_OFFLINE: 'signed-in-offline',
  SIGNED_OUT: 'signed-out',
  WENT_ONLINE: 'went-online',
  WENT_OFFLINE: 'went-offline',
  CATCH_UP_DONE: 'catch-up-done',
  REALTIME_RECONNECTED: 'realtime-reconnected',
  AUTH_REJECTED: 'auth-rejected',
});

const { SIGNED_OUT, CATCHING_UP, LIVE, OFFLINE, PAUSED, PAUSED_OFFLINE } = SESSION_STATE;

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
    [EVENT.WENT_OFFLINE]: PAUSED_OFFLINE,
  },
  // Only re-authentication ends a pause, so the network coming back returns it to paused (AC-005).
  [PAUSED_OFFLINE]: {
    [EVENT.SIGNED_IN]: CATCHING_UP,
    [EVENT.SIGNED_IN_OFFLINE]: OFFLINE,
    [EVENT.SIGNED_OUT]: SIGNED_OUT,
    [EVENT.WENT_ONLINE]: PAUSED,
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

// beforeSignIn runs on every new sign-in before any network work; until it resolves true the session stays signed-out (#221).
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
  let stateVersion = 0; // bumped on every state change, so async work can tell it is stale
  let realtimeStopped = Promise.resolve();
  let pullStarted = false;
  let pullAgain = false;
  let connectAttempt = 0;
  let subscribing = false;
  let listeners = null;

  const signedInEvent = () => (isOnline() ? EVENT.SIGNED_IN : EVENT.SIGNED_IN_OFFLINE);
  const isPaused = () => state === PAUSED || state === PAUSED_OFFLINE;

  function dispatch(event) {
    const next = transitionSession(state, event);
    if (next !== state) enter(next);
  }

  function enter(next) {
    const previous = state;
    state = next;
    stateVersion += 1;
    enterState(next, previous);
    onStateChange(next);
  }

  function enterState(next, previous) {
    if (next === LIVE) {
      network.startQueue(() => dispatch(EVENT.AUTH_REJECTED));
    } else if (next === CATCHING_UP) {
      network.stopQueue();
      network.startSnapshots();
      runCatchUp(stateVersion).catch((err) => console.error('[Kanvana] Sync catch-up failed', err));
    } else if (next === PAUSED) {
      network.stopQueue();
      network.stopSnapshots();
      // Going offline stopped realtime; a paused session holds it, and one pull, as after a takeover.
      if (previous === PAUSED_OFFLINE) runCatchUp(stateVersion).catch((err) => console.error('[Kanvana] Sync catch-up failed', err));
    } else {
      network.stopQueue();
      network.stopSnapshots();
      realtimeStopped = network.stopRealtime().catch((err) => console.error('[Kanvana] Realtime stop failed', err));
    }
  }

  // Subscribe before pulling, so one pull leaves no gap; a stuck SSE must not hold the pull back.
  async function connectRealtime() {
    connectAttempt += 1;
    const attempt = connectAttempt;
    subscribing = true;
    const subscribed = network.startRealtime(onRealtimeConnect).then(() => true, (err) => {
      console.error('[Kanvana] Realtime subscribe failed', err);
      return false;
    }).finally(() => {
      if (attempt === connectAttempt) subscribing = false;
    });
    let timer;
    const timedOut = new Promise((res) => { timer = setTimeout(res, connectWaitMs, null); });
    const result = await Promise.race([subscribed, timedOut]);
    clearTimeout(timer);
    if (result === null) subscribed.then((ok) => { if (ok && attempt === connectAttempt) onLateConnection(); });
  }

  // The pull that ran before the subscription came up may have missed events (#219).
  function onLateConnection() {
    if (state === CATCHING_UP) {
      if (pullStarted) pullAgain = true;
    } else if (state === LIVE) {
      const current = stateVersion;
      network.catchUp().catch((err) => {
        if (current !== stateVersion) return;
        if (isAuthRejection(err)) dispatch(EVENT.AUTH_REJECTED);
        else console.error('[Kanvana] Sync catch-up failed', err);
      });
    }
  }

  async function runCatchUp(current) {
    pullStarted = false;
    pullAgain = false;
    await realtimeStopped;
    if (current !== stateVersion) return;
    await connectRealtime();
    if (current !== stateVersion) return;
    do {
      pullStarted = true;
      pullAgain = false;
      try {
        await network.catchUp();
      } catch (err) {
        if (current !== stateVersion) return;
        if (isAuthRejection(err)) { dispatch(EVENT.AUTH_REJECTED); return; }
        // Going live anyway keeps the queue retrying; the next SSE connect pulls again.
        console.error('[Kanvana] Sync catch-up failed', err);
      }
      if (current !== stateVersion) return;
    } while (pullAgain);
    dispatch(EVENT.CATCH_UP_DONE);
  }

  // The subscription's first connect is settled by connectRealtime, so only reconnects get here.
  function onRealtimeConnect() {
    if (subscribing) return;
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
    dispatch(signedInEvent());
  }

  // PocketBase also reports a token refresh as an auth change; fresh credentials are what a paused session waits for.
  function onAuthChanged() {
    const id = getUserId();
    if (id === userId) {
      if (id && isPaused()) dispatch(signedInEvent());
      return;
    }
    if (userId) {
      userId = null;
      signInAttempt += 1;
      dispatch(EVENT.SIGNED_OUT);
    }
    if (id) signIn(id);
  }

  // Just became leader (#222): a running pull went through the old, inert network side, so it starts over.
  function takeOver() {
    if (state === LIVE || state === CATCHING_UP) enter(CATCHING_UP);
    else if (state === PAUSED) runCatchUp(stateVersion).catch((err) => console.error('[Kanvana] Sync catch-up failed', err));
  }

  // Only the leader's pushes can be rejected, and a later takeover here needs to know.
  function noteLeaderState(leaderState) {
    if (leaderState === PAUSED || leaderState === PAUSED_OFFLINE) dispatch(EVENT.AUTH_REJECTED);
    else if (leaderState === LIVE && isPaused()) dispatch(signedInEvent());
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
    stateVersion += 1;
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
  if (!_leaderState || own === SIGNED_OUT || own === OFFLINE || own === PAUSED_OFFLINE) return own;
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
