import { renderIcons } from './icons.js';
import { initializeThemeToggle } from './theme.js';
import { ensureBoardsInitialized, getActiveBoardId, getActiveBoardName } from './storage.js';
import { loadTasks } from './storage.js';

function isoDateOnly(value) {
  const s = (value || '').toString().trim();
  if (!s) return '';
  if (s.length >= 10) return s.slice(0, 10);
  return '';
}

function formatIsoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatMonthKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function formatMonthLabel(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}

function eachDayInclusive(start, end) {
  const days = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= last) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function weekdayIndexMonday0(date) {
  return (date.getDay() + 6) % 7;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function extractTaskDueDateIso(task) {
  const raw = task?.dueDate ?? task?.['due-date'] ?? '';
  return isoDateOnly(raw);
}

function extractTaskTitle(task) {
  const title = typeof task?.title === 'string' ? task.title.trim() : '';
  if (title) return title;
  const legacy = typeof task?.text === 'string' ? task.text.trim() : '';
  return legacy || 'Untitled task';
}

function isTaskDone(task) {
  if (!task) return false;
  if (task?.column === 'done') return true;
  const doneDate = (task?.doneDate ?? '').toString().trim();
  return doneDate.length > 0;
}

function isTaskOverdue(task, todayIso) {
  const due = extractTaskDueDateIso(task);
  if (!due || due.length < 10) return false;
  if (!todayIso || todayIso.length < 10) return false;
  if (isTaskDone(task)) return false;
  return due < todayIso;
}

function groupTasksByDueDateForMonth(tasks, monthDate, todayIso) {
  const monthKey = formatMonthKey(monthDate);
  const tasksByDate = new Map();
  const overdueCountByDate = new Map();

  for (const task of tasks || []) {
    const due = extractTaskDueDateIso(task);
    if (!due || due.length < 10) continue;
    if (!due.startsWith(monthKey)) continue;
    const list = tasksByDate.get(due) || [];
    list.push(task);

    tasksByDate.set(due, list);

    if (isTaskOverdue(task, todayIso)) {
      overdueCountByDate.set(due, (overdueCountByDate.get(due) || 0) + 1);
    }
  }

  return { tasksByDate, overdueCountByDate };
}

function renderDueDateCalendar({ tasks, monthDate, boardId }) {
  const calendarEl = document.getElementById('calendar-grid');
  const monthLabelEl = document.getElementById('calendar-month-label');
  const listTitleEl = document.getElementById('calendar-list-title');
  const listEl = document.getElementById('calendar-list');
  if (!calendarEl || !monthLabelEl || !listTitleEl || !listEl) return;

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  const todayIso = formatIsoDate(new Date());
  const { tasksByDate, overdueCountByDate } = groupTasksByDueDateForMonth(tasks, monthDate, todayIso);
  const monthKey = formatMonthKey(monthDate);

  const selectedDefault = todayIso.startsWith(monthKey)
    ? todayIso
    : formatIsoDate(monthStart);

  let selectedIso = selectedDefault;

  const renderSelectedList = () => {
    const items = (tasksByDate.get(selectedIso) || []).slice();
    items.sort((a, b) => extractTaskTitle(a).localeCompare(extractTaskTitle(b)));

    listTitleEl.textContent = `Tasks due ${selectedIso} (${items.length})`;
    listEl.textContent = '';

    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'rpt-due-empty';
      li.textContent = 'No tasks due.';
      listEl.appendChild(li);
      return;
    }

    for (const task of items) {
      const li = document.createElement('li');
      li.className = 'rpt-due-item';

      const overdue = isTaskOverdue(task, todayIso);
      if (overdue) li.classList.add('is-overdue');

      const a = document.createElement('a');
      a.className = 'rpt-due-tasklink';
      if (overdue) a.classList.add('is-overdue');
      const id = (task?.id || '').toString();
      const bid = (boardId || '').toString();
      const qs = new URLSearchParams();
      qs.set('openTaskId', id);
      if (bid) qs.set('openTaskBoardId', bid);
      a.href = `./index.html?${qs.toString()}`;
      a.textContent = extractTaskTitle(task);

      li.appendChild(a);
      listEl.appendChild(li);
    }
  };

  const renderGrid = () => {
    monthLabelEl.textContent = formatMonthLabel(monthDate);
    calendarEl.textContent = '';

    const firstDow = weekdayIndexMonday0(monthStart);
    const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() - firstDow);

    const lastDow = weekdayIndexMonday0(monthEnd);
    const gridEnd = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + (6 - lastDow));

    const frag = document.createDocumentFragment();

    const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const label of dows) {
      const el = document.createElement('div');
      el.className = 'rpt-due-dow';
      el.textContent = label;
      frag.appendChild(el);
    }

    const days = eachDayInclusive(gridStart, gridEnd);
    for (const d of days) {
      const iso = formatIsoDate(d);
      const count = tasksByDate.get(iso)?.length || 0;
      const overdueCount = overdueCountByDate.get(iso) || 0;
      const outside = d.getMonth() !== monthDate.getMonth();
      const isToday = iso === todayIso;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rpt-due-day';
      if (outside) btn.classList.add('is-outside');
      if (isToday) btn.classList.add('is-today');
      btn.dataset.date = iso;
      btn.setAttribute('aria-pressed', iso === selectedIso ? 'true' : 'false');
      btn.title = overdueCount > 0
        ? `${iso}: ${count} task${count === 1 ? '' : 's'} due (${overdueCount} overdue)`
        : `${iso}: ${count} task${count === 1 ? '' : 's'} due`;

      const num = document.createElement('div');
      num.className = 'rpt-due-num';
      num.textContent = String(d.getDate());
      btn.appendChild(num);

      if (count > 0) {
        const badge = document.createElement('div');
        badge.className = 'rpt-due-count';
        if (overdueCount > 0) badge.classList.add('is-overdue');
        badge.textContent = String(count);
        btn.appendChild(badge);
      }

      frag.appendChild(btn);
    }

    calendarEl.appendChild(frag);
  };

  const handleCalendarClick = (evt) => {
    const target = evt?.target;
    const btn = target instanceof Element ? target.closest('button.rpt-due-day') : null;
    const iso = btn?.dataset?.date;
    if (!iso) return;

    selectedIso = iso;
    calendarEl.querySelectorAll('button.rpt-due-day[aria-pressed="true"]')
      .forEach((el) => el.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    renderSelectedList();
  };

  if (!calendarEl.dataset.bound) {
    calendarEl.addEventListener('click', handleCalendarClick);
    calendarEl.dataset.bound = 'true';
  }

  renderGrid();
  renderSelectedList();
}

function main() {
  initializeThemeToggle();
  ensureBoardsInitialized();
  renderIcons();

  const boardName = getActiveBoardName();
  const boardId = getActiveBoardId();

  const badge = document.getElementById('calendar-board-badge');
  if (badge) badge.textContent = (boardName || 'Board').slice(0, 2).toUpperCase();

  const tasks = loadTasks();

  let viewMonth = new Date();
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);

  const prevEl = document.getElementById('calendar-prev');
  const nextEl = document.getElementById('calendar-next');

  const update = () => {
    renderDueDateCalendar({ tasks, monthDate: viewMonth, boardId });
  };

  prevEl?.addEventListener('click', () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
    update();
  });

  nextEl?.addEventListener('click', () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    update();
  });

  update();
}

main();
