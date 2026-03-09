// spec: task-creation-with-labels.plan.md
// seed: tests/e2e/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Task Creation - Edge Cases and Error Handling', () => {
  test('Attempt to create task without required title', async ({ page }) => {
    // Navigate to the kanban board application
    await page.goto('http://localhost:3000');

    // Click 'Add task to To Do' button
    await page.getByRole('button', { name: 'Add task to To Do' }).click();

    // Set priority to 'Medium' and select labels without entering title
    await page.getByLabel('Priority', { exact: true }).selectOption(['medium']);

    // Select 'Urgent' label
    await page.getByRole('checkbox', { name: 'Urgent' }).click();

    // Select 'Feature' label
    await page.getByRole('checkbox', { name: 'Feature' }).click();

    // Click 'Add Task' button - should fail validation
    await page.getByRole('button', { name: 'Add Task', exact: true }).click();

    // Verify validation prevents task creation
    await expect(page.getByText('Task title is required')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Add New Task' })).toBeVisible();
    
    // Enter a valid title 'Valid task title'
    await page.getByRole('textbox', { name: 'Title' }).fill('Valid task title');

    // Click 'Add Task' again - should succeed
    await page.getByRole('button', { name: 'Add Task', exact: true }).click();

    // Verify task is created successfully
    const task = page.getByRole('listitem', { name: /Task: Valid task title/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Urgent' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Feature' })).toBeVisible();
  });
});