import { test, expect } from '@playwright/test';

/**
 * Tests for board management functionality (manage-boards modal)
 */

test.describe('Boards Management', () => {
  async function openBoardsModal(page) {
    const manageBoardsBtn = page.locator('#manage-boards-btn');
    const menuBtn = page.locator('#desktop-menu-btn');

    // On small layouts the controls menu is collapsed behind the menu button.
    if (!(await manageBoardsBtn.isVisible()) && (await menuBtn.isVisible())) {
      await menuBtn.click();
    }

    await expect(manageBoardsBtn).toBeVisible();
    await manageBoardsBtn.click();

    const modal = page.locator('#boards-modal');
    await expect(modal).toBeVisible();
    return modal;
  }

  test.beforeEach(async ({ page }) => {
    // Navigate to the kanban board
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('#board-container')).toBeVisible();
  });

  test('should open a board when clicking the Open button in manage-boards modal', async ({ page }) => {
    // Get the initial board name
    const initialBrandTextRaw = await page.locator('#brand-text, .brand-text').textContent();
    const initialBrandText = (initialBrandTextRaw || '').trim();

    const modal = await openBoardsModal(page);

    // Ensure there are at least 2 boards (so Open actually switches boards).
    const boardItems = modal.locator('#boards-list .label-item');
    if ((await boardItems.count()) < 2) {
      const addBoardBtn = modal.locator('#add-board-btn');
      await expect(addBoardBtn).toBeVisible();
      await addBoardBtn.click();

      const createModal = page.locator('#board-create-modal');
      await expect(createModal).toBeVisible();

      const nameInput = page.locator('#board-create-name');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Secondary Board');

      const submitBtn = page.locator('#board-create-form button[type="submit"]');
      await expect(submitBtn).toBeVisible();
      await submitBtn.click();

      await expect(createModal).toHaveClass(/hidden/);
      await expect(modal).toBeVisible();
    }

    // After creating a board, the new board becomes active.
    // Switch back to the originally active board via its Open button.
    const targetRow = modal.locator('#boards-list .label-item', { hasText: initialBrandText }).first();
    await expect(targetRow).toBeVisible();

    const openBtn = targetRow.locator('button:has-text("Open")');
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    await expect(page.locator('#brand-text, .brand-text')).toHaveText(new RegExp(initialBrandText));
    await expect(targetRow.locator('.task-label:has-text("Active")')).toBeVisible();
  });

  test('should display multiple boards in the manage-boards modal', async ({ page }) => {
    // Create a few test boards
    const boardNames = ['Board A', 'Board B', 'Board C'];

    const modal = await openBoardsModal(page);

    for (const name of boardNames) {
      const addBoardBtn = modal.locator('#add-board-btn');
      await expect(addBoardBtn).toBeVisible();
      await addBoardBtn.click();

      const createModal = page.locator('#board-create-modal');
      await expect(createModal).toBeVisible();

      const nameInput = page.locator('#board-create-name');
      await expect(nameInput).toBeVisible();
      await nameInput.fill(name);

      const submitBtn = page.locator('#board-create-form button[type="submit"]');
      await expect(submitBtn).toBeVisible();
      await submitBtn.click();

      await expect(createModal).toHaveClass(/hidden/);
      await expect(modal).toBeVisible();
    }
    
    const boardsList = page.locator('#boards-list > div');
    const count = await boardsList.count();
    
    // Should have at least the default board + created boards
    expect(count).toBeGreaterThanOrEqual(boardNames.length);
    
    // Verify all created board names are visible
    for (const name of boardNames) {
      const boardElement = modal.locator('#boards-list').locator(`text=${name}`).first();
      await expect(boardElement).toBeVisible();
    }
  });

  test('should mark the active board in the boards list', async ({ page }) => {
    // Get current active board name
    const currentBrandRaw = await page.locator('#brand-text, .brand-text').textContent();
    const currentBrand = (currentBrandRaw || '').trim();

    const modal = await openBoardsModal(page);
    
    // Find the board item with "Active" badge
    const activeBadge = modal.locator('.task-label:has-text("Active")');
    await expect(activeBadge).toBeVisible();
    
    // Verify the active board has the badge
    const activeBoardText = await activeBadge.locator('..').textContent();
    expect(activeBoardText).toContain(currentBrand);
  });
});
