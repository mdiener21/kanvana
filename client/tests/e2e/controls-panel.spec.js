import { test, expect } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';

test.describe('Desktop controls panel', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForBoardReady(page);
  });

  test('opens as a full-height panel on the right and closes with Escape', async ({ page }) => {
    const menuBtn = page.locator('#desktop-menu-btn');
    const panel = page.locator('#board-controls-menu');

    await menuBtn.click();
    await expect(panel).toBeVisible();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-menu-close-btn')).toBeFocused();

    // Measure after the slide-in settles
    await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const box = await panel.boundingBox();
    expect(box.y).toBe(0);
    expect(Math.round(box.x + box.width)).toBe(1280);
    expect(Math.round(box.height)).toBe(800);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(menuBtn).toBeFocused();
  });

  test('closes with its close button', async ({ page }) => {
    await page.locator('#desktop-menu-btn').click();
    await page.locator('#mobile-menu-close-btn').click();
    await expect(page.locator('#board-controls-menu')).toBeHidden();
  });

  test('fits its width on a tablet-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.locator('#desktop-menu-btn').click();
    const panel = page.locator('#board-controls-menu');
    await expect(panel).toBeVisible();

    const { scrollWidth, clientWidth } = await panel.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
