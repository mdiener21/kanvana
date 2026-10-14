import { test, expect } from '@playwright/test';

test('sidebar collapsed on desktop still shows full mobile nav after narrowing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/timetracking.html');
  await page.locator('#tt-sidebar-toggle').click();
  await expect(page.locator('#tt-shell')).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('#tt-nav-projects .tt-nav-label')).toBeHidden();

  await page.setViewportSize({ width: 375, height: 740 });
  await expect(page.locator('#tt-nav-projects .tt-nav-label')).toBeVisible();
  const columns = await page.locator('#tt-shell').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
});
