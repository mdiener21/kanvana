// Data Owner (ADR-0006, #221): the account local data belongs to. The sync session runs
// checkDataOwner on every new sign-in, before any network work.
//
// Tabs share the auth store and the database, so every tab's session sees one sign-in. The
// lock lets one tab settle an account switch while the others wait, still signed-out; a tab
// that wiped tells the others to reload. A browser without Web Locks (plain http) runs
// without the lock: hidden tabs still do not prompt, and a wipe in one tab reloads the rest.

import { alertDialog, confirmDialog } from '../dialog.js';
import { claimDataOwner, clearFirstPullPending, closeStore, flushPendingPersists, getDataOwner, getUnsyncedEvents, isFirstPullPending, replaceLocalData } from '../idb-store.js';
import { publishDeferredDefaultBoard } from '../storage.js';
import { getUser, isAuthenticated, logoutUser } from '../sync.js';
import { clearLastUsedProjectId } from '../timetracking-settings.js';
import { flushDomainEvents } from './emitter.js';
import { HLC_NODE_KEY } from './hlc.js';
import { waitForStoppedPull } from './realtime.js';
import { getSyncSessionState, POCKETBASE_NETWORK, SESSION_STATE } from './sync-session.js';

const SWITCH_LOCK = 'kanvana:data-owner-switch';
const WIPE_CHANNEL = 'kanvana:data-owner-wipe';
// The HLC node id identifies this browser, not an account. Theme and other display
// preferences live in localStorage and stay too; everything else in the database goes.
const KV_KEYS_KEPT_ON_WIPE = [HLC_NODE_KEY];
const WAIT_UNTIL_VISIBLE = 'wait-until-visible';

let _reload = () => window.location.reload();
let _channel = null;
let _reloading = false;

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

// A false result keeps the session signed-out; after a wipe the page is reloading, and the
// new page finds the signed-in account already the Data Owner.
export async function checkDataOwner(userId) {
  try {
    if (await claimDataOwner(userId) === userId) return true;
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

async function settleFirstPull() {
  if (!await isFirstPullPending()) return;
  await publishDeferredDefaultBoard();
  await flushLocalWrites();
  await clearFirstPullPending();
}

// The network side only the leader tab runs (#222), because a follower's session goes live
// on a pull that did nothing. A pull that failed, or that a stop cut short, leaves the first
// pull pending: only a finished one shows what the new owner's account holds.
export function createNetworkSettlingFirstPull(network = POCKETBASE_NETWORK) {
  return {
    ...network,
    catchUp: async () => {
      await network.catchUp();
      if (getSyncSessionState() === SESSION_STATE.CATCHING_UP) await settleFirstPull();
    },
  };
}

export function _setReloadForTesting(reload) {
  _reload = reload;
}

export function _resetDataOwnerForTesting() {
  _channel?.close();
  _channel = null;
  _reloading = false;
  _reload = () => window.location.reload();
}
