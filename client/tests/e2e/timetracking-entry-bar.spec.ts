import { test, expect, devices, type Page } from '@playwright/test';

// Pixel 5 is a Chromium device; dropping its browser type lets it apply inside a describe group.
const { defaultBrowserType: _browser, ...pixel5 } = devices['Pixel 5'];
const FIELDS = ['Description', 'Project', 'Date', 'Start', 'End', 'Duration'];

async function expectFieldsReadable(page: Page) {
  const bar = page.getByRole('group', { name: 'New time entry' });
  for (const name of FIELDS) {
    const input = bar.getByLabel(name, { exact: true });
    await expect(input).toBeVisible();
    await expect(bar.locator('label', { hasText: new RegExp(`^${name}$`) })).toBeVisible();
    const truncated = await input.evaluate((el: HTMLInputElement) => el.scrollWidth > el.clientWidth);
    expect(truncated, `${name} value is truncated`).toBe(false);
  }
  return bar;
}

test('the entry bar shows labelled fields, a sentence-case Add with an Enter hint, and the shorthand hint', async ({ page }) => {
  await page.goto('/timetracking.html');
  const bar = await expectFieldsReadable(page);
  const add = bar.getByRole('button', { name: 'Add entry' });
  await expect(add).toHaveText(/^\s*Add\s+Enter\s*$/);
  await expect(add.locator('kbd')).toBeVisible();
  await expect(bar.locator('.tt-entry-hint')).toBeVisible();
  await expect(bar.locator('.tt-entry-hint')).toContainText('shorthand');
  await expect(bar.locator('.tt-entry-hint')).toContainText('±15 min');
});

test.describe('on a Pixel 5', () => {
  test.use(pixel5);

  test('the entry bar wraps with untruncated time values, touch-sized controls and no horizontal overflow', async ({ page }) => {
    await page.goto('/timetracking.html');
    const bar = await expectFieldsReadable(page);

    // An overnight entry shows the +1 day marker; it must not squeeze the time values either.
    await bar.getByLabel('Start', { exact: true }).fill('23:30');
    await bar.getByLabel('End', { exact: true }).fill('0:45');
    await bar.getByLabel('Description', { exact: true }).focus();
    await expect(bar.getByText('+1 day')).toBeVisible();
    await expectFieldsReadable(page);

    const controls = [...FIELDS.map((name) => bar.getByLabel(name, { exact: true })), bar.getByRole('button', { name: 'Add entry' })];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(bar.locator('.tt-entry-hint')).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
