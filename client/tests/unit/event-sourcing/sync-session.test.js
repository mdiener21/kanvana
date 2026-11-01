// #219 AC-007: every state and transition of the sync session, written out by hand.
import { describe, expect, it } from 'vitest';
import { transitionSession } from '../../../src/modules/event-sourcing/sync-session.js';

const STATES = ['signed-out', 'catching-up', 'live', 'offline', 'paused'];
const EVENTS = ['signed-in', 'signed-in-offline', 'signed-out', 'went-online', 'went-offline', 'catch-up-done', 'realtime-reconnected', 'auth-rejected'];

const TRANSITIONS = {
  'signed-out': { 'signed-in': 'catching-up', 'signed-in-offline': 'offline' },
  'catching-up': { 'signed-out': 'signed-out', 'went-offline': 'offline', 'catch-up-done': 'live', 'auth-rejected': 'paused' },
  live: { 'signed-out': 'signed-out', 'went-offline': 'offline', 'realtime-reconnected': 'catching-up', 'auth-rejected': 'paused' },
  offline: { 'signed-out': 'signed-out', 'went-online': 'catching-up' },
  paused: { 'signed-in': 'catching-up', 'signed-in-offline': 'offline', 'signed-out': 'signed-out', 'went-offline': 'offline' },
};

const cases = STATES.flatMap((state) => EVENTS.map((event) => ({
  state, event, next: TRANSITIONS[state][event] ?? state,
})));

describe('sync session transitions (#219)', () => {
  it.each(cases)('$state + $event -> $next', ({ state, event, next }) => {
    expect(transitionSession(state, event)).toBe(next);
  });
});
