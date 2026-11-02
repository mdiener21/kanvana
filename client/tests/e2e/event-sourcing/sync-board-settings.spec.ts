// #231 journey 4: board settings changed on one device apply on the other without a reload.
// Swimlane settings are left out on purpose: no event carries them (CONTEXT.md §9), so they
// stay on the device that set them.
import { test, expect } from '@playwright/test';
import { addTask, card, closeSettings, dialog, openSettings, reloadBoard } from '../journey.helpers.js';
import { registerAccount, requirePocketBase, SYNC_TIMEOUT, twoDevicesOnNewBoard } from './live.helpers.js';

requirePocketBase();

test('settings changed on A apply on B without a reload', async ({ browser }) => {
  test.slow();
  const { a, b, reloadsOnB, close } = await twoDevicesOnNewBoard(browser, await registerAccount('settings'));

  await addTask(a, 'To Do', 'Book venue', { priority: 'high', dueDate: '2031-03-15' });
  const onB = card(b, 'Book venue');
  await expect(onB.getByLabel('Priority: high')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(onB).toContainText('3/15/2031');

  // What B's board shows follows each change
  const onA = await openSettings(a);
  await onA.getByLabel('Select locale').selectOption('de-DE');
  await expect(onB).toContainText('15.3.2031', { timeout: SYNC_TIMEOUT });

  await onA.getByLabel('Show task priority').uncheck();
  await expect(onB.getByLabel('Priority: high')).toHaveCount(0, { timeout: SYNC_TIMEOUT });

  await onA.getByLabel('Show task due date').uncheck();
  await expect(onB).not.toContainText('15.3.2031', { timeout: SYNC_TIMEOUT });

  // The rest shows in B's settings and its next new task
  await onA.getByLabel('Show task age').uncheck();
  await onA.getByLabel('Show updated date/time').check();
  const days = onA.getByLabel('Number of days ahead to include for notifications');
  await days.fill('21');
  await days.blur();
  const warning = onA.getByLabel('Days until due date to show countdown in amber (warning)');
  await warning.fill('20');
  await warning.blur();
  const urgent = onA.getByLabel('Days until due date to show countdown in red (urgent)');
  await urgent.fill('9');
  await urgent.blur();
  await onA.getByLabel('Select default task priority').selectOption('medium');
  await closeSettings(a);

  // The dialog shows what was set when it opened, so B looks again until the last change has come.
  const settings = dialog(b, 'Settings');
  await expect(async () => {
    await openSettings(b);
    try {
      await expect(settings.getByLabel('Select default task priority')).toHaveValue('medium', { timeout: 500 });
    } catch (err) {
      await closeSettings(b);
      throw err;
    }
  }).toPass({ timeout: SYNC_TIMEOUT });
  await expect(settings.getByLabel('Select locale')).toHaveValue('de-DE');
  await expect(settings.getByLabel('Show task priority')).not.toBeChecked();
  await expect(settings.getByLabel('Show task due date')).not.toBeChecked();
  await expect(settings.getByLabel('Show task age')).not.toBeChecked();
  await expect(settings.getByLabel('Show updated date/time')).toBeChecked();
  await expect(settings.getByLabel('Number of days ahead to include for notifications')).toHaveValue('21');
  await expect(settings.getByLabel('Days until due date to show countdown in amber (warning)')).toHaveValue('20');
  await expect(settings.getByLabel('Days until due date to show countdown in red (urgent)')).toHaveValue('9');
  await closeSettings(b);

  await b.getByRole('button', { name: 'Add task to To Do', exact: true }).click();
  const form = dialog(b, 'Add New Task');
  await expect(form.getByLabel('Priority', { exact: true })).toHaveValue('medium');
  await form.getByRole('button', { name: 'Close task editor' }).click();
  await expect(form).toBeHidden();

  expect(reloadsOnB()).toBe(0);

  // The same after a replay from the stored events
  await reloadBoard(b);
  await expect(card(b, 'Book venue')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(card(b, 'Book venue').getByLabel('Priority: high')).toHaveCount(0);
  const replayed = await openSettings(b);
  await expect(replayed.getByLabel('Select locale')).toHaveValue('de-DE');
  await expect(replayed.getByLabel('Number of days ahead to include for notifications')).toHaveValue('21');
  await expect(replayed.getByLabel('Days until due date to show countdown in red (urgent)')).toHaveValue('9');
  await closeSettings(b);

  await close();
});
