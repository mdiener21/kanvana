// #231 journey 2: each thing a user does to a task on one device shows on the other, with no
// reload. Each step waits on B before A goes on, so a later event can't hide a lost one.
import { test, expect } from '@playwright/test';
import { dragByMouse } from '../dragdrop.helpers.js';
import { addTask, allCards, card, columnTasks, confirm, dialog, moveTaskWithEditor, taskTitle } from '../journey.helpers.js';
import { boardView, expectSameBoard, expectSameBoardAfterReload, registerAccount, requirePocketBase, SYNC_TIMEOUT, twoDevices, twoDevicesOnNewBoard } from './live.helpers.js';

requirePocketBase();

test('a task created, edited, moved and deleted on A shows on B without a reload', async ({ browser }) => {
  test.slow();
  const { a, b, reloadsOnB, close } = await twoDevicesOnNewBoard(browser, await registerAccount('tasks'));

  // Create
  await addTask(a, 'To Do', 'Draft agenda', { description: 'First pass', priority: 'low', dueDate: '2031-01-10', labels: ['Goal'] });
  const created = columnTasks(b, 'To Do').getByRole('listitem', { name: 'Task: Draft agenda', exact: true });
  await expect(created).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(created).toContainText('Goal');
  await expect(created.getByLabel('Priority: low')).toBeVisible();

  // Edit every field shown on the card or in the editor
  await card(a, 'Draft agenda').locator('.task-title').click();
  const form = dialog(a, 'Edit Task');
  await taskTitle(form).fill('Final agenda');
  await form.getByLabel('Description', { exact: true }).fill('Agreed with the team');
  await form.getByLabel('Priority', { exact: true }).selectOption('urgent');
  await form.getByLabel('Due Date', { exact: true }).fill('2031-02-20');
  await form.getByLabel('Filter available labels').fill('Idea');
  await form.getByRole('checkbox', { name: 'Idea', exact: true }).check();
  await form.getByLabel('Filter available labels').fill('');
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).toBeHidden();

  const edited = card(b, 'Final agenda');
  await expect(edited).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(card(b, 'Draft agenda')).toHaveCount(0);
  await expect(edited.getByLabel('Priority: urgent')).toBeVisible();
  await expect(edited).toContainText('Idea');
  await edited.locator('.task-title').click();
  const onB = dialog(b, 'Edit Task');
  await expect(taskTitle(onB)).toHaveValue('Final agenda');
  await expect(onB.getByLabel('Description', { exact: true })).toHaveValue('Agreed with the team');
  await expect(onB.getByLabel('Priority', { exact: true })).toHaveValue('urgent');
  await expect(onB.getByLabel('Due Date', { exact: true })).toHaveValue('2031-02-20');
  await onB.getByRole('button', { name: 'Close task editor' }).click();
  await expect(onB).toBeHidden();

  // Move
  await moveTaskWithEditor(a, 'Final agenda', 'In Progress');
  await expect(columnTasks(b, 'In Progress').getByRole('listitem', { name: 'Task: Final agenda', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(columnTasks(b, 'To Do').getByRole('listitem', { name: 'Task: Final agenda', exact: true })).toHaveCount(0);

  // Dragging is what users do, and it also syncs where the card landed among the others
  await addTask(a, 'To Do', 'Already in To Do');
  await expect(card(b, 'Already in To Do')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await dragByMouse(a, card(a, 'Final agenda'), columnTasks(a, 'To Do'));
  await expect(columnTasks(a, 'To Do').getByRole('listitem', { name: 'Task: Final agenda', exact: true })).toBeVisible();
  await expect(columnTasks(b, 'To Do').getByRole('listitem', { name: 'Task: Final agenda', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectSameBoard(a, b);

  // Moving to Done is its own path: the card keeps its place in the Done column
  await moveTaskWithEditor(a, 'Final agenda', 'Done');
  await expect(columnTasks(b, 'Done').getByRole('listitem', { name: 'Task: Final agenda', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });

  // Delete
  await card(a, 'Final agenda').getByRole('button', { name: 'Delete task', exact: true }).click();
  await confirm(a, 'Delete task?', 'Delete');
  await expect(card(a, 'Final agenda')).toHaveCount(0);
  await expect(card(b, 'Final agenda')).toHaveCount(0, { timeout: SYNC_TIMEOUT });

  expect(reloadsOnB()).toBe(0);
  await expectSameBoardAfterReload(a, b);
  await close();
});

test.fixme('on the first-run board a new task lands in the same place on both devices', async ({ browser }) => {
  // Bug: each device makes its own demo tasks with random ids, so A's renumbering misses B's and B keeps them above the new task (#263).
  test.slow();
  const { a, b, close } = await twoDevices(browser, await registerAccount('demo-order'));
  await addTask(a, 'To Do', 'First real task');
  await expect(card(b, 'First real task')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect.poll(() => boardView(b), { timeout: SYNC_TIMEOUT }).toEqual(await boardView(a));
  await close();
});

test.fixme('on the first-run board a demo task deleted on A goes from B too', async ({ browser }) => {
  // Bug: demo tasks are local-only with random ids, so a delete on A names an id B has never had and the card stays (#263).
  test.slow();
  const { a, b, close } = await twoDevices(browser, await registerAccount('demo-delete'));
  const demo = 'Find out where the Soul Stone is';
  await expect(card(b, demo)).toBeVisible();
  const before = await allCards(b).count();
  await card(a, demo).getByRole('button', { name: 'Delete task', exact: true }).click();
  await confirm(a, 'Delete task?', 'Delete');
  await expect(card(a, demo)).toHaveCount(0);
  await expect(card(b, demo)).toHaveCount(0, { timeout: SYNC_TIMEOUT });
  await expect(allCards(b)).toHaveCount(before - 1);
  await close();
});
