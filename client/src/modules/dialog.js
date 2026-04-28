import { setupModalCloseHandlers } from './modals.js';

let currentResolver = null;

function getEl(id) {
  return document.getElementById(id);
}

function closeDialog(result) {
  const modal = getEl('dialog-modal');
  if (modal) modal.classList.add('hidden');

  const resolve = currentResolver;
  currentResolver = null;
  if (typeof resolve === 'function') resolve(Boolean(result));
}

function isDialogOpen() {
  const modal = getEl('dialog-modal');
  return modal && !modal.classList.contains('hidden');
}

function setDialog({ title, message, confirmText, cancelText, showCancel }) {
  const titleEl = getEl('dialog-modal-title');
  const messageEl = getEl('dialog-modal-message');
  const confirmBtn = getEl('dialog-confirm-btn');
  const cancelBtn = getEl('dialog-cancel-btn');

  if (titleEl) titleEl.textContent = title || 'Confirm';
  if (messageEl) messageEl.textContent = message || '';
  if (confirmBtn) confirmBtn.textContent = confirmText || 'OK';
  if (cancelBtn) cancelBtn.textContent = cancelText || 'Cancel';

  if (cancelBtn) {
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
  }
}

function ensureDialogHandlers() {
  const modal = getEl('dialog-modal');
  if (!modal || modal.dataset.handlersAttached === 'true') return;
  modal.dataset.handlersAttached = 'true';

  const confirmBtn = getEl('dialog-confirm-btn');
  const cancelBtn = getEl('dialog-cancel-btn');
  const backdrop = modal.querySelector('.modal-backdrop');

  confirmBtn?.addEventListener('click', () => closeDialog(true));
  cancelBtn?.addEventListener('click', () => closeDialog(false));
  
  setupModalCloseHandlers('dialog-modal', () => closeDialog(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDialogOpen()) {
      closeDialog(false);
    }
  });
}

function showDialog() {
  const modal = getEl('dialog-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Focus confirm button for accessibility
  const confirmBtn = getEl('dialog-confirm-btn');
  confirmBtn?.focus();
}

export function confirmDialog({
  title = 'Confirm',
  message = '',
  confirmText = 'Delete',
  cancelText = 'Cancel'
} = {}) {
  ensureDialogHandlers();
  setDialog({ title, message, confirmText, cancelText, showCancel: true });
  showDialog();

  return new Promise((resolve) => {
    currentResolver = resolve;
  });
}

export function alertDialog({ title = 'Notice', message = '', okText = 'OK' } = {}) {
  ensureDialogHandlers();
  setDialog({ title, message, confirmText: okText, cancelText: '', showCancel: false });
  showDialog();

  return new Promise((resolve) => {
    currentResolver = () => resolve(true);
  });
}
