import { readdirSync, readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import {
  allCards,
  card,
  closeManageLabels,
  columnHeadings,
  createBoard,
  dialog,
  openApp,
  openManageBoards,
  openManageLabels,
} from './journey.helpers.js';

const templatesDir = new URL('../../src/templates/', import.meta.url);

interface Template {
  boardName?: string;
  columns: { name: string; order: number }[];
  labels: { id: string; name: string; group?: string }[];
  tasks: { title: string; labels?: string[] }[];
}

const templates = readdirSync(templatesDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, data: JSON.parse(readFileSync(new URL(file, templatesDir), 'utf8')) as Template }));

// Sections after the first start collapsed, so open them all before reading the list.
async function expectManagedLabels(page: Page, template: Template): Promise<void> {
  const labels = await openManageLabels(page);
  const collapsed = labels.locator('.accordion-header[aria-expanded="false"]');
  while ((await collapsed.count()) > 0) await collapsed.first().click();

  const shown = await labels.locator('.label-item .task-label').allTextContents();
  expect(shown.sort()).toEqual(template.labels.map((label) => label.name).sort());

  const groups = new Set(template.labels.map((label) => label.group?.trim() || 'Ungrouped'));
  const sections = await labels.locator('.accordion-title').allTextContents();
  expect(sections.sort()).toEqual([...groups].sort());
  await closeManageLabels(page);
}

for (const { file, data } of templates.filter(({ data }) => data.boardName)) {
  test(`a board created from the ${data.boardName} template has its columns, labels and starter tasks`, async ({ page }) => {
    await openApp(page);
    await createBoard(page, 'From template', data.boardName);

    const inOrder = [...data.columns].sort((a, b) => a.order - b.order).map((c) => c.name);
    await expect(columnHeadings(page), file).toHaveText(inOrder);

    await expect(allCards(page)).toHaveCount(data.tasks.length);
    const labelName = new Map(data.labels.map((label) => [label.id, label.name]));
    for (const task of data.tasks) {
      const expected = (task.labels ?? []).map((id) => labelName.get(id));
      await expect(card(page, task.title).locator('.task-label')).toHaveText(expected as string[]);
    }

    await expectManagedLabels(page, data);
  });
}

test('every template in the templates folder is offered when creating a board', async ({ page }) => {
  await openApp(page);
  const boards = await openManageBoards(page);
  await boards.getByRole('button', { name: 'Create Board', exact: true }).click();
  await expect(dialog(page, 'Create New Board').getByLabel('Select a board template').locator('option')).toHaveCount(templates.length + 1);
});
