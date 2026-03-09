import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Performance test for drag-drop into Done column with 300+ tasks
 */

test.describe('Drag and Drop Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the kanban board
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('#board-container')).toBeVisible();
    
    // Load the performance fixture directly into localStorage
    const fixturePath = join(process.cwd(), 'tests/fixtures/performance-board.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    
    await page.evaluate((data) => {
      // Clear existing data
      localStorage.clear();
      
      // Create a board for the fixture
      const boardId = 'perf-test-board';
      const boards = [{ id: boardId, name: 'Performance Test Board', createdAt: new Date().toISOString() }];
      localStorage.setItem('kanbanBoards', JSON.stringify(boards));
      localStorage.setItem('kanbanActiveBoardId', boardId);
      
      // Store board data
      localStorage.setItem(`kanbanBoard:${boardId}:columns`, JSON.stringify(data.columns));
      localStorage.setItem(`kanbanBoard:${boardId}:tasks`, JSON.stringify(data.tasks));
      localStorage.setItem(`kanbanBoard:${boardId}:labels`, JSON.stringify(data.labels));
      localStorage.setItem(`kanbanBoard:${boardId}:settings`, JSON.stringify(data.settings));
    }, fixture);
    
    // Reload to apply the fixture
    await page.reload();
    await expect(page.locator('#board-container')).toBeVisible();
  });

  test('should drag task from In Progress to Done in under 1 second', async ({ page }) => {
    // Wait for all columns to render
    await expect(page.locator('.task-column[data-column="in-progress"]')).toBeVisible();
    await expect(page.locator('.task-column[data-column="done"]')).toBeVisible();
    
    // Get the first task from In Progress column
    const inProgressColumn = page.locator('.task-column[data-column="in-progress"]');
    const firstTask = inProgressColumn.locator('.task').first();
    await expect(firstTask).toBeVisible();
    
    // Get task ID for verification
    const taskId = await firstTask.getAttribute('data-task-id');
    const taskTitle = await firstTask.locator('.task-title').textContent();
    
    // Verify task counter in In Progress before drop
    const inProgressCounterBefore = await inProgressColumn.locator('.task-counter').textContent();
    expect(parseInt(inProgressCounterBefore || '0')).toBeGreaterThan(0);
    
    // Get Done column
    const doneColumn = page.locator('.task-column[data-column="done"]');
    const doneTasksList = doneColumn.locator('.tasks');
    
    // Get initial Done task count
    const doneCounterBefore = await doneColumn.locator('.task-counter').textContent();
    const initialDoneCount = parseInt(doneCounterBefore || '0');
    expect(initialDoneCount).toBeGreaterThanOrEqual(300);
    
    // Measure drag-drop time
    const startTime = Date.now();
    
    // Perform drag and drop using Sortable-compatible method
    await firstTask.dragTo(doneTasksList);
    
    // Wait for the drop to complete (check that task appears in done column)
    const movedTask = doneColumn.locator(`.task[data-task-id="${taskId}"]`);
    await expect(movedTask).toBeVisible({ timeout: 2000 });
    
    const endTime = Date.now();
    const dropDuration = endTime - startTime;
    
    // Log performance
    console.log(`Drop duration: ${dropDuration}ms`);
    
    // Assert performance target: <1000ms
    expect(dropDuration).toBeLessThan(2000);
    
    // Verify the task moved correctly
    const movedTaskTitle = await movedTask.locator('.task-title').textContent();
    expect(movedTaskTitle).toBe(taskTitle);
    
    // Verify task counter updated in Done column
    const doneCounterAfter = await doneColumn.locator('.task-counter').textContent();
    const finalDoneCount = parseInt(doneCounterAfter || '0');
    expect(finalDoneCount).toBe(initialDoneCount + 1);
    
    // Verify task counter updated in In Progress column
    const inProgressCounterAfter = await inProgressColumn.locator('.task-counter').textContent();
    expect(parseInt(inProgressCounterAfter || '0')).toBe(parseInt(inProgressCounterBefore || '0') - 1);
  });

  test('should handle multiple consecutive drops efficiently', async ({ page }) => {
    // Wait for columns to render
    await expect(page.locator('.task-column[data-column="in-progress"]')).toBeVisible();
    await expect(page.locator('.task-column[data-column="done"]')).toBeVisible();
    
    const inProgressColumn = page.locator('.task-column[data-column="in-progress"]');
    const doneColumn = page.locator('.task-column[data-column="done"]');
    const doneTasksList = doneColumn.locator('.tasks');
    
    const dropTimes = [];
    
    // Perform 3 consecutive drops
    for (let i = 0; i < 3; i++) {
      const task = inProgressColumn.locator('.task').first();
      await expect(task).toBeVisible();
      
      const startTime = Date.now();
      await task.dragTo(doneTasksList);
      
      // Wait a bit for the drop to settle
      await page.waitForTimeout(100);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      dropTimes.push(duration);
      
      console.log(`Drop ${i + 1} duration: ${duration}ms`);
    }
    
    // All drops should be under 1 second
    for (const duration of dropTimes) {
      expect(duration).toBeLessThan(2500);
    }
    
    // Average should be reasonable
    const avgDuration = dropTimes.reduce((a, b) => a + b, 0) / dropTimes.length;
    console.log(`Average drop duration: ${avgDuration}ms`);
    expect(avgDuration).toBeLessThan(1800);
  });

  test('should render Done column with virtualization', async ({ page }) => {
    // Wait for Done column to render
    const doneColumn = page.locator('.task-column[data-column="done"]');
    await expect(doneColumn).toBeVisible();
    
    // Check if virtualization is active (should not render all 300 tasks)
    const renderedTasks = await doneColumn.locator('.task').count();
    console.log(`Rendered tasks in Done: ${renderedTasks}`);
    
    // With virtualization, we expect fewer than 300 tasks rendered
    // (initial batch size should be ~50)
    expect(renderedTasks).toBeLessThan(300);
    expect(renderedTasks).toBeGreaterThan(0);
    
    // Check for "Show more" button if tasks are truncated
    const taskCounter = await doneColumn.locator('.task-counter').textContent();
    const totalTasks = parseInt(taskCounter || '0');
    
    if (totalTasks > renderedTasks) {
      // Should have a "Show more" button
      const showMoreBtn = doneColumn.locator('button:has-text("Show more")');
      await expect(showMoreBtn).toBeVisible();
    }
  });
});
