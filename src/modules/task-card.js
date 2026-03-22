// Task card DOM construction — extracted from render.js

import { loadLabels } from './storage.js';
import { deleteTask } from './tasks.js';
import { showEditModal } from './modals.js';
import { confirmDialog } from './dialog.js';
import { calculateDaysUntilDue, formatCountdown, getCountdownClassName } from './dateutils.js';
import { DONE_COLUMN_ID } from './constants.js';
import { emit, DATA_CHANGED } from './events.js';

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

// Create a task element
export function createTaskElement(task, settings, labelsMap = null, today = null) {
  const li = document.createElement('li');
  li.classList.add('task');
  li.draggable = true;
  li.dataset.taskId = task.id;
  li.setAttribute('role', 'listitem');
  li.setAttribute('aria-label', `Task: ${task.title || task.text || 'Untitled'}`);

  // Labels container
  const labelsContainer = document.createElement('div');
  labelsContainer.classList.add('task-labels');
  labelsContainer.setAttribute('role', 'list');
  labelsContainer.setAttribute('aria-label', 'Task labels');

  const labels = labelsMap || new Map(loadLabels().map(l => [l.id, l]));
  if (task.labels && task.labels.length > 0) {
    task.labels.forEach(labelId => {
      const label = labels instanceof Map ? labels.get(labelId) : labels.find(l => l.id === labelId);
      if (label) {
        const labelEl = document.createElement('span');
        labelEl.classList.add('task-label');
        labelEl.setAttribute('role', 'listitem');
        labelEl.style.backgroundColor = label.color;
        labelEl.textContent = label.name;
        labelsContainer.appendChild(labelEl);
      }
    });
  }

  const header = document.createElement('div');
  header.classList.add('task-header');

  const showPriority = settings?.showPriority !== false;
  const showDueDate = settings?.showDueDate !== false;

  const titleEl = document.createElement('div');
  titleEl.classList.add('task-title');
  titleEl.setAttribute('role', 'button');
  titleEl.setAttribute('tabindex', '0');
  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  titleEl.textContent = (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  titleEl.addEventListener('click', () => showEditModal(task.id));
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showEditModal(task.id);
    }
  });

  const actions = document.createElement('div');
  actions.classList.add('task-actions');

  if (showPriority) {
    const rawPriority = typeof task.priority === 'string' ? task.priority.toLowerCase().trim() : '';
    const priority = (rawPriority === 'urgent' || rawPriority === 'high' || rawPriority === 'medium' || rawPriority === 'low' || rawPriority === 'none')
      ? rawPriority
      : 'none';
    const priorityEl = document.createElement('span');
    priorityEl.classList.add('task-priority', `priority-${priority}`, 'task-priority-header');
    priorityEl.textContent = priority;
    priorityEl.setAttribute('aria-label', `Priority: ${priority}`);
    priorityEl.setAttribute('role', 'button');
    priorityEl.setAttribute('tabindex', '0');
    priorityEl.title = 'Edit task';
    priorityEl.addEventListener('click', (e) => {
      e.stopPropagation();
      showEditModal(task.id);
    });
    priorityEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showEditModal(task.id);
      }
    });
    actions.appendChild(priorityEl);
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
      title: 'Delete Task',
      message: 'Are you sure you want to delete this task?',
      confirmText: 'Delete'
    });
    if (!ok) return;
    if (deleteTask(task.id)) emit(DATA_CHANGED);
  });

  actions.appendChild(deleteBtn);
  header.appendChild(titleEl);
  header.appendChild(actions);

  const descriptionValue = typeof task.description === 'string' ? task.description.trim() : '';
  const descriptionEl = document.createElement('div');
  descriptionEl.classList.add('task-description');
  descriptionEl.textContent = descriptionValue;
  descriptionEl.style.display = descriptionValue ? 'block' : 'none';
  descriptionEl.addEventListener('click', () => showEditModal(task.id));

  li.appendChild(header);
  li.appendChild(descriptionEl);
  li.appendChild(labelsContainer);

  const showChangeDate = settings?.showChangeDate !== false;
  const showAge = settings?.showAge !== false;
  const locale = settings?.locale;

  const footer = document.createElement('div');
  footer.classList.add('task-footer');

  if (showChangeDate) {
    const changeDateEl = document.createElement('span');
    changeDateEl.classList.add('task-change-date');
    const changeDisplay = formatDisplayDateTime(task?.changeDate, locale);
    changeDateEl.textContent = changeDisplay ? `Updated ${changeDisplay}` : '';
    footer.appendChild(changeDateEl);
  }

  const footerRow = document.createElement('div');
  footerRow.classList.add('task-footer-row');

  if (showDueDate) {
    const dueDateRaw = typeof task.dueDate === 'string' ? task.dueDate.trim() : '';
    const dueDateEl = document.createElement('span');
    dueDateEl.classList.add('task-date');

    if (!dueDateRaw) {
      dueDateEl.textContent = 'No due date';
      dueDateEl.classList.add('countdown-none');
    } else {
      const formattedDate = formatDisplayDate(dueDateRaw, settings?.locale);
      const daysUntilDue = calculateDaysUntilDue(dueDateRaw, today);

      if (daysUntilDue !== null) {
        const countdown = formatCountdown(daysUntilDue);
        const isDone = task.column === DONE_COLUMN_ID;
        if (isDone) {
          dueDateEl.textContent = `Due ${formattedDate}`;
          dueDateEl.classList.add('countdown-none');
        } else {
          const urgentThreshold = settings?.countdownUrgentThreshold ?? 3;
          const warningThreshold = settings?.countdownWarningThreshold ?? 10;
          const countdownClass = getCountdownClassName(daysUntilDue, urgentThreshold, warningThreshold);
          dueDateEl.textContent = `Due ${formattedDate} (${countdown})`;
          dueDateEl.classList.add(countdownClass);
        }
      } else {
        dueDateEl.textContent = 'Due ' + formattedDate;
        dueDateEl.classList.add('countdown-none');
      }
    }

    footerRow.appendChild(dueDateEl);
  }

  if (showAge) {
    const ageEl = document.createElement('span');
    ageEl.classList.add('task-age');
    const ageText = formatTaskAge(task);
    ageEl.textContent = ageText ? `Age ${ageText}` : '';
    footerRow.appendChild(ageEl);
  }

  const hasFooterRowContent = Array.from(footerRow.childNodes).some((n) => (n.textContent || '').trim() !== '');
  if (hasFooterRowContent) footer.appendChild(footerRow);

  const hasFooterContent = Array.from(footer.childNodes).some((n) => (n.textContent || '').trim() !== '');
  if (hasFooterContent) li.appendChild(footer);

  return li;
}
