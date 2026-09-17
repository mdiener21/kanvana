import { expect } from '@playwright/test';

// #board-container is static markup in index.html, so asserting it is visible proves
// nothing about the app. data-view-mode is set by renderBoard(), so it is the first
// moment the board is real. The timeout is generous because a cold dev server can
// take tens of seconds to transform the module graph on the very first navigation.
export async function waitForBoardReady(page, timeout = 30_000) {
  await expect(page.locator('#board-container'))
    .toHaveAttribute('data-view-mode', /^(columns|swimlanes)$/, { timeout });
}

// The board re-renders several times while booting, and each full render replaces
// the card nodes. Between locating an element and measuring it the node can go away,
// which makes scrollIntoViewIfNeeded throw and boundingBox() return null. Retry the
// whole measurement instead of failing the drag on a node that simply got replaced.
export async function stableBox(locator, label) {
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
