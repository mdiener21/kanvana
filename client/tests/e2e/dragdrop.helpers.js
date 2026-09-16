import { expect } from '@playwright/test';

export async function dragByMouse(page, source, target, { targetY = 10 } = {}) {
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 3, { steps: 3 });
  await expect(page.locator('body')).toHaveClass(/dragging/);
  const targetBox = await target.boundingBox();
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + Math.min(targetY, targetBox.height / 2);
  await page.mouse.move(endX, endY, { steps: 20 });
  // Fallback hit-testing runs on a 50 ms interval; allow it and swap animations to settle.
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/dragging/);
}
