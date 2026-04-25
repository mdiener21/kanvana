import { loadTasks, loadSettings } from './storage.js';
import { showEditModal, setupModalCloseHandlers } from './modals.js';
import { renderIcons } from './icons.js';
import { calculateDaysUntilDue } from './dateutils.js';

const NOTIFICATION_BANNER_HIDDEN_KEY = 'kanbanNotificationBannerHidden';
let bannerResizeTimeout;

function isNotificationBannerHidden() {
  return localStorage.getItem(NOTIFICATION_BANNER_HIDDEN_KEY) === 'true';
}

function setNotificationBannerHidden(hidden) {
  localStorage.setItem(NOTIFICATION_BANNER_HIDDEN_KEY, hidden ? 'true' : 'false');
}

function syncNotificationBannerVisibilityToggle() {
  const toggle = document.getElementById('notification-banner-visibility-toggle');
  if (!toggle) return;
  toggle.checked = !isNotificationBannerHidden();
}

/**
 * Get all tasks that are due within the threshold or overdue.
 * Excludes tasks in the 'done' column.
 * @returns {Array} Array of task objects with additional `daysUntilDue` property
 */
export function getNotificationTasks() {
  const tasks = loadTasks();
  const settings = loadSettings();
  const thresholdDays = Number.isFinite(settings.notificationDays) ? settings.notificationDays : 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasks
    .filter((task) => {
      // Exclude tasks in 'done' column
      if (task.column === 'done') return false;

      // Must have a due date
      const dueDate = (task.dueDate || '').toString().trim();
      if (!dueDate) return false;

      // Calculate days until due using shared utility
      const daysUntilDue = calculateDaysUntilDue(dueDate, today);
      if (daysUntilDue === null) return false;

      // Include if overdue or within threshold
      return daysUntilDue <= thresholdDays;
    })
    .map((task) => {
      const daysUntilDue = calculateDaysUntilDue(task.dueDate, today);

      return {
        ...task,
        daysUntilDue
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue); // Most urgent first
}

/**
 * Format the due date display text based on days until due.
 * @param {number} daysUntilDue
 * @param {string} dueDate - The original due date string
 * @param {string} locale - Locale for formatting
 * @returns {Object} { text: string, className: string }
 */
function formatDueStatus(daysUntilDue, dueDate, locale) {
  const dueDateParsed = new Date(dueDate + 'T00:00:00');
  const formattedDate = dueDateParsed.toLocaleDateString(locale || undefined);

  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      text: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'} (${formattedDate})`,
      className: 'overdue'
    };
  } else if (daysUntilDue === 0) {
    return {
      text: `Due today (${formattedDate})`,
      className: 'overdue'
    };
  } else if (daysUntilDue === 1) {
    return {
      text: `Due tomorrow (${formattedDate})`,
      className: 'due-soon'
    };
  } else {
    return {
      text: `Due in ${daysUntilDue} days (${formattedDate})`,
      className: 'due-soon'
    };
  }
}

/**
 * Render the notification banner.
 */
export function renderNotificationBanner() {
  const banner = document.getElementById('notification-banner');
  const list = document.getElementById('notification-banner-list');
  if (!banner || !list) return;

  const tasks = getNotificationTasks();
  const settings = loadSettings();

  if (tasks.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  // Respect user preference to hide the banner.
  if (isNotificationBannerHidden()) {
    banner.classList.add('hidden');
    return;
  }

  list.innerHTML = '';

  const isDesktop = window.matchMedia('(min-width: 601px)').matches;
  const createBannerItem = (task) => {
    const item = document.createElement('div');
    item.classList.add('notification-banner-item');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Open task: ${task.title}`);

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('task-title');
    const legacyTitle = typeof task.text === 'string' ? task.text : '';
    titleSpan.textContent =
      typeof task.title === 'string' && task.title.trim() ? task.title : legacyTitle;

    const dueStatus = formatDueStatus(task.daysUntilDue, task.dueDate, settings.locale);
    const dueSpan = document.createElement('span');
    dueSpan.classList.add('due-date', dueStatus.className);
    dueSpan.textContent = dueStatus.text;

    item.appendChild(titleSpan);
    item.appendChild(dueSpan);

    const openTask = () => showEditModal(task.id);
    item.addEventListener('click', openTask);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTask();
      }
    });

    return item;
  };

  if (isDesktop) {
    const availableWidth = list.clientWidth || list.getBoundingClientRect().width;
    let shown = 0;

    for (const task of tasks) {
      const item = createBannerItem(task);
      list.appendChild(item);
      shown += 1;

      // If we overflow and already have at least one item, back out the last addition.
      if (list.scrollWidth > availableWidth && shown > 1) {
        list.removeChild(item);
        shown -= 1;
        break;
      }
    }

    const remaining = tasks.length - shown;
    if (remaining > 0) {
      const more = document.createElement('div');
      more.classList.add('notification-banner-item', 'notification-more');
      more.setAttribute('role', 'button');
      more.setAttribute('tabindex', '0');
      more.textContent = `+${remaining} `;
      more.addEventListener('click', showNotificationsModal);
      more.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showNotificationsModal();
        }
      });

      list.appendChild(more);

      // If adding the indicator overflows, reclaim one more slot for it.
      if (list.scrollWidth > availableWidth && shown > 0) {
        list.removeChild(list.children[shown - 1]);
        shown -= 1;
        const updatedRemaining = tasks.length - shown;
        more.textContent = `+${updatedRemaining} `;
        list.appendChild(more);
      }
    }
  } else {
    const displayTasks = tasks.slice(0, 5);

    displayTasks.forEach((task) => {
      const item = createBannerItem(task);
      list.appendChild(item);
    });

    if (tasks.length > 5) {
      const more = document.createElement('div');
      more.classList.add('notification-banner-item', 'notification-more');
      more.setAttribute('role', 'button');
      more.setAttribute('tabindex', '0');
      more.textContent = `+${tasks.length - 5} `;
      more.addEventListener('click', showNotificationsModal);
      more.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showNotificationsModal();
        }
      });
      list.appendChild(more);
    }
  }

  banner.classList.remove('hidden');
  renderIcons();
}

/**
 * Render the notifications modal content.
 */
function renderNotificationsModalContent() {
  const list = document.getElementById('notifications-list');
  if (!list) return;

  const tasks = getNotificationTasks();
  const settings = loadSettings();
  const thresholdDays = Number.isFinite(settings.notificationDays) ? settings.notificationDays : 3;

  list.innerHTML = '';

  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.classList.add('notifications-empty');
    empty.textContent = thresholdDays === 0
      ? 'No tasks due today.'
      : `No tasks due within the next ${thresholdDays} day${thresholdDays === 1 ? '' : 's'}.`;
    list.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    const item = document.createElement('div');
    item.classList.add('notification-item');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Open task: ${task.title}`);

    const content = document.createElement('div');
    content.classList.add('notification-item-content');

    const title = document.createElement('div');
    title.classList.add('notification-item-title');
    const legacyTitle = typeof task.text === 'string' ? task.text : '';
    title.textContent =
      typeof task.title === 'string' && task.title.trim() ? task.title : legacyTitle;

    const meta = document.createElement('div');
    meta.classList.add('notification-item-meta');

    const dueStatus = formatDueStatus(task.daysUntilDue, task.dueDate, settings.locale);
    const dueSpan = document.createElement('span');
    dueSpan.classList.add(dueStatus.className);
    dueSpan.textContent = dueStatus.text;

    const priority = typeof task.priority === 'string' ? task.priority : 'none';
    const prioritySpan = document.createElement('span');
    prioritySpan.classList.add('notification-item-priority', `priority-${priority}`);
    prioritySpan.textContent = priority;

    meta.appendChild(dueSpan);
    meta.appendChild(prioritySpan);

    content.appendChild(title);
    content.appendChild(meta);

    const arrow = document.createElement('span');
    arrow.classList.add('notification-item-arrow');
    arrow.dataset.lucide = 'chevron-right';

    item.appendChild(content);
    item.appendChild(arrow);

    // Click handler to open task and close modal
    const openTask = () => {
      hideNotificationsModal();
      showEditModal(task.id);
    };
    item.addEventListener('click', openTask);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTask();
      }
    });

    list.appendChild(item);
  });

  renderIcons();
}

/**
 * Update the notification badge count on the bell button.
 */
export function updateNotificationBadge() {
  const badges = [
    document.getElementById('notification-badge'),
    document.getElementById('notification-quick-badge')
  ].filter(Boolean);

  const buttons = [
    document.getElementById('notifications-btn'),
    document.getElementById('notifications-quick-btn')
  ].filter(Boolean);

  if (badges.length === 0) return;

  const tasks = getNotificationTasks();
  const count = tasks.length;
  const label = count === 1 ? '1 notification' : `${count} notifications`;
  const badgeText = count > 99 ? '99+' : String(count);

  if (count === 0) {
    badges.forEach((badge) => {
      badge.classList.add('hidden');
      badge.textContent = '';
    });
    buttons.forEach((button) => {
      button.setAttribute('aria-label', 'Notifications');
      button.removeAttribute('title');
    });
  } else {
    badges.forEach((badge) => {
      badge.classList.remove('hidden');
      badge.textContent = badgeText;
    });
    buttons.forEach((button) => {
      button.setAttribute('aria-label', `Notifications (${label})`);
      button.setAttribute('title', `Notifications (${label})`);
    });
  }
}

/**
 * Show the notifications modal.
 */
export function showNotificationsModal() {
  syncNotificationBannerVisibilityToggle();
  renderNotificationsModalContent();
  const modal = document.getElementById('notifications-modal');
  modal?.classList.remove('hidden');
}

/**
 * Hide the notifications modal.
 */
export function hideNotificationsModal() {
  const modal = document.getElementById('notifications-modal');
  modal?.classList.add('hidden');
}

/**
 * Check if the notifications modal is open.
 */
export function isNotificationsModalOpen() {
  const modal = document.getElementById('notifications-modal');
  return modal && !modal.classList.contains('hidden');
}

/**
 * Initialize notification handlers.
 */
export function initializeNotifications() {
  const bannerCloseBtn = document.getElementById('notification-banner-close-btn');
  bannerCloseBtn?.addEventListener('click', () => {
    setNotificationBannerHidden(true);
    refreshNotifications();
  });

  const bannerToggle = document.getElementById('notification-banner-visibility-toggle');
  bannerToggle?.addEventListener('change', () => {
    setNotificationBannerHidden(!bannerToggle.checked);
    refreshNotifications();
  });

  // Bell button click handlers (menu + quick access)
  const notificationButtons = [
    document.getElementById('notifications-btn'),
    document.getElementById('notifications-quick-btn')
  ].filter(Boolean);
  notificationButtons.forEach((button) => {
    button.addEventListener('click', showNotificationsModal);
  });

  // Close button handler
  const closeBtn = document.getElementById('notifications-close-btn');
  closeBtn?.addEventListener('click', hideNotificationsModal);

  setupModalCloseHandlers('notifications-modal', hideNotificationsModal);

  // Escape key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isNotificationsModalOpen()) {
      hideNotificationsModal();
    }
  });

  // Reflow banner items on viewport resize (debounced)
  window.addEventListener('resize', () => {
    clearTimeout(bannerResizeTimeout);
    bannerResizeTimeout = setTimeout(renderNotificationBanner, 120);
  });

  // Initial render
  refreshNotifications();

  // Keep toggle in sync on load.
  syncNotificationBannerVisibilityToggle();
}

/**
 * Refresh all notification UI elements.
 * Call this after renderBoard() or any task update.
 */
export function refreshNotifications() {
  renderNotificationBanner();
  updateNotificationBadge();
}
