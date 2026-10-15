import { beforeEach, expect, test } from 'vitest';
import { fireEvent, screen } from '@testing-library/dom';
import { mountToBody } from './setup.js';
import { createBoard, loadSettings, saveTasks } from '../../src/modules/storage.js';
import { initializeSettingsUI } from '../../src/modules/settings.js';

function mountSettings() {
  mountToBody(`
    <button id="settings-btn" type="button">Settings</button>
    <div id="settings-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <div class="modal-backdrop" data-close-modal></div>
      <article class="modal-content">
        <h3 id="settings-modal-title">Settings</h3>
        <button id="settings-close-modal-btn" type="button">Close</button>
        <form id="settings-form" novalidate>
          <section class="settings-section" aria-labelledby="settings-app-title">
            <h4 id="settings-app-title">App settings</h4>
          </section>
          <section class="settings-section" aria-labelledby="settings-board-title">
            <h4 id="settings-board-title">Board settings</h4>
            <label><input id="settings-show-priority" type="checkbox">Show task priority</label>
            <label><input id="settings-show-due-date" type="checkbox">Show task due date</label>
            <input id="settings-notification-days" type="number">
            <input id="settings-countdown-urgent-threshold" type="number">
            <input id="settings-countdown-warning-threshold" type="number">
            <label><input id="settings-show-age" type="checkbox">Show task age</label>
            <label><input id="settings-show-change-date" type="checkbox">Show updated date/time</label>
            <select id="settings-locale"></select>
            <select id="settings-default-priority"><option value="none">None</option></select>
          </section>
          <button type="button" id="settings-close-btn">Close</button>
        </form>
      </article>
    </div>
  `);
  initializeSettingsUI();
}

beforeEach(() => {
  createBoard('Settings UI');
  saveTasks([]);
});

test('settings modal opens with board settings controls', () => {
  mountSettings();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  expect(screen.getByRole('heading', { name: 'App settings' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Board settings' })).toBeTruthy();
  expect(screen.getByLabelText('Show task priority').checked).toBe(true);
  expect(screen.getByLabelText('Show task due date').checked).toBe(true);
  expect(screen.queryByLabelText('Soft-delete tasks')).toBeNull();
  expect(document.getElementById('settings-purge-btn')).toBeNull();
});

test('settings changes persist through board settings', () => {
  mountSettings();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByLabelText('Show task priority'));

  expect(loadSettings().showPriority).toBe(false);
});
