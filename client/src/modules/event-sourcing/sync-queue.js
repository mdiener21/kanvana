// Outbound event push queue (issue #112, PRD §4.8/§5.3).
// Drains IDB events where synced=false in HLC order, up to MAX_IN_FLIGHT in
// parallel, and flips synced=true on success. Never rolls back local state:
// a PB rejection leaves the event queued for a tiered retry.

import { EVENT_EMITTED, on } from '../events.js';
import { getPb, isAuthenticated, getUser } from '../sync.js';
import { getUnsyncedEvents, markEventSynced } from '../idb-store.js';
import { compareHlc } from './hlc.js';

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_MAX_IN_FLIGHT = 5;
const DEFAULT_BACKOFF_MS = [5000, 30000, 120000, 300000];
const PERMANENT_RETRY_MS = 60 * 60 * 1000;

let _debounceMs = DEFAULT_DEBOUNCE_MS;
let _maxInFlight = DEFAULT_MAX_IN_FLIGHT;
let _backoff = DEFAULT_BACKOFF_MS;
let _schedule = (ms, fn) => setTimeout(fn, ms);

let _debounceTimer = null;
let _retryTimer = null;
let _draining = false;
let _paused = false;
let _retryIndex = 0;
let _initialized = false;
let _handlers = null;
let _inFlightDrain = null;

export function initSyncQueue() {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;
  _handlers = {
    emitted: () => scheduleDrain(),
    online: () => drainNow(),
    auth: () => { if (_paused) { _paused = false; drainNow(); } },
  };
  on(EVENT_EMITTED, _handlers.emitted);
  window.addEventListener('online', _handlers.online);
  window.addEventListener('auth-changed', _handlers.auth);
}

export function scheduleDrain() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => { _debounceTimer = null; drain(); }, _debounceMs);
}

function drainNow() {
  if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  drain();
}

function classifyError(err) {
  const status = err?.status ?? err?.response?.status ?? 0;
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
  _retryTimer = _schedule(ms, () => { _retryTimer = null; drain(); });
}

function drain() {
  if (_draining || _paused || !isAuthenticated()) return _inFlightDrain || Promise.resolve();
  _draining = true;
  _inFlightDrain = runDrain().finally(() => { _draining = false; });
  return _inFlightDrain;
}

async function runDrain() {
  const pb = getPb();
  const ownerId = getUser()?.id;
  const events = (await getUnsyncedEvents()).sort((a, b) => compareHlc(a.hlc, b.hlc));
  if (events.length === 0) { _retryIndex = 0; return; }

  let cursor = 0;
  let authFailure = false;
  let failure = null; // 'network' | 'permanent'

  async function worker() {
    while (cursor < events.length && !authFailure) {
      const event = events[cursor++];
      try {
        await pushEvent(pb, ownerId, event);
        await markEventSynced(event.id);
      } catch (err) {
        const kind = classifyError(err);
        if (kind === 'auth') authFailure = true;
        else failure = kind;
        // R-A: never roll back; leave the event unsynced for retry.
      }
    }
  }

  const workers = Math.min(_maxInFlight, events.length);
  await Promise.all(Array.from({ length: workers }, worker));

  if (authFailure) { _paused = true; return; }
  if (failure === 'network') scheduleRetry(nextBackoff());
  else if (failure === 'permanent') scheduleRetry(PERMANENT_RETRY_MS);
  else _retryIndex = 0;
}

export function _resetSyncQueueForTesting() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  if (_retryTimer) clearTimeout(_retryTimer);
  if (_initialized && _handlers && typeof window !== 'undefined') {
    window.removeEventListener('online', _handlers.online);
    window.removeEventListener('auth-changed', _handlers.auth);
  }
  _debounceTimer = null;
  _retryTimer = null;
  _draining = false;
  _paused = false;
  _retryIndex = 0;
  _initialized = false;
  _handlers = null;
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

export function _isPausedForTesting() {
  return _paused;
}

// Public snapshot of queue health for the header sync indicator (#115).
// depth = events still unsynced; retrying = network/5xx backoff in progress;
// paused = drain halted on auth failure.
export async function getSyncStatus() {
  const depth = (await getUnsyncedEvents()).length;
  return { depth, retrying: _retryIndex > 0, paused: _paused };
}

export async function _settleForTesting() {
  try { await _inFlightDrain; } catch { /* drain failures are handled internally */ }
}
