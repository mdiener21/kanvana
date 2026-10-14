import { DEFAULT_APP_KEYBINDINGS, matchesKey } from './constants.js';
import { escapeHtml } from './security.js';
import { resolveLinkedFields, adjustLinkedField, describeEntryTimes } from './timetracking-time.js';
import { isProjectActive, projectById, customerById, CRUD_ERROR } from './timetracking-crud.js';

const { ttSubmitInline, ttAdjustUp, ttAdjustDown } = DEFAULT_APP_KEYBINDINGS;

const LINKED_FIELDS = ['date', 'start', 'end', 'duration'];
const ADJUSTABLE_FIELDS = ['start', 'end', 'duration'];
const ADJUST_STEP_MINUTES = 15;

// ── Project labels ─────────────────────────────────────────────────────────────

export function projectLabel(project, tt) {
  return `${customerById(tt, project.customerId)?.name ?? '?'} / ${project.name}`;
}

export function pickableProjects(tt) {
  return tt.projects.filter((p) => isProjectActive(p, tt));
}

// An exact label wins even when archived, so validation can name the real problem.
export function resolveProjectLabel(label, tt) {
  const query = String(label ?? '').trim().toLowerCase();
  if (!query) return null;
  const exact = tt.projects.find((p) => projectLabel(p, tt).toLowerCase() === query);
  if (exact) return exact.id;
  const matches = pickableProjects(tt).filter((p) => projectLabel(p, tt).toLowerCase().includes(query));
  return matches.length === 1 ? matches[0].id : null;
}

// ── Markup ─────────────────────────────────────────────────────────────────────

export function entryFieldsHtml(prefix) {
  return `
    <input id="${prefix}-description" class="tt-input tt-entry-description" data-tt-field="description" type="text"
      placeholder="What are you working on?" aria-label="Description" autocomplete="off" maxlength="500">
    <input id="${prefix}-project" class="tt-input tt-entry-project" data-tt-field="project" type="text"
      list="${prefix}-project-options" placeholder="Customer / Project" aria-label="Project" autocomplete="off">
    <datalist id="${prefix}-project-options"></datalist>
    <input id="${prefix}-date" class="tt-input tt-entry-date" data-tt-field="date" type="text" aria-label="Date" autocomplete="off">
    <input id="${prefix}-start" class="tt-input tt-entry-time" data-tt-field="start" type="text" aria-label="Start" autocomplete="off">
    <span class="tt-entry-sep" aria-hidden="true">–</span>
    <input id="${prefix}-end" class="tt-input tt-entry-time" data-tt-field="end" type="text" aria-label="End" autocomplete="off">
    <span class="tt-plus-day" data-tt-plus-day hidden>+1 day</span>
    <input id="${prefix}-duration" class="tt-input tt-entry-duration" data-tt-field="duration" type="text" aria-label="Duration" autocomplete="off">
  `;
}

// ── Behaviour ──────────────────────────────────────────────────────────────────

export function wireEntryFields(root, { getPrefs, getTimeTracking, onSubmit }) {
  const inputs = Object.fromEntries(
    [...root.querySelectorAll('[data-tt-field]')].map((input) => [input.dataset.ttField, input])
  );
  const plusDay = root.querySelector('[data-tt-plus-day]');
  const projectOptions = root.querySelector('datalist');
  let lastValid = null;

  const typedValues = () => Object.fromEntries(LINKED_FIELDS.map((f) => [f, inputs[f].value]));

  function show(resolved) {
    lastValid = resolved;
    for (const f of LINKED_FIELDS) inputs[f].value = resolved.values[f];
    plusDay.hidden = resolved.plusDays < 1;
    plusDay.textContent = resolved.plusDays > 1 ? `+${resolved.plusDays} days` : '+1 day';
  }

  function setProject(projectId) {
    const tt = getTimeTracking();
    const project = projectById(tt, projectId);
    inputs.project.value = project ? projectLabel(project, tt) : '';
  }

  function normalise(field) {
    const resolved = resolveLinkedFields(typedValues(), field, getPrefs());
    if (resolved) show(resolved);
    else if (lastValid) show(lastValid);
  }

  function submit(field) {
    const changed = LINKED_FIELDS.includes(field) ? field : null;
    const resolved = resolveLinkedFields(typedValues(), changed, getPrefs());
    if (!resolved) {
      onSubmit({ ok: false, reason: CRUD_ERROR.INVALID_TIME });
      return;
    }
    show(resolved);
    onSubmit({
      ok: true,
      entry: {
        projectId: resolveProjectLabel(inputs.project.value, getTimeTracking()) ?? '',
        description: inputs.description.value,
        start: new Date(resolved.startMs).toISOString(),
        end: new Date(resolved.endMs).toISOString()
      }
    });
  }

  function onKeyDown(ev) {
    const field = ev.target.dataset?.ttField;
    if (!field) return;
    if (matchesKey(ev, ttSubmitInline)) {
      ev.preventDefault();
      submit(field);
      return;
    }
    if (!ADJUSTABLE_FIELDS.includes(field)) return;
    const step = matchesKey(ev, ttAdjustUp) ? ADJUST_STEP_MINUTES : matchesKey(ev, ttAdjustDown) ? -ADJUST_STEP_MINUTES : 0;
    if (!step) return;
    ev.preventDefault();
    const adjusted = adjustLinkedField(typedValues(), field, step, getPrefs());
    if (adjusted) show(adjusted);
  }

  const blurHandlers = LINKED_FIELDS.map((f) => [inputs[f], () => normalise(f)]);
  for (const [input, handler] of blurHandlers) input.addEventListener('blur', handler);
  root.addEventListener('keydown', onKeyDown);

  return {
    setEntry({ description = '', projectId = null, startMs, endMs }) {
      inputs.description.value = description;
      setProject(projectId);
      show(describeEntryTimes(startMs, endMs, getPrefs()));
    },
    setProject,
    projectId: () => resolveProjectLabel(inputs.project.value, getTimeTracking()),
    redisplay() {
      if (lastValid) show(describeEntryTimes(lastValid.startMs, lastValid.endMs, getPrefs()));
    },
    refreshProjects() {
      const tt = getTimeTracking();
      projectOptions.innerHTML = pickableProjects(tt)
        .map((p) => `<option value="${escapeHtml(projectLabel(p, tt))}"></option>`)
        .join('');
    },
    focus() {
      inputs.description.focus();
    },
    submit,
    unwire() {
      for (const [input, handler] of blurHandlers) input.removeEventListener('blur', handler);
      root.removeEventListener('keydown', onKeyDown);
    }
  };
}
