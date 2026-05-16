import { isDoneColumnId, loadTasks, loadSettings } from './storage.js';
import { showEditModal, setupModalCloseHandlers } from './modals.js';
import { renderIcons } from './icons.js';
import { calculateDaysUntilDue } from './dateutils.js';
import { $id, h } from './dom.js';

const NOTIFICATION_BANNER_HIDDEN_KEY = 'kanbanNotificationBannerHidden';
let bannerResizeTimeout;

function isNotificationBannerHidden() {
  return localStorage.getItem(NOTIFICATION_BANNER_HIDDEN_KEY) === 'true';
}

function setNotificationBannerHidden(hidden) {
  localStorage.setItem(NOTIFICATION_BANNER_HIDDEN_KEY, hidden ? 'true' : 'false');
}

function syncNotificationBannerVisibilityToggle() {
  const toggle = $id('notification-banner-visibility-toggle');
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
      // Exclude tasks in the permanent Done column.
      if (isDoneColumnId(task.column)) return false;

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
  const banner = $id('notification-banner');
  const list = $id('notification-banner-list');
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
    const legacyTitle = typeof task.text === 'string' ? task.text : '';
    const titleText = typeof task.title === 'string' && task.title.trim() ? task.title : legacyTitle;
    const dueStatus = formatDueStatus(task.daysUntilDue, task.dueDate, settings.locale);
    const openTask = () => showEditModal(task.id);

    const item = h('div', {
      class: 'notification-banner-item',
      role: 'button',
      tabindex: '0',
      'aria-label': `Open task: ${task.title}`,
      onClick: openTask,
    },
      h('span', { class: 'task-title' }, titleText),
      h('span', { class: `due-date ${dueStatus.className}` }, dueStatus.text)
    );
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(); }
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
      const more = h('div', {
        class: 'notification-banner-item notification-more',
        role: 'button',
        tabindex: '0',
        onClick: showNotificationsModal,
      }, `+${remaining} `);
      more.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showNotificationsModal(); }
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
      const more = h('div', {
        class: 'notification-banner-item notification-more',
        role: 'button',
        tabindex: '0',
        onClick: showNotificationsModal,
      }, `+${tasks.length - 5} `);
      more.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showNotificationsModal(); }
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
  const list = $id('notifications-list');
  if (!list) return;

  const tasks = getNotificationTasks();
  const settings = loadSettings();
  const thresholdDays = Number.isFinite(settings.notificationDays) ? settings.notificationDays : 3;

  list.innerHTML = '';

  if (tasks.length === 0) {
    list.appendChild(h('div', { class: 'notifications-empty' }, thresholdDays === 0
      ? 'No tasks due today.'
      : `No tasks due within the next ${thresholdDays} day${thresholdDays === 1 ? '' : 's'}.`));
    return;
  }

  tasks.forEach((task) => {
    const legacyTitle = typeof task.text === 'string' ? task.text : '';
    const titleText = typeof task.title === 'string' && task.title.trim() ? task.title : legacyTitle;
    const dueStatus = formatDueStatus(task.daysUntilDue, task.dueDate, settings.locale);
    const priority = typeof task.priority === 'string' ? task.priority : 'none';
    const openTask = () => { hideNotificationsModal(); showEditModal(task.id); };

    const item = h('div', {
      class: 'notification-item',
      role: 'button',
      tabindex: '0',
      'aria-label': `Open task: ${task.title}`,
      onClick: openTask,
    },
      h('div', { class: 'notification-item-content' },
        h('div', { class: 'notification-item-title' }, titleText),
        h('div', { class: 'notification-item-meta' },
          h('span', { class: dueStatus.className }, dueStatus.text),
          h('span', { class: `notification-item-priority priority-${priority}` }, priority)
        )
      ),
      h('span', { class: 'notification-item-arrow', 'data-lucide': 'chevron-right' })
    );
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(); }
    });
    list.appendChild(item);
  });

  renderIcons();
}

/**
 * Update the notification badge count on the bell button.
 */
export function updateNotificationBadge() {
  const badges = ['notification-badge', 'notification-quick-badge'].map($id).filter(Boolean);
  const buttons = ['notifications-btn', 'notifications-quick-btn'].map($id).filter(Boolean);

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
  const modal = $id('notifications-modal');
  modal?.classList.remove('hidden');
}

/**
 * Hide the notifications modal.
 */
export function hideNotificationsModal() {
  const modal = $id('notifications-modal');
  modal?.classList.add('hidden');
}

/**
 * Check if the notifications modal is open.
 */
export function isNotificationsModalOpen() {
  const modal = $id('notifications-modal');
  return modal && !modal.classList.contains('hidden');
}

/**
 * Initialize notification handlers.
 */
export function initializeNotifications() {
  const bannerCloseBtn = $id('notification-banner-close-btn');
  bannerCloseBtn?.addEventListener('click', () => {
    setNotificationBannerHidden(true);
    refreshNotifications();
  });

  const bannerToggle = $id('notification-banner-visibility-toggle');
  bannerToggle?.addEventListener('change', () => {
    setNotificationBannerHidden(!bannerToggle.checked);
    refreshNotifications();
  });

  // Bell button click handlers (menu + quick access)
  const notificationButtons = ['notifications-btn', 'notifications-quick-btn'].map($id).filter(Boolean);
  notificationButtons.forEach((button) => {
    button.addEventListener('click', showNotificationsModal);
  });

  // Close button handler
  const closeBtn = $id('notifications-close-btn');
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
