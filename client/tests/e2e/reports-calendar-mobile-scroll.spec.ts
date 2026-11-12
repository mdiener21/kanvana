import { test, expect, devices } from '@playwright/test';

// responsive.css pins <body> to the viewport on phones, so every page must provide its own way to
// reach content below the fold (the tracker once had none: v3.4.14). Reports pages through its
// cards sideways and Calendar scrolls inside <main>. Galaxy S5 / S III size: 360 × 640.
// Wheel input, not scrollIntoView: a programmatic scroll also moves overflow: hidden boxes, which
// would hide exactly the regression this guards against.
test.use({ ...devices['Galaxy S5'] });

test('on a small phone Reports pages sideways to its last report', async ({ page }) => {
  await page.goto('/reports.html');
  const main = page.getByRole('main', { name: 'Reports dashboard' });
  const last = page.getByRole('region', { name: 'Daily updates report' });
  await expect(last).not.toBeInViewport();

  await main.hover();
  const width = await main.evaluate((el) => el.scrollWidth);
  await page.mouse.wheel(width, 0);
  await expect(last).toBeInViewport({ ratio: 0.8 });
});

test('on a short phone screen Calendar scrolls down to the tasks due on the selected day', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });
  await page.goto('/calendar.html');
  const dueList = page.getByLabel('Tasks due on selected date');
  await expect(page.locator('#calendar-grid')).toBeVisible();
  await expect(dueList).not.toBeInViewport({ ratio: 1 });

  await page.locator('main').hover();
  await page.mouse.wheel(0, 2000);
  await expect(dueList).toBeInViewport({ ratio: 1 });
});
