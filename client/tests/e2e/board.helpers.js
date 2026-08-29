import { expect } from '@playwright/test';

// #board-container is static markup in index.html, so asserting it is visible proves
// nothing about the app. data-view-mode is set by renderBoard(), so it is the first
// moment the board is real. The timeout is generous because a cold dev server can
// take tens of seconds to transform the module graph on the very first navigation.
export async function waitForBoardReady(page, timeout = 30_000) {
  await expect(page.locator('#board-container'))
    .toHaveAttribute('data-view-mode', /^(columns|swimlanes)$/, { timeout });
}

// SortableJS defers setting Sortable.active to the next event-loop tick (a
// setTimeout(0) inside _dragStarted). A drag that jumps straight from mousedown to
// the drop point delivers dragover before that tick fires, so _onDragOver sees a
// null Sortable.active, the placeholder never moves, and the drop reverts. Crossing
// the native dragstart threshold first, yielding, then moving in steps and letting
// the placeholder settle before release is what makes the drop land every time.
export async function dragWithPointer(page, source, target, resolveEndPoint) {
  const [sourceBox, targetBox] = await Promise.all([
    stableBox(source, 'drag source'),
    stableBox(target, 'drop zone'),
  ]);

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const { x: endX, y: endY } = resolveEndPoint
    ? resolveEndPoint(targetBox)
    : { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 5, startY + 2);
  await page.waitForTimeout(50);
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.waitForTimeout(30);
  await page.mouse.up();
}

// The board re-renders several times while booting, and each full render replaces
// the card nodes. Between locating an element and measuring it the node can go away,
// which makes scrollIntoViewIfNeeded throw and boundingBox() return null. Retry the
// whole measurement instead of failing the drag on a node that simply got replaced.
async function stableBox(locator, label) {
  let box = null;

  await expect
    .poll(async () => {
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 2_000 });
        box = await locator.boundingBox();
      } catch {
        box = null;
      }
      return box !== null;
    }, { message: `Expected the ${label} to have a bounding box`, timeout: 15_000 })
    .toBe(true);

  return box;
}

// Drops near the top of the drop zone, inside SortableJS's emptyInsertThreshold.
export function nearTopOf(box) {
  return { x: box.x + box.width / 2, y: box.y + Math.min(10, Math.max(2, box.height / 2)) };
}
