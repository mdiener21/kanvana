import { test, expect, type Page } from '@playwright/test';
import { addTask, allCards, card, openBlankBoard, reloadBoard } from './journey.helpers.js';

const search = (page: Page) => page.getByLabel('Search tasks by label, title, or description');

async function expectOnlyCards(page: Page, ...titles: string[]): Promise<void> {
  await expect(allCards(page)).toHaveCount(titles.length);
  for (const title of titles) await expect(card(page, title)).toBeVisible();
}

test('typing narrows the cards by title, description, priority, label and label group, and clearing restores them', async ({ page }) => {
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Write brief');
  await addTask(page, 'To Do', 'Pay invoice', { description: 'Quarterly accountant fee' });
  await addTask(page, 'In Progress', 'Call supplier', { priority: 'urgent' });
  await addTask(page, 'Done', 'Team lunch', { labels: ['Meeting'] });
  await addTask(page, 'Done', 'Set objectives', { labels: ['Goal'] });

  await search(page).fill('brief');
  await expectOnlyCards(page, 'Write brief');

  await search(page).fill('accountant');
  await expectOnlyCards(page, 'Pay invoice');

  await search(page).fill('urgent');
  await expectOnlyCards(page, 'Call supplier');

  await search(page).fill('Goal');
  await expectOnlyCards(page, 'Set objectives');

  // Meeting is in the default "Activity" label group
  await search(page).fill('Activity');
  await expectOnlyCards(page, 'Team lunch');

  await search(page).fill('nothing matches this');
  await expectOnlyCards(page);

  await search(page).fill('');
  await expectOnlyCards(page, 'Write brief', 'Pay invoice', 'Call supplier', 'Team lunch', 'Set objectives');
});

test('the search is in memory only: it changes no data and is gone after a reload', async ({ page }) => {
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Keep me');
  await addTask(page, 'To Do', 'Keep me as well');

  await search(page).fill('as well');
  await expectOnlyCards(page, 'Keep me as well');

  await reloadBoard(page);
  await expect(search(page)).toHaveValue('');
  await expectOnlyCards(page, 'Keep me', 'Keep me as well');
});
