// Data Owner (ADR-0006, #221): the account local data belongs to. The sync session runs
// checkDataOwner on every new sign-in, before any network work.
//
// Tabs share the auth store and the database, so every tab's session sees one sign-in. The
// lock lets one tab settle an account switch while the others wait, still signed-out; a tab
// that wiped tells the others to reload. A browser without Web Locks (plain http) runs
// without the locks: hidden tabs still do not prompt, and a wipe in one tab reloads the rest.

import { alertDialog, confirmDialog } from '../dialog.js';
import { claimDataOwner, clearFirstPullPending, closeStore, flushPendingPersists, getDataOwner, getUnsyncedEvents, isFirstPullPending, replaceLocalData } from '../idb-store.js';
import { publishDeferredDefaultBoard } from '../storage.js';
import { getUser, isAuthenticated, logoutUser } from '../sync.js';
import { clearLastUsedProjectId } from '../timetracking-settings.js';
import { flushDomainEvents } from './emitter.js';
import { HLC_NODE_KEY } from './hlc.js';
import { waitForStoppedPull } from './realtime.js';
import { getSyncSessionState, SESSION_STATE } from './sync-session.js';
import { SYNC_STATUS_CHANGED } from './sync-queue.js';

const SWITCH_LOCK = 'kanvana:data-owner-switch';
const FIRST_PULL_LOCK = 'kanvana:data-owner-first-pull';
const WIPE_CHANNEL = 'kanvana:data-owner-wipe';
// The HLC node id identifies this browser, not an account. Theme and other display
// preferences live in localStorage and stay too; everything else in the database goes.
const KV_KEYS_KEPT_ON_WIPE = [HLC_NODE_KEY];
const WAIT_UNTIL_VISIBLE = 'wait-until-visible';

let _reload = () => window.location.reload();
let _channel = null;
let _reloading = false;
let _endFirstPull = null; // set while this tab holds the first-pull lock
let _firstPullSettled = false;

function reloadPage() {
  _reloading = true;
  closeStore();
  _reload();
}

function signedInUserId() {
  return isAuthenticated() ? getUser()?.id ?? null : null;
}

// Called before storage loads, so a wipe during the load still reaches this page.
export function listenForDataOwnerWipe() {
  if (_channel || typeof BroadcastChannel === 'undefined') return;
  _channel = new BroadcastChannel(WIPE_CHANNEL);
  _channel.onmessage = () => reloadPage();
}

function withSwitchLock(work) {
  return navigator.locks ? navigator.locks.request(SWITCH_LOCK, work) : work();
}

function whenVisible() {
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', onChange);
      resolve();
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

async function flushLocalWrites() {
  await flushDomainEvents();
  await flushPendingPersists();
}

function changesLabel(count) {
  return `${count} unsynced ${count === 1 ? 'change' : 'changes'}`;
}

function askToDiscard(count) {
  const name = getUser()?.email || getUser()?.name || 'this account';
  return confirmDialog({
    title: 'Discard unsynced changes?',
    message: `This browser holds ${changesLabel(count)} from the account that used it last. They have not reached the server. Continuing as ${name} permanently deletes them. Cancel signs you out and keeps them, so that account can sign in and send them.`,
    confirmText: `Discard ${changesLabel(count)} and continue`,
    cancelText: 'Cancel',
    destructive: true,
  });
}

async function settleAccountSwitch(userId) {
  if (signedInUserId() !== userId) return false;
  // Another tab wiped while this one waited, and this page still holds the old data.
  if (await getDataOwner() === userId) {
    reloadPage();
    return false;
  }
  await waitForStoppedPull();
  await flushLocalWrites();
  let unsynced = (await getUnsyncedEvents()).length;
  let result = { replaced: false };
  while (!result.replaced) {
    if (unsynced > 0) {
      // A prompt in a tab the user is not looking at would leave them waiting on nothing.
      if (document.visibilityState === 'hidden') return WAIT_UNTIL_VISIBLE;
      const discard = await askToDiscard(unsynced);
      if (signedInUserId() !== userId) return false;
      if (!discard) {
        logoutUser();
        return false;
      }
    }
    clearLastUsedProjectId();
    await flushLocalWrites();
    result = await replaceLocalData({ ownerId: userId, maxUnsynced: unsynced, keepKvKeys: KV_KEYS_KEPT_ON_WIPE });
    unsynced = result.unsynced; // another tab queued more than was agreed to: ask again
  }
  _channel?.postMessage('wiped');
  reloadPage();
  return false;
}

// After a wipe every tab starts empty. Two pulling at once would lose events: a remote event
// the other tab stored first is skipped, so this tab never projects it and then saves a board
// list without it. So one tab pulls, and the others wait and load the result from storage.
// The lock outlives a tab that dies, and the pending mark lets the next tab take over.
function takeFirstPull(userId) {
  if (!navigator.locks || _endFirstPull) return true;
  return new Promise((resolve, reject) => {
    navigator.locks.request(FIRST_PULL_LOCK, async () => {
      if (signedInUserId() !== userId) { resolve(false); return; }
      if (!await isFirstPullPending()) {
        reloadPage();
        resolve(false);
        return;
      }
      await new Promise((end) => {
        _endFirstPull = end;
        resolve(true);
      });
    }).catch(reject);
  });
}

// A false result keeps the session signed-out; after a wipe the page is reloading, and the
// new page finds the signed-in account already the Data Owner.
export async function checkDataOwner(userId) {
  try {
    if (await claimDataOwner(userId) === userId) {
      return await isFirstPullPending() ? await takeFirstPull(userId) : true;
    }
    for (;;) {
      const outcome = await withSwitchLock(() => settleAccountSwitch(userId));
      if (outcome !== WAIT_UNTIL_VISIBLE) return outcome;
      await whenVisible();
    }
  } catch (err) {
    // Reloading closed the connection under this check. The auth store is shared, so
    // treating that as a failure would sign the new account out of every tab.
    if (_reloading) return false;
    console.error('[Kanvana] Could not switch account', err);
    if (signedInUserId() === userId) logoutUser();
    await alertDialog({
      title: 'Could not switch account',
      message: 'This browser could not prepare its local data for that account, so you have been signed out. Nothing was changed. Try signing in again.',
    });
    return false;
  }
}

// A waiting tab reloads when the lock is released, so all of this is saved by then.
async function settleFirstPull() {
  if (_firstPullSettled) return;
  _firstPullSettled = true;
  if (!await isFirstPullPending()) return;
  await publishDeferredDefaultBoard();
  await flushLocalWrites();
  await clearFirstPullPending();
  _endFirstPull?.();
}

// Going live means the session's first catch-up is over, whatever it found.
export function initDataOwnerAfterCatchUp() {
  window.addEventListener(SYNC_STATUS_CHANGED, () => {
    if (getSyncSessionState() !== SESSION_STATE.LIVE) return;
    settleFirstPull().catch((err) => console.error('[Kanvana] Finishing the first catch-up failed', err));
  });
}

export function _setReloadForTesting(reload) {
  _reload = reload;
}

export function _resetDataOwnerForTesting() {
  _channel?.close();
  _channel = null;
  _reloading = false;
  _endFirstPull?.();
  _endFirstPull = null;
  _firstPullSettled = false;
  _reload = () => window.location.reload();
}
