import { test, expect } from 'vitest';
import { on, off, emit, BOARD_CHANGED, DATA_CHANGED } from '../../src/modules/events.js';

test('on + emit delivers event with detail', () => {
  let received = null;
  const handler = (e) => { received = e.detail; };
  on('test:event', handler);
  emit('test:event', { foo: 'bar' });
  expect(received).toEqual({ foo: 'bar' });
  off('test:event', handler);
});

test('off removes the handler', () => {
  let callCount = 0;
  const handler = () => { callCount++; };
  on('test:off', handler);
  emit('test:off');
  expect(callCount).toBe(1);
  off('test:off', handler);
  emit('test:off');
  expect(callCount).toBe(1);
});

test('multiple handlers all receive the event', () => {
  let count1 = 0;
  let count2 = 0;
  const h1 = () => { count1++; };
  const h2 = () => { count2++; };
  on('test:multi', h1);
  on('test:multi', h2);
  emit('test:multi');
  expect(count1).toBe(1);
  expect(count2).toBe(1);
  off('test:multi', h1);
  off('test:multi', h2);
});

test('emit with no subscribers does not throw', () => {
  expect(() => emit('test:no-sub', { data: 1 })).not.toThrow();
});

test('BOARD_CHANGED constant has expected value', () => {
  expect(BOARD_CHANGED).toBe('board:changed');
});

test('DATA_CHANGED constant has expected value', () => {
  expect(DATA_CHANGED).toBe('data:changed');
});
