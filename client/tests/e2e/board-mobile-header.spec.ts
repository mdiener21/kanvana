import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 5'] });

test('on a phone the board header carries search, sync and time tracking; the menu only board controls', async ({ page }) => {
  await page.goto('/index.html');

  const search = page.locator('#board-search-input');
  const session = page.locator('.session-status');
  await expect(search).toBeHidden();
  await expect(session).toBeHidden();

  // The menu no longer surfaces search, sign-in or the time-tracking entry
  await page.locator('#desktop-menu-btn').tap();
  await expect(page.locator('#board-controls-menu')).toBeVisible();
  await expect(search).toBeHidden();
  await expect(session).toBeHidden();
  await expect(search).not.toBeFocused();
  await expect(page.locator('#board-controls-menu').getByText('Time Tracking')).toHaveCount(0);
  await page.locator('#mobile-menu-close-btn').tap();

  // Search drops in below the header from its toggle
  await page.locator('#search-quick-btn').tap();
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  await expect(page.locator('#search-quick-btn')).toHaveAttribute('aria-expanded', 'true');
  await search.press('Escape');
  await expect(search).toBeHidden();

  // Signed out: the cloud button goes straight to sign-in
  await page.locator('#sync-quick-btn').tap();
  await expect(page.locator('#login-modal')).toBeVisible();
});

test('the time-tracking quick link sits in the header and opens the tracker', async ({ page }) => {
  await page.goto('/index.html');
  const link = page.locator('#timetracking-quick-btn');
  await expect(link).toBeInViewport();
  const box = await link.boundingBox();
  const menuBox = await page.locator('#desktop-menu-btn').boundingBox();
  expect(box!.height).toBe(menuBox!.height);
  await link.tap();
  await expect(page).toHaveURL(/timetracking\.html/);
});
