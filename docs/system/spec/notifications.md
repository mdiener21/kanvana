# Notifications

## Purpose

Notifications alert users to tasks with due dates that are approaching or overdue.

## Notification Banner

- Renders below the header and spans the board width
- Appears when a task is overdue or due within the configured upcoming window
- Shows up to 5 tasks with due-date status text and a link to the full modal
- Clicking a banner item opens the task edit modal
- Banner can be dismissed with an X button
- Banner visibility is user-controlled and persisted
- Tasks in the Done column are excluded
- Banner hides automatically when no qualifying tasks remain

## Notifications Modal

- Opened from either the quick-access bell or the menu bell action
- Both bell entry points share the same qualifying-task count badge
- Lists all qualifying tasks with title, due-date status, and priority
- Includes a toggle for banner visibility
- Clicking a notification opens the task edit modal
- Items are sorted by urgency, with the most overdue tasks first
