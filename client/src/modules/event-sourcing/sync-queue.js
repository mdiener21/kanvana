// Outbound event push queue (issue #112, PRD §4.8/§5.3).
// Drains IDB events where synced=false in HLC order, up to MAX_IN_FLIGHT in
// parallel, and flips synced=true on success. Never rolls back local state:
// a PB rejection leaves the event queued for a tiered retry.

import { EVENT_EMITTED, off, on } from '../events.js';
import { getPb, isAuthenticated, getUser } from '../sync.js';
import { getDataOwner, getUnsyncedEvents, markEventSynced } from '../idb-store.js';
import { compareHlc } from './hlc.js';

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_MAX_IN_FLIGHT = 5;
const DEFAULT_BACKOFF_MS = [5000, 30000, 120000, 300000];
const PERMANENT_RETRY_MS = 60 * 60 * 1000;
export const SYNC_STATUS_CHANGED = 'sync:status-changed';

let _debounceMs = DEFAULT_DEBOUNCE_MS;
let _maxInFlight = DEFAULT_MAX_IN_FLIGHT;
let _backoff = DEFAULT_BACKOFF_MS;
let _schedule = (ms, fn) => setTimeout(fn, ms);

let _debounceTimer = null;
let _retryTimer = null;
let _draining = false;
let _running = false;
let _generation = 0; // bumped on stop, so a drain in flight can tell it was stopped
let _drainRequested = false;
let _onAuthRejected = null;
let _retryIndex = 0;
let _emittedHandler = null;
let _inFlightDrain = null;
let _retrying = false;
let _peerRetrying = false; // the leader tab's, in a follower tab (#222)

function notifySyncStatusChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_STATUS_CHANGED));
  }
}

export function initSyncQueue() {
  if (_emittedHandler || typeof window === 'undefined') return;
  _emittedHandler = () => scheduleDrain();
  on(EVENT_EMITTED, _emittedHandler);
}

// The session decides when the queue runs; a 401/403 push stops the queue, then fires onAuthRejected.
export function startSyncQueue({ onAuthRejected } = {}) {
  _running = true;
  _onAuthRejected = onAuthRejected ?? null;
}

export function stopSyncQueue() {
  _running = false;
  _generation += 1;
  if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  _retryIndex = 0;
  _retrying = false;
  notifySyncStatusChanged();
}

export function scheduleDrain() {
  if (!_running) return;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => { _debounceTimer = null; drain(); }, _debounceMs);
}

export function drainSyncQueue() {
  if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  return drain();
}

// The server holds a unique index on (owner, local_id) (#217). PocketBase 0.40
// rejects a second create of the same event with a 400 whose field errors are
// all `validation_not_unique`, including one on local_id. Any other 400 is a
// real rejection.
function isDuplicateEventError(err) {
  const status = err?.status ?? err?.response?.status ?? 0;
  if (status !== 400) return false;
  const fields = err?.response?.data;
  if (!fields || typeof fields !== 'object') return false;
  if (fields.local_id?.code !== 'validation_not_unique') return false;
  return Object.values(fields).every((f) => f?.code === 'validation_not_unique');
}

function classifyError(err) {
  const status = err?.status ?? err?.response?.status ?? 0;
  if (isDuplicateEventError(err)) return 'duplicate';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 400 && status < 500) return 'permanent';
  return 'network';
}

async function pushEvent(pb, ownerId, event) {
  // requestKey: null opts out of PocketBase auto-cancellation — otherwise
  // concurrent creates to the same path abort each other.
  await pb.collection('events').create({
    owner: ownerId,
    board: event.board_id || null,
    event_type: event.type,
    at: event.at,
    actor_type: event.actor?.type ?? 'human',
    actor_id: event.actor?.id ?? null,
    payload: event.payload ?? {},
    local_id: event.id,
    hlc: event.hlc,
    scope: event.scope ?? 'board',
    entity_id: event.entity_id ?? '',
  }, { requestKey: null });
}

function nextBackoff() {
  const ms = _backoff[Math.min(_retryIndex, _backoff.length - 1)];
  _retryIndex += 1;
  return ms;
}

function scheduleRetry(ms) {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retrying = true;
  notifySyncStatusChanged();
  _retryTimer = _schedule(ms, () => { _retryTimer = null; drain(); });
}

function drain() {
  if (!_running || !isAuthenticated()) return _inFlightDrain || Promise.resolve();
  if (_draining) {
    // That drain read its list earlier, and may be one that was stopped.
    _drainRequested = true;
    return _inFlightDrain;
  }
  _draining = true;
  notifySyncStatusChanged();
  _inFlightDrain = runDrain().finally(() => {
    _draining = false;
    notifySyncStatusChanged();
    if (_drainRequested) {
      _drainRequested = false;
      drain();
    }
  });
  return _inFlightDrain;
}

async function runDrain() {
  const generation = _generation;
  const stopped = () => generation !== _generation;
  const pb = getPb();
  // Events belong to the Data Owner, whoever is signed in by now; another tab can change the auth store mid-drain (ADR-0006).
  const [ownerId, unsynced] = await Promise.all([getDataOwner(), getUnsyncedEvents()]);
  const accountChanged = () => !ownerId || getUser()?.id !== ownerId;
  const events = unsynced.sort((a, b) => compareHlc(a.hlc, b.hlc));
  if (stopped() || accountChanged()) return;
  if (events.length === 0) { _retryIndex = 0; _retrying = false; return; }
  _retrying = false;

  let cursor = 0;
  let authFailure = false;
  let failure = null; // 'network' | 'permanent'

  async function worker() {
    while (cursor < events.length && !authFailure && !stopped() && !accountChanged()) {
      const event = events[cursor++];
      try {
        await pushEvent(pb, ownerId, event);
        await markEventSynced(event.id);
      } catch (err) {
        const kind = classifyError(err);
        // The server already holds this event: it is synced.
        if (kind === 'duplicate') await markEventSynced(event.id);
        else if (kind === 'auth') authFailure = true;
        else failure = kind;
        // R-A: never roll back; leave the event unsynced for retry.
      }
    }
  }

  const workers = Math.min(_maxInFlight, events.length);
  await Promise.all(Array.from({ length: workers }, worker));

  if (stopped()) return;
  if (authFailure) {
    stopSyncQueue();
    _onAuthRejected?.();
    return;
  }
  if (failure === 'network') scheduleRetry(nextBackoff());
  else if (failure === 'permanent') scheduleRetry(PERMANENT_RETRY_MS);
  else { _retryIndex = 0; _retrying = false; }
}

export function _resetSyncQueueForTesting() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  if (_retryTimer) clearTimeout(_retryTimer);
  if (_emittedHandler) off(EVENT_EMITTED, _emittedHandler);
  _debounceTimer = null;
  _retryTimer = null;
  _draining = false;
  _running = false;
  _generation += 1;
  _drainRequested = false;
  _onAuthRejected = null;
  _retryIndex = 0;
  _retrying = false;
  _peerRetrying = false;
  _emittedHandler = null;
  _debounceMs = DEFAULT_DEBOUNCE_MS;
  _maxInFlight = DEFAULT_MAX_IN_FLIGHT;
  _backoff = DEFAULT_BACKOFF_MS;
  _schedule = (ms, fn) => setTimeout(fn, ms);
}

export function _setTimingForTesting({ debounceMs, maxInFlight, backoff, schedule } = {}) {
  if (Number.isFinite(debounceMs)) _debounceMs = debounceMs;
  if (Number.isFinite(maxInFlight)) _maxInFlight = maxInFlight;
  if (Array.isArray(backoff)) _backoff = backoff;
  if (typeof schedule === 'function') _schedule = schedule;
}

// Public snapshot of queue health for the header sync indicator (#115).
// depth = events still unsynced; retrying = network/5xx backoff in progress.
export async function getSyncStatus() {
  const depth = (await getUnsyncedEvents()).length;
  return { depth, retrying: _retrying || _peerRetrying };
}

export function isSyncQueueRetrying() {
  return _retrying;
}

export function setPeerRetrying(retrying) {
  _peerRetrying = retrying;
}

export async function _settleForTesting() {
  try { await _inFlightDrain; } catch { /* drain failures are handled internally */ }
}
