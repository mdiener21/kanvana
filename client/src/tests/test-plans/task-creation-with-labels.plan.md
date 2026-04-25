# Task Creation with Multiple Labels Test Plan

## Application Overview

Test plan for creating tasks with multiple labels and specific priority settings in the Personal Kanban Board application. The application is a local-first, no-backend kanban board that stores data in browser localStorage, featuring task management with priorities, labels, due dates, and drag-and-drop functionality across columns.

## Test Scenarios

### 1. Task Creation - Happy Path Scenarios

**Seed:** `tests/seed.spec.ts`

#### 1.1. Create task with 2 existing labels and medium priority in To Do column

**File:** `tests/e2e/create-task.spec.ts`

**Steps:**
  1. Navigate to the kanban board application
    - expect: The kanban board loads with three columns: To Do, In Progress, and Done
    - expect: Existing tasks are visible in various columns with different priorities and labels
  2. Click the 'Add task to To Do' button
    - expect: The 'Add New Task' modal dialog opens
    - expect: Title field is focused and marked as required
    - expect: Priority dropdown shows 'Low' as default selection
    - expect: Column dropdown shows 'To Do' as default selection
    - expect: Labels section shows available labels: Urgent, Feature, Task
  3. Enter 'Complete project milestone review' in the Title field
    - expect: Text appears in the title field
  4. Enter 'Review and approve all project deliverables before deadline' in the Description field
    - expect: Description text is entered successfully
  5. Click the Priority dropdown and select 'Medium'
    - expect: Priority dropdown opens with options: Low, Medium, High
    - expect: Medium option is selected and displayed
  6. In the Labels section, click the checkbox next to 'Urgent' label
    - expect: Urgent label checkbox becomes checked
    - expect: Label appears as selected in the interface
  7. Click the checkbox next to 'Feature' label
    - expect: Feature label checkbox becomes checked
    - expect: Both Urgent and Feature labels are now selected
  8. Click the 'Add Task' button
    - expect: Modal closes
    - expect: A new task appears at the top of the To Do column
    - expect: Task displays title 'Complete project milestone review'
    - expect: Task shows medium priority indicator
    - expect: Task displays both 'Urgent' and 'Feature' labels
    - expect: Task shows creation date and age
  9. Verify the new task details
    - expect: Task priority shows as 'medium'
    - expect: Task contains both selected labels
    - expect: Task appears in the correct To Do column
    - expect: Task count in To Do column is incremented

#### 1.2. Create task with 2 existing labels and medium priority in In Progress column

**File:** `tests/e2e/create-task.spec.ts`

**Steps:**
  1. Click the 'Add task to In Progress' button
    - expect: The 'Add New Task' modal opens
    - expect: Column dropdown shows 'In Progress' as selected
  2. Enter 'Implement user authentication system' as the task title
    - expect: Title is entered successfully
  3. Set priority to 'Medium' from the dropdown
    - expect: Medium priority is selected
  4. Select 'Feature' and 'Task' labels by clicking their checkboxes
    - expect: Both Feature and Task labels are checked
    - expect: Both labels appear as selected
  5. Click 'Add Task' button
    - expect: Task is created in the In Progress column
    - expect: Task displays medium priority
    - expect: Task shows both Feature and Task labels
    - expect: Task appears at the top of the In Progress column

#### 1.3. Create task with due date, 2 labels, and medium priority

**File:** `tests/e2e/create-task.spec.ts`

**Steps:**
  1. Click 'Add task to To Do' button
    - expect: Task creation modal opens
  2. Enter 'Finalize quarterly report' as title
    - expect: Title is entered
  3. Select 'Medium' priority
    - expect: Medium priority is selected
  4. Click the Due Date field and enter a future date (e.g., 2026-02-15)
    - expect: Due date field accepts the date input
    - expect: Date is properly formatted
  5. Select 'Urgent' and 'Task' labels
    - expect: Both labels are checked
  6. Click 'Add Task' to create the task
    - expect: Task is created successfully
    - expect: Task displays the due date in its details
    - expect: Task shows medium priority and both labels

### 2. Task Creation - Label Management Scenarios

**Seed:** `tests/seed.spec.ts`

#### 2.1. Create task with 2 new custom labels and medium priority

**File:** `tests/e2e/create-task.spec.ts`

**Steps:**
  1. Click 'Add task to To Do' button
    - expect: Task creation modal opens
  2. Enter 'Design new user interface mockups' as title
    - expect: Title is entered
  3. Select 'Medium' priority from dropdown
    - expect: Medium priority is selected
  4. In the Labels section, click the 'Add a new label' button
    - expect: 'Add Label' modal opens on top of the task creation modal
    - expect: Label Name field is focused and required
    - expect: Group dropdown is empty
    - expect: Color field shows default blue color (#3b82f6)
  5. Enter 'Design' as the label name
    - expect: Label name is entered in the field
  6. Change the color to red by entering '#ef4444' in the hex color field
    - expect: Color field updates to show red color
    - expect: Color picker reflects the red color
  7. Click 'Add Label' button
    - expect: Label modal closes
    - expect: New 'Design' label appears in the available labels list
    - expect: 'Design' label checkbox is automatically checked
  8. Click 'Add a new label' button again to create second label
    - expect: Add Label modal opens again
  9. Enter 'UI/UX' as label name and set color to '#10b981' (green)
    - expect: Label name and color are set
  10. Click 'Add Label' to create the second label
    - expect: Second label 'UI/UX' is added and automatically checked
    - expect: Both new labels are now selected
  11. Click 'Add Task' to create the task
    - expect: Task is created with medium priority
    - expect: Task displays both new custom labels: 'Design' and 'UI/UX'
    - expect: Labels appear with their assigned colors

#### 2.2. Create task with 1 existing and 1 new label, medium priority

**File:** (not implemented)

**Steps:**
  1. Click 'Add task to In Progress' button
    - expect: Task creation modal opens with In Progress column selected
  2. Enter 'Optimize database query performance' as title
    - expect: Title is entered
  3. Set priority to 'Medium'
    - expect: Medium priority is selected
  4. Select the existing 'Feature' label by clicking its checkbox
    - expect: Feature label is checked
  5. Click 'Add a new label' button
    - expect: Add Label modal opens
  6. Create a new label named 'Performance' with color '#f59e0b' (yellow)
    - expect: New Performance label is created and selected
  7. Click 'Add Task' to complete task creation
    - expect: Task is created in In Progress column
    - expect: Task has medium priority
    - expect: Task displays both 'Feature' (existing) and 'Performance' (new) labels

#### 2.3. Filter and select labels using search functionality

**File:** (not implemented)

**Steps:**
  1. Click 'Add task to Done' button
    - expect: Task creation modal opens with Done column selected
  2. Enter 'Archive completed project files' as title and set priority to Medium
    - expect: Title and priority are set
  3. In the labels section, type 'Urg' in the 'Filter available labels' search box
    - expect: Labels list filters to show only 'Urgent' label
    - expect: Other labels are hidden from view
  4. Click the checkbox for 'Urgent' label
    - expect: Urgent label is selected
  5. Clear the search box and type 'Feat'
    - expect: Search filters to show 'Feature' label
    - expect: 'Urgent' remains selected but search focuses on Feature
  6. Select the 'Feature' label
    - expect: Feature label is also selected
    - expect: Both labels are now selected
  7. Clear the search box to see all labels
    - expect: All available labels are visible
    - expect: Both Urgent and Feature show as selected
  8. Click 'Add Task' to create task
    - expect: Task is created in Done column with both Urgent and Feature labels

### 3. Task Creation - Edge Cases and Error Handling

**Seed:** `tests/seed.spec.ts`

#### 3.1. Attempt to create task without required title

**File:** `tests/task-creation/validation-missing-title.spec.ts`

**Steps:**
  1. Click 'Add task to To Do' button
    - expect: Task creation modal opens
  2. Leave the Title field empty
    - expect: Title field remains empty
  3. Set priority to 'Medium' and select 'Urgent' and 'Feature' labels
    - expect: Priority and labels are selected
  4. Click 'Add Task' button
    - expect: Task is not created
    - expect: Form validation prevents submission
    - expect: Title field shows required validation state
    - expect: Modal remains open
  5. Enter a valid title 'Valid task title'
    - expect: Title validation clears
  6. Click 'Add Task' again
    - expect: Task is successfully created with the entered title, medium priority, and selected labels

#### 3.2. Create task with maximum length title and description

**File:** `tests/task-creation/boundary-testing-long-content.spec.ts`

**Steps:**
  1. Click 'Add task to To Do' button
    - expect: Task creation modal opens
  2. Enter a very long title (200+ characters) in the Title field
    - expect: Long title is accepted or truncated appropriately
    - expect: Field handles long input gracefully
  3. Enter a very long description (1000+ characters) in the Description field
    - expect: Long description is accepted
    - expect: Text area expands or scrolls to accommodate content
  4. Set priority to 'Medium' and select 2 labels
    - expect: Priority and labels are set
  5. Click 'Add Task' to create the task
    - expect: Task is created successfully
    - expect: Long title is displayed appropriately in task card
    - expect: Task details show full content when expanded

#### 3.3. Cancel task creation after partial input

**File:** `tests/task-creation/cancel-task-creation.spec.ts`

**Steps:**
  1. Click 'Add task to In Progress' button
    - expect: Task creation modal opens
  2. Enter 'Test task for cancellation' as title
    - expect: Title is entered
  3. Set priority to 'Medium' and select 'Urgent' and 'Task' labels
    - expect: Priority and labels are configured
  4. Click 'Cancel' button
    - expect: Modal closes without creating task
    - expect: No new task appears in any column
    - expect: Board remains in previous state
  5. Click 'Add task to In Progress' again to verify modal resets
    - expect: Modal opens with default values
    - expect: Previous input is not retained
    - expect: Form is clean and ready for new input

#### 3.4. Create task with invalid due date formats

**File:** `tests/task-creation/invalid-due-date-handling.spec.ts`

**Steps:**
  1. Click 'Add task to To Do' button
    - expect: Task creation modal opens
  2. Enter 'Test due date validation' as title
    - expect: Title is entered
  3. Set priority to 'Medium' and select 2 labels
    - expect: Priority and labels are set
  4. Try to enter an invalid date format in Due Date field (e.g., '32/13/2026')
    - expect: Date field handles invalid input appropriately
    - expect: Browser date picker prevents invalid dates or shows validation error
  5. Enter a valid future date
    - expect: Valid date is accepted
  6. Create the task
    - expect: Task is created successfully with valid due date

#### 3.5. Create multiple tasks rapidly (stress testing)

**File:** `tests/task-creation/rapid-task-creation.spec.ts`

**Steps:**
  1. Create first task quickly: title 'Task 1', medium priority, 2 labels
    - expect: First task is created successfully
  2. Immediately click 'Add task' again and create second task: title 'Task 2', medium priority, 2 different labels
    - expect: Second task is created successfully
    - expect: Both tasks appear in correct order
  3. Repeat process for third task with same configuration
    - expect: Third task is created
    - expect: All tasks maintain proper ordering
    - expect: Task counts update correctly
    - expect: Performance remains responsive
  4. Verify all created tasks maintain their properties
    - expect: All tasks show correct priorities, labels, and details
    - expect: No data corruption or loss
    - expect: Tasks retain proper creation timestamps

### 4. Task Creation - Cross-Column and Integration Scenarios

**Seed:** `tests/seed.spec.ts`

#### 4.1. Create medium priority tasks with 2 labels in each column

**File:** `tests/task-creation/cross-column-consistency.spec.ts`

**Steps:**
  1. Create task in To Do column with title 'To Do Task', medium priority, 'Urgent' and 'Feature' labels
    - expect: Task appears correctly in To Do column
  2. Create task in In Progress column with title 'In Progress Task', medium priority, 'Feature' and 'Task' labels
    - expect: Task appears correctly in In Progress column
  3. Create task in Done column with title 'Done Task', medium priority, 'Urgent' and 'Task' labels
    - expect: Task appears correctly in Done column
    - expect: Done task shows completion timestamp
  4. Verify all three tasks maintain consistent formatting and display
    - expect: All tasks show medium priority indicators consistently
    - expect: Labels display with same styling across columns
    - expect: Task counts are updated in all column headers

#### 4.2. Create task and verify data persistence after page refresh

**File:** `tests/task-creation/data-persistence-validation.spec.ts`

**Steps:**
  1. Create a task with title 'Persistence Test Task', medium priority, and 'Urgent' and 'Feature' labels
    - expect: Task is created and visible on the board
  2. Note the exact task details including creation timestamp
    - expect: Task details are fully visible and complete
  3. Refresh the browser page
    - expect: Page reloads successfully
    - expect: Kanban board appears with all data intact
  4. Locate the created task and verify all properties
    - expect: Task is still present with same title
    - expect: Medium priority is maintained
    - expect: Both labels (Urgent and Feature) are still assigned
    - expect: Creation timestamp matches original
    - expect: Task remains in correct column
