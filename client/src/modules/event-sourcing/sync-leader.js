// Sync leader (#222): only the holder of a Web Lock runs the session's network side; tabs follow it over a BroadcastChannel.

import { BOARD_SETTINGS_WRITTEN, EVENTS_STORED, PEER_SYNC_CHANGED, SNAPSHOT_ADOPTED, emit, off, on } from '../events.js';
import { flushPendingPersists } from '../idb-store.js';
import { refreshBoardSettings } from '../storage.js';
import { ingestMissedEvents, ingestStoredEvents, rebuildAfterPeerAdoption } from './ingest.js';
import { setAfterSnapshotSaved } from './snapshot.js';
import { isSyncQueueRetrying, scheduleDrain, setPeerRetrying, SYNC_STATUS_CHANGED } from './sync-queue.js';
import { getSyncSessionState, POCKETBASE_NETWORK, SESSION_STATE, setLeaderSessionState, takeOverSyncSession } from './sync-session.js';

const LOCK_NAME = 'kanvana:sync-leader';
const CHANNEL_NAME = 'kanvana:sync';

const MESSAGE = Object.freeze({
  EVENTS_STORED: 'events-stored',
  BOARD_SETTINGS_WRITTEN: 'board-settings-written',
  SNAPSHOT_ADOPTED: 'snapshot-adopted',
  SNAPSHOT_SAVED: 'snapshot-saved',
  STATUS: 'status',
  STATUS_REQUEST: 'status-request',
});

let _realNetwork = null;
let _gatedNetwork = null;
let _channel = null;
let _elected = false; // false: no Web Locks or no channel, so this tab acts alone
let _isLeader = false;
let _booted = false;
let _steppedDown = false;
let _queuedLockRequest = null;
let _release = null;
let _lifecycle = null;
const _peerEventIds = new Set();
let _applyingPeerEvents = false;

function post(message) {
  _channel?.postMessage(message);
}

function postStatus() {
  if (!_isLeader) return;
  post({ type: MESSAGE.STATUS, session: getSyncSessionState(), retrying: isSyncQueueRetrying() });
}

function logFailure(what) {
  return (err) => console.error(`[Kanvana] ${what} failed`, err);
}

function announceSavedSnapshots() {
  setAfterSnapshotSaved((key) => post({ type: MESSAGE.SNAPSHOT_SAVED, key }));
}

function createGatedNetwork(real) {
  const whenLeader = (command) => (...args) => (_isLeader ? real[command](...args) : Promise.resolve());
  return {
    startRealtime: whenLeader('startRealtime'),
    stopRealtime: whenLeader('stopRealtime'),
    catchUp: whenLeader('catchUp'),
    startQueue: whenLeader('startQueue'),
    stopQueue: whenLeader('stopQueue'),
    // A snapshot saved in a follower is the leader's to upload: the leader then finds none due and saves none of its own.
    startSnapshots: () => {
      if (_isLeader) real.startSnapshots();
      else announceSavedSnapshots();
    },
    stopSnapshots: () => {
      if (_isLeader) real.stopSnapshots();
      else setAfterSnapshotSaved(null);
    },
  };
}

function onEventsStored({ detail: { ids, local } }) {
  post({ type: MESSAGE.EVENTS_STORED, ids, local });
  emit(PEER_SYNC_CHANGED);
}

function onSnapshotAdopted({ detail: { key, forgotten } }) {
  post({ type: MESSAGE.SNAPSHOT_ADOPTED, key, forgotten });
}

// The others re-read the settings, so they must be stored first.
function onBoardSettingsWritten({ detail: { boardId } }) {
  flushPendingPersists()
    .then(() => post({ type: MESSAGE.BOARD_SETTINGS_WRITTEN, boardId }))
    .catch(logFailure('Announcing board settings'));
}

// Notices arriving while a batch folds join the next one, so a burst renders only a few times.
async function applyPeerEvents() {
  if (_applyingPeerEvents) return;
  _applyingPeerEvents = true;
  try {
    while (_peerEventIds.size) {
      const ids = [..._peerEventIds];
      _peerEventIds.clear();
      await ingestStoredEvents(ids);
    }
  } catch (err) {
    logFailure('Applying another tab\'s events')(err);
  } finally {
    _applyingPeerEvents = false;
  }
  emit(PEER_SYNC_CHANGED);
}

const HANDLERS = {
  [MESSAGE.EVENTS_STORED]: ({ ids, local }) => {
    ids.forEach((id) => _peerEventIds.add(id));
    applyPeerEvents();
    if (_elected && _isLeader && local) scheduleDrain();
  },
  [MESSAGE.BOARD_SETTINGS_WRITTEN]: ({ boardId }) => {
    refreshBoardSettings(boardId).catch(logFailure('Reading board settings'));
  },
  [MESSAGE.SNAPSHOT_ADOPTED]: ({ key, forgotten }) => {
    rebuildAfterPeerAdoption(key, forgotten).catch(logFailure('Rebuilding after another tab\'s snapshot'));
  },
  [MESSAGE.SNAPSHOT_SAVED]: ({ key }) => {
    if (_elected && _isLeader) _realNetwork.uploadStoredSnapshot(key).catch(logFailure('Snapshot upload'));
  },
  [MESSAGE.STATUS]: ({ session, retrying }) => {
    // With no election every tab leads, but the queue depth they show is shared.
    if (!_isLeader) {
      setLeaderSessionState(session);
      setPeerRetrying(retrying);
    }
    emit(PEER_SYNC_CHANGED);
  },
  [MESSAGE.STATUS_REQUEST]: postStatus,
};

function holdLock() {
  return new Promise((resolve) => { _release = resolve; });
}

async function becomeLeader() {
  if (!_booted) {
    _isLeader = true;
    return;
  }
  await ingestMissedEvents().catch(logFailure('Reading missed events'));
  if (!_release) return;
  _isLeader = true;
  setLeaderSessionState(null);
  setPeerRetrying(false);
  takeOverSyncSession();
  postStatus();
  emit(PEER_SYNC_CHANGED);
}

function becomeFollower() {
  _isLeader = false;
  // A leader stepping down stopped the upload, and a thawed session stays live so never restarts it.
  const session = getSyncSessionState();
  if (session === SESSION_STATE.LIVE || session === SESSION_STATE.CATCHING_UP) announceSavedSnapshots();
  post({ type: MESSAGE.STATUS_REQUEST });
  ingestMissedEvents().catch(logFailure('Reading missed events'));
  _queuedLockRequest = new AbortController();
  navigator.locks.request(LOCK_NAME, { signal: _queuedLockRequest.signal }, () => {
    const held = holdLock();
    becomeLeader();
    return held;
  }).catch((err) => {
    if (err?.name !== 'AbortError') logFailure('Sync leader lock')(err);
  });
}

// Settles when the role is known, not when the lock is released.
function claimLock() {
  return new Promise((roleKnown, failed) => {
    navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) {
        becomeFollower();
        roleKnown();
        return undefined;
      }
      const held = holdLock();
      becomeLeader();
      roleKnown();
      return held;
    }).catch(failed);
  });
}

// A frozen tab would hold the lock with its timers and sockets dead, and a queued request could be granted while frozen.
function stepDown() {
  if (_steppedDown) return;
  _steppedDown = true;
  _queuedLockRequest?.abort();
  if (_isLeader) {
    _isLeader = false;
    _realNetwork.stopQueue();
    _realNetwork.stopSnapshots();
    _realNetwork.stopRealtime().catch(logFailure('Realtime stop'));
  }
  _release?.();
  _release = null;
}

function rejoin() {
  if (!_steppedDown) return;
  _steppedDown = false;
  claimLock().catch(logFailure('Sync leader lock'));
}

function listenToLifecycle() {
  _lifecycle = {
    pagehide: (event) => { if (event.persisted) stepDown(); },
    pageshow: (event) => { if (event.persisted) rejoin(); },
  };
  document.addEventListener('freeze', stepDown);
  document.addEventListener('resume', rejoin);
  window.addEventListener('pagehide', _lifecycle.pagehide);
  window.addEventListener('pageshow', _lifecycle.pageshow);
}

// Resolves once this tab knows its role, and returns the network side for its session.
export async function initSyncLeader({ network = POCKETBASE_NETWORK } = {}) {
  if (_gatedNetwork) return _gatedNetwork;
  _realNetwork = network;
  _gatedNetwork = createGatedNetwork(network);

  if (typeof BroadcastChannel !== 'undefined') {
    _channel = new BroadcastChannel(CHANNEL_NAME);
    _channel.onmessage = ({ data }) => HANDLERS[data?.type]?.(data);
    on(EVENTS_STORED, onEventsStored);
    on(SNAPSHOT_ADOPTED, onSnapshotAdopted);
    on(BOARD_SETTINGS_WRITTEN, onBoardSettingsWritten);
  }
  window.addEventListener(SYNC_STATUS_CHANGED, postStatus);

  _elected = Boolean(_channel && navigator.locks);
  if (_elected) {
    try {
      await claimLock();
      listenToLifecycle();
    } catch (err) {
      logFailure('Sync leader lock')(err);
      _elected = false;
    }
  }
  if (!_elected) _isLeader = true;
  _booted = true;
  return _gatedNetwork;
}

export function _resetSyncLeaderForTesting() {
  _queuedLockRequest?.abort();
  _release?.();
  _channel?.close();
  off(EVENTS_STORED, onEventsStored);
  off(SNAPSHOT_ADOPTED, onSnapshotAdopted);
  off(BOARD_SETTINGS_WRITTEN, onBoardSettingsWritten);
  window.removeEventListener(SYNC_STATUS_CHANGED, postStatus);
  if (_lifecycle) {
    document.removeEventListener('freeze', stepDown);
    document.removeEventListener('resume', rejoin);
    window.removeEventListener('pagehide', _lifecycle.pagehide);
    window.removeEventListener('pageshow', _lifecycle.pageshow);
  }
  _realNetwork = null;
  _gatedNetwork = null;
  _channel = null;
  _elected = false;
  _isLeader = false;
  _booted = false;
  _steppedDown = false;
  _queuedLockRequest = null;
  _release = null;
  _lifecycle = null;
  _peerEventIds.clear();
  _applyingPeerEvents = false;
}
