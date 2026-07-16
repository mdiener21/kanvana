// Task card DOM construction — extracted from render.js

import { isDoneColumnId, loadLabels } from './storage.js';
import { deleteTask } from './tasks.js';
import { showEditModal } from './modals.js';
import { confirmDialog } from './dialog.js';
import { calculateDaysUntilDue, formatCountdown, getCountdownClassName } from './dateutils.js';
import { emit, DATA_CHANGED } from './events.js';
import { labelTextColor } from './utils.js';
import { h, cx } from './dom.js';

function formatDisplayDate(value, locale) {
  const raw = (value || '').toString().trim();
  if (!raw) return '';

  const dateForParse = raw.includes('T') ? raw : `${raw}T00:00:00`;
  const parsed = new Date(dateForParse);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString(locale || undefined);
}

function formatDisplayDateTime(value, locale) {
  const raw = (value || '').toString().trim();
  if (!raw) return '';

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString(locale || undefined);
}

function formatTaskAge(task) {
  const createdRaw = (task?.creationDate || '').toString().trim();
  if (!createdRaw) return '';

  const created = new Date(createdRaw);
  if (Number.isNaN(created.getTime())) return '';

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - created.getTime()) / MS_PER_DAY)
  );

  if (ageDays < 30) {
    return `${ageDays}d`;
  }

  const years = Math.floor(ageDays / 365);
  let remainingDays = ageDays % 365;

  const months = Math.floor(remainingDays / 30);
  remainingDays = remainingDays % 30;

  const parts = [];
  if (years >= 1) parts.push(`${years}y`);
  if (months >= 1) parts.push(`${months}M`);
  parts.push(`${remainingDays}d`);

  return parts.join(' ');
}

export { formatDisplayDate, formatDisplayDateTime };

// Safely convert URLs in text to <a> elements. Returns a DocumentFragment.
// Only http/https URLs are matched; DOM APIs prevent XSS.
export function linkifyText(text) {
  const URL_RE = /https?:\/\/[^\s<>"']+/g;
  const frag = document.createDocumentFragment();
  let last = 0;
  let match;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      frag.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    const a = document.createElement('a');
    a.href = match[0];
    // Guard: only allow http/https even after DOM parsing
    if (a.protocol !== 'https:' && a.protocol !== 'http:') {
      frag.appendChild(document.createTextNode(match[0]));
    } else {
      a.textContent = match[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', (e) => e.stopPropagation());
      frag.appendChild(a);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

export function createTaskElement(task, settings, labelsMap = null, today = null) {
  // Track pointer position to distinguish clicks from drag gestures.
  let pointerDownPos = null;
  const li = h('li', {
    class: 'task',
    draggable: 'true',
    'data-task-id': task.id,
    role: 'listitem',
    'aria-label': `Task: ${task.title || task.text || 'Untitled'}`
  });
  li.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });
  li.addEventListener('click', (e) => {
    if (e.target.closest('.delete-task-btn')) return;
    if (e.target.closest('.task-description a')) return;
    if (pointerDownPos) {
      const dx = Math.abs(e.clientX - pointerDownPos.x);
      const dy = Math.abs(e.clientY - pointerDownPos.y);
      if (dx > 5 || dy > 5) return;
    }
    showEditModal(task.id);
  });

  const labelsContainer = h('div', {
    class: 'task-labels',
    role: 'list',
    'aria-label': 'Task labels'
  });

  const labels = labelsMap || new Map(loadLabels().map(l => [l.id, l]));
  if (task.labels && task.labels.length > 0) {
    task.labels.forEach(labelId => {
      const label = labels instanceof Map ? labels.get(labelId) : labels.find(l => l.id === labelId);
      if (label) {
        labelsContainer.appendChild(h('span', {
          class: 'task-label',
          role: 'listitem',
          style: { backgroundColor: label.color, color: labelTextColor(label.color) }
        }, label.name));
      }
    });
  }

  const showPriority = settings?.showPriority !== false;
  const showDueDate = settings?.showDueDate !== false;

  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  const titleEl = h('div', { class: 'task-title' },
    (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle
  );

  const actions = h('div', { class: 'task-actions' });

  if (showPriority) {
    const rawPriority = typeof task.priority === 'string' ? task.priority.toLowerCase().trim() : '';
    const priority = (['urgent', 'high', 'medium', 'low', 'none'].includes(rawPriority)) ? rawPriority : 'none';
    actions.appendChild(h('span', {
      class: cx('task-priority', `priority-${priority}`, 'task-priority-header'),
      'aria-label': `Priority: ${priority}`
    }, priority));
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.classList.add('delete-task-btn');
  deleteBtn.setAttribute('aria-label', 'Delete task');
  deleteBtn.type = 'button';
  const deleteIcon = document.createElement('span');
  deleteIcon.dataset.lucide = 'trash-2';
  deleteIcon.setAttribute('aria-hidden', 'true');
  deleteBtn.appendChild(deleteIcon);
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: 'Delete task?',
      message: 'This will permanently delete the task. There is no undo.',
      confirmText: 'Delete'
    });
    if (!ok) return;
    if (deleteTask(task.id)) emit(DATA_CHANGED);
  });

  actions.appendChild(deleteBtn);

  const descriptionValue = typeof task.description === 'string' ? task.description.trim() : '';
  const descriptionEl = h('div', {
    class: 'task-description',
    style: { display: descriptionValue ? 'block' : 'none' }
  });
  if (descriptionValue) descriptionEl.appendChild(linkifyText(descriptionValue));

  li.appendChild(h('div', { class: 'task-header' }, titleEl, actions));
  li.appendChild(descriptionEl);
  li.appendChild(labelsContainer);

  if (task.relationships && task.relationships.length > 0) {
    li.appendChild(h('div', { class: 'task-relationships-row' },
      h('span', { 'data-lucide': 'git-branch', 'aria-hidden': 'true' }),
      h('span', {}, `relationships (${task.relationships.length})`)
    ));
  }

  const showChangeDate = settings?.showChangeDate !== false;
  const showAge = settings?.showAge !== false;
  const locale = settings?.locale;

  const footer = h('div', { class: 'task-footer' });

  if (showChangeDate) {
    const changeDisplay = formatDisplayDateTime(task?.changeDate, locale);
    footer.appendChild(h('span', { class: 'task-change-date' },
      changeDisplay ? `Updated ${changeDisplay}` : ''
    ));
  }

  const footerRow = h('div', { class: 'task-footer-row' });

  if (showDueDate) {
    const dueDateRaw = typeof task.dueDate === 'string' ? task.dueDate.trim() : '';
    let dueDateText;
    let dueDateExtraClass;

    if (!dueDateRaw) {
      dueDateText = 'No due date';
      dueDateExtraClass = 'countdown-none';
    } else {
      const formattedDate = formatDisplayDate(dueDateRaw, settings?.locale);
      const daysUntilDue = calculateDaysUntilDue(dueDateRaw, today);

      if (daysUntilDue !== null) {
        const isDone = isDoneColumnId(task.column);
        if (isDone) {
          dueDateText = `Due ${formattedDate}`;
          dueDateExtraClass = 'countdown-none';
        } else {
          const urgentThreshold = settings?.countdownUrgentThreshold ?? 3;
          const warningThreshold = settings?.countdownWarningThreshold ?? 10;
          dueDateExtraClass = getCountdownClassName(daysUntilDue, urgentThreshold, warningThreshold);
          dueDateText = `Due ${formattedDate} (${formatCountdown(daysUntilDue)})`;
        }
      } else {
        dueDateText = 'Due ' + formattedDate;
        dueDateExtraClass = 'countdown-none';
      }
    }

    footerRow.appendChild(h('span', { class: cx('task-date', dueDateExtraClass) }, dueDateText));
  }

  if (showAge) {
    const ageText = formatTaskAge(task);
    footerRow.appendChild(h('span', { class: 'task-age' }, ageText ? `Age ${ageText}` : ''));
  }

  if (task.subTasks && task.subTasks.length > 0) {
    const completed = task.subTasks.filter((s) => s.completed).length;
    const total = task.subTasks.length;
    const pct = Math.round((completed / total) * 100);
    const isComplete = completed === total;

    const stRow = h('span', { class: 'task-subtasks-row' });

    const size = 16;
    const strokeWidth = 2.5;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.classList.add('subtasks-donut');
    svg.setAttribute('aria-hidden', 'true');

    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', size / 2);
    bgCircle.setAttribute('cy', size / 2);
    bgCircle.setAttribute('r', radius);
    bgCircle.classList.add('subtasks-donut-bg');

    const fgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fgCircle.setAttribute('cx', size / 2);
    fgCircle.setAttribute('cy', size / 2);
    fgCircle.setAttribute('r', radius);
    fgCircle.classList.add('subtasks-donut-fill');
    if (isComplete) fgCircle.classList.add('subtasks-donut-complete');
    fgCircle.style.strokeDasharray = circumference;
    fgCircle.style.strokeDashoffset = offset;

    svg.appendChild(bgCircle);
    svg.appendChild(fgCircle);

    stRow.appendChild(svg);
    stRow.appendChild(h('span', {}, `${completed}/${total} Done`));
    footerRow.appendChild(stRow);
  }

  const hasFooterRowContent = Array.from(footerRow.childNodes).some((n) => (n.textContent || '').trim() !== '');
  if (hasFooterRowContent) footer.appendChild(footerRow);

  const hasFooterContent = Array.from(footer.childNodes).some((n) => (n.textContent || '').trim() !== '');
  if (hasFooterContent) li.appendChild(footer);

  return li;
}
