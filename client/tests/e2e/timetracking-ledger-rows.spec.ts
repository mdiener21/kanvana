import { test, expect, type Locator } from '@playwright/test';
import { logDay, rows, expectRowsAtLeast44pxWithRangeOnOneLine } from './timetracking-ledger.helpers.js';

test.use({ timezoneId: 'Europe/Berlin' });

// WCAG contrast of an element's text against the first opaque background behind it.
function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = ([r, g, b]: number[]) => {
      const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    let node: Element | null = el;
    let background = [255, 255, 255];
    while (node) {
      const value = rgb(getComputedStyle(node).backgroundColor);
      if (value.length === 3 || (value.length === 4 && value[3] === 1)) { background = value.slice(0, 3); break; }
      node = node.parentElement;
    }
    const [a, b] = [luminance(rgb(getComputedStyle(el).color)), luminance(background)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

test('a light project colour shows only on the rail and dot; names meet 4.5:1 in light and dark themes', async ({ page }) => {
  await logDay(page);
  const row = rows(page).filter({ hasText: 'Morning review' });
  const rail = await row.evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
  expect(rail).toBe('rgb(139, 195, 74)');
  await expect(row.locator('.tt-entry-project .tt-color-dot')).toHaveCSS('background-color', 'rgb(139, 195, 74)');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    for (const selected of [false, true]) {
      if (selected) await row.click();
      for (const name of [row.locator('.tt-entry-project'), row.locator('.tt-entry-customer')]) {
        await expect(name).not.toHaveCSS('color', 'rgb(139, 195, 74)');
        expect(await contrastOf(name), `${theme} theme, selected ${selected}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    await page.mouse.move(0, 0);
  }
});

test("each row's duration lines up right-aligned with its day total", async ({ page }) => {
  await logDay(page);
  const total = await page.getByLabel('Total for Today').boundingBox();
  const durations = page.locator('.tt-entry-row .tt-entry-duration');
  await expect(durations).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const box = await durations.nth(i).boundingBox();
    expect(Math.abs((box!.x + box!.width) - (total!.x + total!.width))).toBeLessThanOrEqual(1);
  }
  await expect(durations.first()).toHaveCSS('font-variant-numeric', 'tabular-nums');
});

test('rows are at least 44px tall and start – end stays on one line at any width', async ({ page }) => {
  await logDay(page);
  for (const width of [1280, 700, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await expectRowsAtLeast44pxWithRangeOnOneLine(page);
  }
});

test("today's coverage bar shows a block per entry in its project colour and a now-marker", async ({ page }) => {
  await logDay(page);
  const bar = page.locator('.tt-day').filter({ has: page.getByRole('heading', { name: 'Today' }) }).locator('.tt-day-coverage');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-hidden', 'true');
  await expect(bar.locator('.tt-coverage-block')).toHaveCount(3);
  await expect(bar.locator('.tt-coverage-block').last()).toHaveCSS('background-color', 'rgb(139, 195, 74)');
  await expect(bar.locator('.tt-coverage-now')).toBeVisible();
});
