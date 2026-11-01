import { expect, type Locator, type Page } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';

// Shared steps for the board journeys. Everything goes through the UI, the way a user
// would: nothing here reads IndexedDB or calls app modules.

export interface TaskFields {
  description?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  dueDate?: string;
  labels?: string[];
}

export interface ImportFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export function jsonFile(content: unknown, name = 'board.json'): ImportFile {
  return { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) };
}

export const column = (page: Page, name: string): Locator => page.getByRole('article', { name, exact: true });

export const columnTasks = (page: Page, name: string): Locator => page.getByRole('list', { name: `Tasks in ${name}`, exact: true });

export const card = (page: Page, title: string): Locator => page.getByRole('listitem', { name: `Task: ${title}`, exact: true });

export const allCards = (page: Page): Locator => page.getByRole('listitem', { name: /^Task: / });

export const columnHeadings = (page: Page): Locator => page.getByRole('main', { name: 'Kanban board' }).getByRole('heading', { level: 2 });

export const dialog = (page: Page, name: string): Locator => page.getByRole('dialog', { name, exact: true });

// The controls live behind the toolbar's Menu button; it closes again after some actions.
async function revealInMenu(page: Page, control: Locator): Promise<void> {
  if (!(await control.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(control).toBeVisible();
}

export async function clickMenuButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true });
  await revealInMenu(page, button);
  await button.click();
}

export async function followMenuLink(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name, exact: true });
  await revealInMenu(page, link);
  await link.click();
}

export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await waitForBoardReady(page);
}

export async function reloadBoard(page: Page): Promise<void> {
  await page.reload();
  await waitForBoardReady(page);
}

export async function openManageBoards(page: Page): Promise<Locator> {
  const boards = dialog(page, 'Manage Boards');
  if (!(await boards.isVisible())) await clickMenuButton(page, 'Manage Boards');
  await expect(boards).toBeVisible();
  return boards;
}

export async function closeManageBoards(page: Page): Promise<void> {
  const boards = dialog(page, 'Manage Boards');
  await boards.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(boards).toBeHidden();
}

export const boardNames = (boards: Locator): Locator => boards.locator('.board-name-wrap > span:first-child');

// Leaves Manage Boards closed with the new board active.
export async function createBoard(page: Page, name: string, template = 'Blank board'): Promise<void> {
  const boards = await openManageBoards(page);
  await boards.getByRole('button', { name: 'Create Board', exact: true }).click();
  const create = dialog(page, 'Create New Board');
  await expect(create).toBeVisible();
  await create.getByLabel('Board Name').fill(name);
  await create.getByLabel('Select a board template').selectOption({ label: template });
  await create.getByRole('button', { name: 'Create Board', exact: true }).click();
  await expect(create).toBeHidden();
  await closeManageBoards(page);
  await expect(page.locator('#brand-text')).toHaveText(name);
}

// A blank board has the default columns and labels and no sample tasks.
export async function openBlankBoard(page: Page, name = 'Journey Board'): Promise<void> {
  await openApp(page);
  await createBoard(page, name);
  await expect(allCards(page)).toHaveCount(0);
}

// "Title" alone also matches the sub-task input's aria-label.
export const taskTitle = (form: Locator): Locator => form.getByRole('textbox', { name: 'Title', exact: true });

async function fillTaskForm(form: Locator, fields: TaskFields): Promise<void> {
  if (fields.description !== undefined) await form.getByLabel('Description', { exact: true }).fill(fields.description);
  if (fields.priority) await form.getByLabel('Priority', { exact: true }).selectOption(fields.priority);
  if (fields.dueDate !== undefined) await form.getByLabel('Due Date', { exact: true }).fill(fields.dueDate);
  for (const label of fields.labels ?? []) {
    await form.getByLabel('Filter available labels').fill(label);
    await form.getByRole('checkbox', { name: label, exact: true }).check();
    await form.getByLabel('Filter available labels').fill('');
  }
}

export async function addTask(page: Page, columnName: string, title: string, fields: TaskFields = {}): Promise<void> {
  await page.getByRole('button', { name: `Add task to ${columnName}`, exact: true }).click();
  const form = dialog(page, 'Add New Task');
  await expect(form).toBeVisible();
  await taskTitle(form).fill(title);
  await fillTaskForm(form, fields);
  await form.getByRole('button', { name: 'Add Task', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(card(page, title)).toBeVisible();
}

export async function moveTaskWithEditor(page: Page, title: string, columnName: string): Promise<void> {
  await card(page, title).locator('.task-title').click();
  const form = dialog(page, 'Edit Task');
  await expect(form).toBeVisible();
  await form.getByLabel('Column', { exact: true }).selectOption({ label: columnName });
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(columnTasks(page, columnName).getByRole('listitem', { name: `Task: ${title}`, exact: true })).toBeVisible();
}

export async function confirm(page: Page, title: string, button: string): Promise<void> {
  const prompt = dialog(page, title);
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: button, exact: true }).click();
  await expect(prompt).toBeHidden();
}

// Runs the Manage Boards import flow up to the point where the file has been read, and
// returns the dialog that follows: "Review Import" or "Import Error".
export async function chooseImportFile(page: Page, file: ImportFile, expectedDialog: string): Promise<Locator> {
  const boards = await openManageBoards(page);
  await boards.getByRole('button', { name: 'Import Board', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await confirm(page, 'Import Board (New Board)', 'Import');
  await (await chooser).setFiles(file);
  const result = dialog(page, expectedDialog);
  await expect(result).toBeVisible();
  return result;
}

export async function importBoard(page: Page, file: ImportFile): Promise<void> {
  await chooseImportFile(page, file, 'Review Import');
  await confirm(page, 'Review Import', 'Import Board');
  await confirm(page, 'Import Complete', 'OK');
  await closeManageBoards(page);
}

export async function exportBoardFile(page: Page, boardName: string): Promise<{ filename: string; data: any }> {
  const boards = await openManageBoards(page);
  const download = page.waitForEvent('download');
  await boards.getByRole('button', { name: `Export board ${boardName}`, exact: true }).click();
  const file = await download;
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  await closeManageBoards(page);
  return { filename: file.suggestedFilename(), data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}

export async function openManageLabels(page: Page): Promise<Locator> {
  await clickMenuButton(page, 'Manage Labels');
  const labels = dialog(page, 'Manage Labels');
  await expect(labels).toBeVisible();
  return labels;
}

export async function closeManageLabels(page: Page): Promise<void> {
  const labels = dialog(page, 'Manage Labels');
  await labels.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(labels).toBeHidden();
}

export async function openSettings(page: Page): Promise<Locator> {
  await clickMenuButton(page, 'Settings');
  const settings = dialog(page, 'Settings');
  await expect(settings).toBeVisible();
  return settings;
}

export async function closeSettings(page: Page): Promise<void> {
  const settings = dialog(page, 'Settings');
  await settings.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(settings).toBeHidden();
}

// Label chips carry their colours inline, so the computed style is exactly what the user sees.
export async function expectChipColors(chip: Locator, background: string, text: string): Promise<void> {
  await expect(chip).toHaveCSS('background-color', background);
  await expect(chip).toHaveCSS('color', text);
}

// The column's accent is painted by a pseudo-element, which locators cannot reach.
export async function columnAccent(columnLocator: Locator): Promise<string> {
  return columnLocator.evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
}
