import { setupModalCloseHandlers } from './modals.js';
import { $id } from './dom.js';

let currentResolver = null;
const waitingDialogs = [];

function closeDialog(result) {
  const modal = $id('dialog-modal');
  if (modal) modal.classList.add('hidden');

  const resolve = currentResolver;
  currentResolver = null;
  if (typeof resolve === 'function') resolve(Boolean(result));
  waitingDialogs.shift()?.();
}

// Opening over an open dialog would orphan its promise. A sync prompt waits on its answer,
// so a boot-time alert (the health probe) must not be able to replace it (#221).
function openDialog(show) {
  ensureDialogHandlers();
  if (currentResolver) waitingDialogs.push(show);
  else show();
}

function isDialogOpen() {
  const modal = $id('dialog-modal');
  return modal && !modal.classList.contains('hidden');
}

function setDialog({ title, message, confirmText, cancelText, showCancel, destructive = false }) {
  const titleEl = $id('dialog-modal-title');
  const messageEl = $id('dialog-modal-message');
  const confirmBtn = $id('dialog-confirm-btn');
  const cancelBtn = $id('dialog-cancel-btn');

  if (titleEl) titleEl.textContent = title || 'Confirm';
  if (messageEl) messageEl.textContent = message || '';
  if (confirmBtn) confirmBtn.textContent = confirmText || 'OK';
  if (cancelBtn) cancelBtn.textContent = cancelText || 'Cancel';

  if (cancelBtn) {
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
  }
  confirmBtn?.classList.toggle('btn-primary', !destructive);
  confirmBtn?.classList.toggle('btn-danger', destructive);
}

function ensureDialogHandlers() {
  const modal = $id('dialog-modal');
  if (!modal || modal.dataset.handlersAttached === 'true') return;
  modal.dataset.handlersAttached = 'true';

  const confirmBtn = $id('dialog-confirm-btn');

  confirmBtn?.addEventListener('click', () => closeDialog(true));

  // Also wires the cancel button; a second listener would close the next waiting dialog.
  setupModalCloseHandlers('dialog-modal', () => closeDialog(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDialogOpen()) {
      closeDialog(false);
    }
  });
}

function showDialog({ destructive = false } = {}) {
  const modal = $id('dialog-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Focus for accessibility; Enter on a destructive prompt must not be the destructive choice.
  $id(destructive ? 'dialog-cancel-btn' : 'dialog-confirm-btn')?.focus();
}

export function confirmDialog({
  title = 'Confirm',
  message = '',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  destructive = false
} = {}) {
  return new Promise((resolve) => {
    openDialog(() => {
      setDialog({ title, message, confirmText, cancelText, showCancel: true, destructive });
      showDialog({ destructive });
      currentResolver = resolve;
    });
  });
}

export function alertDialog({ title = 'Notice', message = '', okText = 'OK' } = {}) {
  return new Promise((resolve) => {
    openDialog(() => {
      setDialog({ title, message, confirmText: okText, cancelText: '', showCancel: false });
      showDialog();
      currentResolver = () => resolve(true);
    });
  });
}
