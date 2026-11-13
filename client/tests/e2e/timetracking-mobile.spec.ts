import { test, expect, devices, type Locator, type Page } from '@playwright/test';

test.use({ ...devices['Pixel 5'] });

test('on a phone the sidebar becomes a bottom tab bar and an entry can be logged by touch', async ({ page }) => {
  await page.goto('/timetracking.html');
  const sidebar = await page.locator('#tt-sidebar').boundingBox();
  const main = await page.locator('#tt-main').boundingBox();
  const viewport = page.viewportSize()!;
  expect(sidebar!.height).toBeLessThan(100);
  expect(main!.x).toBe(sidebar!.x);
  expect(main!.width).toBe(sidebar!.width);
  // Pinned to the bottom edge, and still there after scrolling
  expect(sidebar!.y + sidebar!.height).toBeCloseTo(viewport.height, 0);
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
  const scrolled = await page.locator('#tt-sidebar').boundingBox();
  expect(scrolled!.y + scrolled!.height).toBeCloseTo(viewport.height, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('#tt-sidebar-toggle')).toBeHidden();
  for (const id of ['tracker', 'reports', 'projects', 'settings']) {
    await expect(page.locator(`#tt-nav-${id}`)).toBeInViewport();
  }

  await page.locator('#tt-nav-projects').tap();
  await page.getByLabel('New customer name').fill('Acme');
  await page.getByRole('button', { name: 'Add customer' }).tap();
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.getByRole('button', { name: 'Add project' }).tap();
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();

  await page.locator('#tt-nav-tracker').tap();
  await page.getByLabel('Description', { exact: true }).fill('Call');
  await page.getByLabel('Project', { exact: true }).fill('Website');
  await page.getByLabel('Duration', { exact: true }).fill('25m');
  const add = page.getByRole('button', { name: 'Add entry' });
  await expect(add).toBeInViewport();
  await add.tap();

  const row = page.locator('.tt-entry-row', { hasText: 'Call' });
  await expect(row).toBeInViewport();
  await expect(row.locator('.tt-entry-project')).toHaveText('Website');
  await expect(row.locator('.tt-entry-duration')).toHaveText('0:25');
  await expect(page.getByLabel('Total for Today')).toHaveText('0:25');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

async function expectTouchSized(locator: Locator) {
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const box = await locator.nth(i).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('on a phone a time entry can be edited and deleted from its row menu', async ({ page }) => {
  await page.goto('/timetracking.html');
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
  await page.locator('#tt-nav-projects').tap();
  await page.getByLabel('New customer name').fill('Acme');
  await page.getByRole('button', { name: 'Add customer' }).tap();
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.getByRole('button', { name: 'Add project' }).tap();
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();
  await expectTouchSized(page.locator('.tt-item-actions .tt-entry-action'));
  await expectTouchSized(page.getByRole('button', { name: /^Add (customer|project)$/ }));

  await page.locator('#tt-nav-tracker').tap();
  await page.getByLabel('Description', { exact: true }).fill('Call');
  await page.getByLabel('Project', { exact: true }).fill('Website');
  await page.getByLabel('Duration', { exact: true }).fill('25m');
  const add = page.getByRole('button', { name: 'Add entry' });
  await expectTouchSized(add);
  await add.tap();

  const row = page.locator('.tt-entry-row', { hasText: 'Call' });
  await expect(row).toBeVisible();
  await expect(row).not.toHaveClass(/is-selected/);
  // Touch rows keep one always-visible ⋯ menu instead of three icon actions
  for (const name of ['Edit entry', 'Duplicate entry', 'Delete entry']) {
    await expect(row.getByRole('button', { name })).toBeHidden();
  }
  const more = row.getByRole('button', { name: 'More actions' });
  await expect(more).toBeVisible();
  await expectTouchSized(more);
  await expectNoHorizontalOverflow(page);

  await more.tap();
  const menu = page.getByRole('menu', { name: 'Entry actions' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Edit', 'Duplicate', 'Delete']);
  await expectTouchSized(menu.getByRole('menuitem'));
  await expectNoHorizontalOverflow(page);
  await menu.getByRole('menuitem', { name: 'Edit' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(dialog).toBeVisible();
  await expectTouchSized(dialog.getByRole('button'));
  await dialog.getByLabel('Description', { exact: true }).fill('Client call');
  await dialog.getByRole('button', { name: 'Save' }).tap();
  await expect(dialog).toBeHidden();
  const edited = page.locator('.tt-entry-row', { hasText: 'Client call' });
  await expect(edited).toBeVisible();

  await edited.getByRole('button', { name: 'More actions' }).tap();
  await page.getByRole('menu', { name: 'Entry actions' }).getByRole('menuitem', { name: 'Delete' }).tap();
  const confirm = page.locator('.tt-entry-confirm');
  await expect(confirm).toContainText('Delete “Client call”');
  await expectTouchSized(confirm.getByRole('button'));
  await expectNoHorizontalOverflow(page);
  await confirm.getByRole('button', { name: 'Delete' }).tap();
  await expect(page.locator('.tt-entry-row')).toHaveCount(0);

  await page.locator('#tt-nav-reports').tap();
  await expectTouchSized(page.locator('.tt-period-btn, .tt-period-option'));
  await expectNoHorizontalOverflow(page);
});
