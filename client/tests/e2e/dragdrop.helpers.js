import { expect } from '@playwright/test';
import { stableBox } from './board.helpers.js';

// Every Sortable in the app runs with forceFallback, so there is no native drag to
// drive: locator.dragTo() does nothing and real pointer events are the only way in.
// The drop zone is measured after the drag has started on purpose — a collapsed
// column's .tasks list stays hidden until Sortable's onStart calls
// showCollapsedDropZones(), so measuring it up front yields no bounding box.
export async function dragByMouse(page, source, target, { targetY = 10 } = {}) {
  const sourceBox = await stableBox(source, 'drag source');
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 3, { steps: 3 });
  await expect(page.locator('body')).toHaveClass(/dragging/);
  const targetBox = await stableBox(target, 'drop zone');
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + Math.min(targetY, targetBox.height / 2);
  await page.mouse.move(endX, endY, { steps: 20 });
  // Fallback hit-testing runs on a 50 ms interval; allow it and swap animations to settle.
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/dragging/);
}
