import { escapeHtml } from './security.js';
import { resolveWorkWeek, hasTarget } from './timetracking-work-week-model.js';
import { updateCustomerWorkWeek } from './timetracking-crud.js';

// ISO weekdays 1–7.
export const ISO_WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Runs of three or more days read as a range: [1, 3, 4, 5] → "Mon, Wed–Fri".
function workdaysText(workdays) {
  const runs = [];
  for (const day of workdays) {
    const run = runs.at(-1);
    if (run && day === run.at(-1) + 1) run.push(day);
    else runs.push([day]);
  }
  return runs.flatMap((run) => {
    const names = run.map((d) => ISO_WEEKDAY_NAMES[d - 1]);
    return run.length >= 3 ? [`${names[0]}–${names.at(-1)}`] : names;
  }).join(', ');
}

// "40h · Mon–Fri", or "No target" without Weekly hours.
export function workWeekSummary(customer) {
  const workWeek = resolveWorkWeek(customer);
  return hasTarget(workWeek) ? `${workWeek.weeklyHours}h · ${workdaysText(workWeek.workdays)}` : 'No target';
}

// A collapsed disclosure per Customer row; ids carry the Customer id so labels stay unique.
export function workWeekEditorHtml(customer) {
  const { weeklyHours, workdays } = resolveWorkWeek(customer);
  const id = escapeHtml(customer.id);
  const name = escapeHtml(customer.name);
  const hoursId = `tt-work-week-hours-${id}`;
  return `
        <details class="tt-work-week" role="group" aria-label="Work week for ${name}" data-work-week="${id}">
          <summary class="tt-work-week-summary">
            <span class="tt-work-week-title">Work week</span>
            <span class="tt-work-week-value">${escapeHtml(workWeekSummary(customer))}</span>
          </summary>
          <div class="tt-work-week-body">
            <label class="tt-setting" for="${hoursId}">
              <span class="tt-setting-label">Weekly hours</span>
              <input id="${hoursId}" class="tt-input tt-setting-number" type="number" inputmode="decimal"
                step="0.5" min="0.5" placeholder="No target" aria-label="Weekly hours for ${name}"
                data-work-week-hours="${id}" value="${weeklyHours ?? ''}">
            </label>
            <fieldset class="tt-setting tt-workdays" aria-label="Workdays for ${name}">
              <legend class="tt-setting-label">Workdays</legend>
              <div class="tt-workdays-options">
                ${ISO_WEEKDAY_NAMES.map((dayName, i) => {
                  const checked = workdays.includes(i + 1);
                  // At least one Workday must stay ticked.
                  const disabled = checked && workdays.length === 1;
                  return `<label class="tt-workday"><input type="checkbox" value="${i + 1}" data-work-week-day="${id}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${dayName}</label>`;
                }).join('')}
              </div>
            </fieldset>
          </div>
        </details>`;
}

function saveWeeklyHours(input) {
  const raw = input.value.trim();
  const hours = Number(raw);
  // Unparseable typing also reads as '', which must not switch the Target off.
  if (raw === '' && !input.validity.badInput) updateCustomerWorkWeek(input.dataset.workWeekHours, { weeklyHours: null });
  else if (raw !== '' && Number.isFinite(hours) && hours > 0) updateCustomerWorkWeek(input.dataset.workWeekHours, { weeklyHours: hours });
}

function saveWorkdays(box) {
  const id = box.dataset.workWeekDay;
  const boxes = [...box.closest('.tt-workdays').querySelectorAll('[data-work-week-day]')];
  const workdays = boxes.filter((b) => b.checked).map((b) => Number(b.value));
  if (workdays.length > 0) updateCustomerWorkWeek(id, { workdays });
}

// An invalid value saves nothing and emits no event, so `refresh` puts the stored value back.
export function bindWorkWeekEditors(list, refresh) {
  list.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-work-week-hours]')) saveWeeklyHours(ev.target);
    else if (ev.target.matches('[data-work-week-day]')) saveWorkdays(ev.target);
    else return;
    refresh();
  });
}

// The list re-renders wholesale; keep open editors open and the focused control focused.
export function captureWorkWeekState(list) {
  const open = new Set([...list.querySelectorAll('details[data-work-week][open]')].map((d) => d.dataset.workWeek));
  const active = list.contains(document.activeElement) ? document.activeElement : null;
  const focus = active?.matches('[data-work-week-hours]') ? `[data-work-week-hours="${CSS.escape(active.dataset.workWeekHours)}"]`
    : active?.matches('[data-work-week-day]') ? `[data-work-week-day="${CSS.escape(active.dataset.workWeekDay)}"][value="${active.value}"]`
      : active?.matches('details[data-work-week] > summary') ? `details[data-work-week="${CSS.escape(active.parentElement.dataset.workWeek)}"] > summary`
        : null;
  return () => {
    for (const details of list.querySelectorAll('details[data-work-week]')) {
      if (open.has(details.dataset.workWeek)) details.open = true;
    }
    if (focus) list.querySelector(focus)?.focus();
  };
}
