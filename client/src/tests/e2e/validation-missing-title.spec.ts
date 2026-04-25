// spec: task-creation-with-labels.plan.md
// seed: tests/e2e/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Task Creation - Edge Cases and Error Handling', () => {
  test('Attempt to create task without required title', async ({ page }) => {
    const modal = page.locator('#task-modal');

    // Navigate to the kanban board application
    await page.goto('/');

    // Click 'Add task to To Do' button
    await page.getByRole('button', { name: 'Add task to To Do' }).click();
    await expect(modal).toBeVisible();

    // Set priority to 'Medium' and select labels without entering title
    await modal.locator('#task-priority').selectOption(['medium']);

    // Select current default labels
    await modal.getByRole('checkbox', { name: 'Goal' }).check();
    await modal.getByRole('checkbox', { name: 'Task' }).check();

    // Click 'Add Task' button - should fail validation
    await modal.getByRole('button', { name: 'Add Task', exact: true }).click();

    // Verify validation prevents task creation
    await expect(modal.getByText('Task title is required')).toBeVisible();
    await expect(modal).toBeVisible();
    
    // Enter a valid title 'Valid task title'
    await modal.locator('#task-title').fill('Valid task title');

    // Click 'Add Task' again - should succeed
    await modal.getByRole('button', { name: 'Add Task', exact: true }).click();

    // Verify task is created successfully
    const task = page.getByRole('listitem', { name: /Task: Valid task title/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Goal' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Task' })).toBeVisible();
  });
});