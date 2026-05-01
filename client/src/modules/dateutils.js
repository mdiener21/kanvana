/**
 * Calculate days until a due date from today.
 * @param {string} dueDate - ISO date string (YYYY-MM-DD)
 * @param {Date} today - Optional today's date (for memoization)
 * @returns {number|null} Days until due (negative if overdue), or null if invalid
 */
export function calculateDaysUntilDue(dueDate, today = null) {
  const dueDateStr = (dueDate || '').toString().trim();
  if (!dueDateStr) return null;

  const dueDateParsed = new Date(dueDateStr + 'T00:00:00');
  if (Number.isNaN(dueDateParsed.getTime())) return null;

  const todayDate = today || new Date();
  todayDate.setHours(0, 0, 0, 0);

  const diffMs = dueDateParsed.getTime() - todayDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Format countdown text based on days until due.
 * Shows months and days if >= 30 days, otherwise just days.
 * @param {number|null} daysUntilDue
 * @returns {string} Formatted countdown (e.g., "3 days", "2 months 5 days", "today", "overdue by 2 days")
 */
export function formatCountdown(daysUntilDue) {
  if (daysUntilDue === null) return '';

  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    if (overdueDays < 30) {
      return `overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
    } else {
      const months = Math.floor(overdueDays / 30);
      const days = overdueDays % 30;
      const monthText = `${months} month${months === 1 ? '' : 's'}`;
      const dayText = days > 0 ? ` ${days} day${days === 1 ? '' : 's'}` : '';
      return `overdue by ${monthText}${dayText}`;
    }
  } else if (daysUntilDue === 0) {
    return 'today';
  } else if (daysUntilDue === 1) {
    return 'tomorrow';
  } else if (daysUntilDue < 30) {
    return `${daysUntilDue} days`;
  } else {
    const months = Math.floor(daysUntilDue / 30);
    const days = daysUntilDue % 30;
    const monthText = `${months} month${months === 1 ? '' : 's'}`;
    const dayText = days > 0 ? ` ${days} day${days === 1 ? '' : 's'}` : '';
    return `${monthText}${dayText}`;
  }
}

/**
 * Get CSS class name for countdown styling based on urgency.
 * @param {number|null} daysUntilDue
 * @param {number} urgentThreshold - Days threshold for urgent (red) warning (default 3)
 * @param {number} warningThreshold - Days threshold for warning (amber) state (default 10)
 * @returns {string} CSS class name
 */
export function getCountdownClassName(daysUntilDue, urgentThreshold = 3, warningThreshold = 10) {
  if (daysUntilDue === null) return 'countdown-none';

  if (daysUntilDue < urgentThreshold) {
    return 'countdown-urgent';
  }

  if (daysUntilDue <= warningThreshold) {
    return 'countdown-warning';
  }

  return 'countdown-normal';
}
