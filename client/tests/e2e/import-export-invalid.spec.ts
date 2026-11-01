import { test, expect, type Page } from '@playwright/test';
import {
  allCards,
  boardNames,
  card,
  chooseImportFile,
  closeManageBoards,
  confirm,
  importBoard,
  jsonFile,
  openApp,
  openManageBoards,
  type ImportFile,
} from './journey.helpers.js';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const validBoard = (extra: object = {}) => ({
  boardName: 'Imported',
  columns: [
    { id: 'todo', name: 'Queue', color: '#3583ff', order: 1 },
    { id: 'done', name: 'Done', color: '#505050', order: 2, role: 'done' },
  ],
  tasks: [{ id: 't1', title: 'Only task', column: 'todo' }],
  labels: [],
  ...extra,
});

function rawFile(content: string | Buffer): ImportFile {
  return { name: 'board.json', mimeType: 'application/json', buffer: Buffer.from(content) };
}

const rejected: { name: string; file: () => ImportFile; message: RegExp }[] = [
  {
    name: 'a file that is not JSON',
    file: () => rawFile('this is { not json'),
    message: /Error parsing JSON file/,
  },
  {
    name: 'JSON that is neither a task list nor a board',
    file: () => jsonFile({ hello: 'world' }),
    message: /Invalid JSON file format\. Expected either a task array or a board export object/,
  },
  {
    name: 'a board with a malformed section',
    file: () => jsonFile(validBoard({ labels: 'not-a-list' })),
    message: /Invalid data structure/,
  },
  {
    name: 'a task pointing at an unknown column',
    file: () => jsonFile(validBoard({ tasks: [{ id: 't1', title: 'Lost', column: 'ghost' }] })),
    // The spec requires explicit manual-fix instructions for this one.
    message: /unknown columns: ghost\..*add matching entries to columns\[\]\.id.*change task\.column values to existing column ids/,
  },
  {
    name: 'a file above the size limit',
    file: () => rawFile(Buffer.alloc(MAX_IMPORT_BYTES + 1, ' ')),
    message: /Import file is too large \(.+\)\. Maximum supported size is 2(\.0)? MB\./,
  },
];

async function expectBoardUntouched(page: Page, sampleTasks: number): Promise<void> {
  const boards = await openManageBoards(page);
  await expect(boardNames(boards)).toHaveCount(1);
  await closeManageBoards(page);
  await expect(allCards(page)).toHaveCount(sampleTasks);
}

for (const { name, file, message } of rejected) {
  test(`importing ${name} shows the error and creates no board`, async ({ page }) => {
    await openApp(page);
    const brand = await page.locator('#brand-text').textContent();
    const sampleTasks = await allCards(page).count();

    const error = await chooseImportFile(page, file(), 'Import Error');
    await expect(error).toContainText(message);
    await confirm(page, 'Import Error', 'OK');

    await expectBoardUntouched(page, sampleTasks);
    await expect(page.locator('#brand-text')).toHaveText(brand ?? '');
  });
}

test('cancelling the import review saves nothing', async ({ page }) => {
  await openApp(page);
  const sampleTasks = await allCards(page).count();

  await chooseImportFile(page, jsonFile(validBoard()), 'Review Import');
  await confirm(page, 'Review Import', 'Cancel');

  await expectBoardUntouched(page, sampleTasks);
  await expect(card(page, 'Only task')).toHaveCount(0);
});

test('an unusually large but supported file shows a caution and can still be imported', async ({ page }) => {
  await openApp(page);
  const padded = validBoard({
    tasks: [{ id: 't1', title: 'Only task', column: 'todo', description: 'x'.repeat(600 * 1024) }],
  });

  const review = await chooseImportFile(page, jsonFile(padded), 'Review Import');
  await expect(review).toContainText('Large import file detected');
  await confirm(page, 'Review Import', 'Import Board');
  await confirm(page, 'Import Complete', 'OK');
  await closeManageBoards(page);

  await expect(page.locator('#brand-text')).toHaveText('Imported');
  await expect(card(page, 'Only task')).toBeVisible();
});

test('a task label missing from the file is dropped with a warning in the review', async ({ page }) => {
  await openApp(page);
  const board = validBoard({
    labels: [{ id: 'known', name: 'Known', color: '#25b631' }],
    tasks: [{ id: 't1', title: 'Only task', column: 'todo', labels: ['known', 'missing'] }],
  });

  const review = await chooseImportFile(page, jsonFile(board), 'Review Import');
  await expect(review).toContainText('Removed 1 label reference that did not exist in the imported label list.');
  await confirm(page, 'Review Import', 'Cancel');
  await closeManageBoards(page);

  await importBoard(page, jsonFile(board));
  await expect(card(page, 'Only task').locator('.task-label')).toHaveText(['Known']);
});
