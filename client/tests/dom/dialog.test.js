// #221: the account-switch prompt relies on these; a boot-time alert can open at any moment.
import { waitFor } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let confirmDialog;
let alertDialog;

const el = (id) => document.getElementById(id);

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="dialog-modal" class="modal hidden">
      <div class="modal-backdrop"></div>
      <h3 id="dialog-modal-title"></h3>
      <button id="dialog-close-btn"></button>
      <p id="dialog-modal-message"></p>
      <button id="dialog-cancel-btn" class="btn btn-secondary"></button>
      <button id="dialog-confirm-btn" class="btn btn-primary"></button>
    </div>`;
  ({ confirmDialog, alertDialog } = await import('../../src/modules/dialog.js'));
});

afterEach(() => { document.body.innerHTML = ''; });

describe('on a page with no dialog markup', () => {
  it('builds the dialog itself, with its icon, and it answers', async () => {
    document.body.innerHTML = '';

    const answer = confirmDialog({ title: 'Built here', message: 'Sure?', confirmText: 'Yes' });

    expect(document.getElementById('dialog-modal-title').textContent).toBe('Built here');
    expect(document.querySelector('#dialog-close-btn svg')).not.toBeNull();
    expect(document.querySelectorAll('#dialog-modal')).toHaveLength(1);
    document.getElementById('dialog-confirm-btn').click();
    await expect(answer).resolves.toBe(true);
    expect(document.getElementById('dialog-modal').classList.contains('hidden')).toBe(true);
  });
});

describe('dialog', () => {
  it('focuses confirm on an ordinary dialog', () => {
    confirmDialog({ title: 'Delete task?' });

    expect(document.activeElement?.id).toBe('dialog-confirm-btn');
    expect(el('dialog-confirm-btn').classList.contains('btn-primary')).toBe(true);
    el('dialog-confirm-btn').click();
  });

  it('focuses Cancel and marks the confirm button as dangerous on a destructive prompt', () => {
    confirmDialog({ title: 'Discard?', destructive: true });

    expect(document.activeElement?.id).toBe('dialog-cancel-btn');
    expect(el('dialog-confirm-btn').classList.contains('btn-danger')).toBe(true);
    expect(el('dialog-confirm-btn').classList.contains('btn-primary')).toBe(false);
    el('dialog-cancel-btn').click();
  });

  it('resolves false on a backdrop click, so it cannot discard anything', async () => {
    const dismissed = confirmDialog({ destructive: true });
    document.querySelector('.modal-backdrop').click();
    await expect(dismissed).resolves.toBe(false);
  });

  it('keeps an open prompt answerable when an alert is opened over it', async () => {
    const prompt = confirmDialog({ title: 'Discard?', destructive: true });
    const alert = alertDialog({ title: 'Sync Server Unavailable' });

    expect(el('dialog-modal-title').textContent).toBe('Discard?');
    el('dialog-confirm-btn').click();
    await expect(prompt).resolves.toBe(true);

    await waitFor(() => expect(el('dialog-modal-title').textContent).toBe('Sync Server Unavailable'));
    expect(el('dialog-modal').classList.contains('hidden')).toBe(false);
    el('dialog-confirm-btn').click();
    await expect(alert).resolves.toBe(true);
    expect(el('dialog-modal').classList.contains('hidden')).toBe(true);
  });

  it('cancelling one dialog does not also close the one waiting behind it', async () => {
    const first = confirmDialog({ title: 'First' });
    const second = confirmDialog({ title: 'Second' });

    el('dialog-cancel-btn').click();

    await expect(first).resolves.toBe(false);
    expect(el('dialog-modal-title').textContent).toBe('Second');
    expect(el('dialog-modal').classList.contains('hidden')).toBe(false);
    el('dialog-confirm-btn').click();
    await expect(second).resolves.toBe(true);
  });
});
