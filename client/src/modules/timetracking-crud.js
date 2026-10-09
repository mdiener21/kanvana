import { loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { createCustomer, createProject } from './schema.js';
import { EVENT_SCOPE, TT_COLOR_PALETTE } from './constants.js';

// ── Color auto-assignment ──────────────────────────────────────────────────────

function nextCustomerColor(customers) {
  return customers.length % TT_COLOR_PALETTE.length;
}

function nextProjectColor(projects) {
  return projects.length % TT_COLOR_PALETTE.length;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateCustomerName(name, customers, skipId = null) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'EMPTY_NAME' };
  const lower = trimmed.toLowerCase();
  const dup = customers.find((c) => c.id !== skipId && c.name.trim().toLowerCase() === lower);
  if (dup) return { ok: false, reason: 'DUPLICATE_NAME' };
  return { ok: true, name: trimmed };
}

export function validateProjectName(name, customerId, projects, skipId = null) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'EMPTY_NAME' };
  if (!customerId) return { ok: false, reason: 'NO_CUSTOMER' };
  const lower = trimmed.toLowerCase();
  const dup = projects.find(
    (p) => p.id !== skipId && p.customerId === customerId && p.name.trim().toLowerCase() === lower
  );
  if (dup) return { ok: false, reason: 'DUPLICATE_NAME' };
  return { ok: true, name: trimmed };
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export function addCustomer(rawName) {
  const tt = loadTimeTracking();
  const validation = validateCustomerName(rawName, tt.customers);
  if (!validation.ok) return validation;

  const customer = createCustomer(
    { name: validation.name },
    nextCustomerColor(tt.customers)
  );

  scheduleDomainEvent({
    type: 'customer.created',
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: customer.id,
    payload: { customer }
  });
  return { ok: true, customer };
}

export function addProject(customerId, rawName) {
  const tt = loadTimeTracking();
  const validation = validateProjectName(rawName, customerId, tt.projects);
  if (!validation.ok) return validation;

  const project = createProject(
    { customerId, name: validation.name },
    nextProjectColor(tt.projects)
  );

  scheduleDomainEvent({
    type: 'project.created',
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: project.id,
    payload: { project }
  });
  return { ok: true, project };
}
