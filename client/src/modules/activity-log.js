export const DEFAULT_HUMAN_ACTOR = { type: 'human', id: null };

function isValidActor(actor) {
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return false;
  if (actor.type === 'human') return actor.id === null;
  if (actor.type === 'agent' || actor.type === 'user') return typeof actor.id === 'string' && actor.id.trim() !== '';
  return false;
}

export function createActivityEvent(type, details, actor, at = new Date().toISOString()) {
  if (!isValidActor(actor)) throw new Error('Invalid activity actor');
  return { type, at, actor, details };
}

export function appendTaskActivity(task, event) {
  const activityLog = Array.isArray(task?.activityLog) ? task.activityLog : [];
  return { ...task, activityLog: [...activityLog, event] };
}
