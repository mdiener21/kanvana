import { test, expect } from 'vitest';
import {
  calculateDaysUntilDue,
  formatCountdown,
  getCountdownClassName
} from '../../src/modules/dateutils.js';

// Fixed reference date for deterministic tests
const today = new Date('2024-06-15T00:00:00');

// ── calculateDaysUntilDue ───────────────────────────────────────────

test('calculateDaysUntilDue returns 0 when due today', () => {
  expect(calculateDaysUntilDue('2024-06-15', new Date('2024-06-15T00:00:00'))).toBe(0);
});

test('calculateDaysUntilDue returns 1 when due tomorrow', () => {
  expect(calculateDaysUntilDue('2024-06-16', new Date('2024-06-15T00:00:00'))).toBe(1);
});

test('calculateDaysUntilDue returns negative when overdue', () => {
  expect(calculateDaysUntilDue('2024-06-12', new Date('2024-06-15T00:00:00'))).toBe(-3);
});

test('calculateDaysUntilDue returns positive for future date', () => {
  expect(calculateDaysUntilDue('2024-07-15', new Date('2024-06-15T00:00:00'))).toBe(30);
});

test('calculateDaysUntilDue returns null for empty string', () => {
  expect(calculateDaysUntilDue('', today)).toBeNull();
});

test('calculateDaysUntilDue returns null for invalid date', () => {
  expect(calculateDaysUntilDue('not-a-date', today)).toBeNull();
  expect(calculateDaysUntilDue(null, today)).toBeNull();
});

// ── formatCountdown ─────────────────────────────────────────────────

test('formatCountdown returns empty string for null', () => {
  expect(formatCountdown(null)).toBe('');
});

test('formatCountdown returns today for 0 days', () => {
  expect(formatCountdown(0)).toBe('today');
});

test('formatCountdown returns tomorrow for 1 day', () => {
  expect(formatCountdown(1)).toBe('tomorrow');
});

test('formatCountdown returns day count for 2-29 days', () => {
  expect(formatCountdown(5)).toBe('5 days');
  expect(formatCountdown(29)).toBe('29 days');
});

test('formatCountdown returns months and days for 30+ days', () => {
  expect(formatCountdown(30)).toBe('1 month');
  expect(formatCountdown(35)).toBe('1 month 5 days');
  expect(formatCountdown(60)).toBe('2 months');
  expect(formatCountdown(61)).toBe('2 months 1 day');
});

test('formatCountdown returns overdue with singular day', () => {
  expect(formatCountdown(-1)).toBe('overdue by 1 day');
});

test('formatCountdown returns overdue with plural days', () => {
  expect(formatCountdown(-3)).toBe('overdue by 3 days');
});

test('formatCountdown returns overdue with months', () => {
  expect(formatCountdown(-45)).toBe('overdue by 1 month 15 days');
  expect(formatCountdown(-60)).toBe('overdue by 2 months');
});

// ── getCountdownClassName ───────────────────────────────────────────

test('getCountdownClassName returns countdown-none for null', () => {
  expect(getCountdownClassName(null)).toBe('countdown-none');
});

test('getCountdownClassName returns countdown-urgent within threshold', () => {
  expect(getCountdownClassName(0)).toBe('countdown-urgent');
  expect(getCountdownClassName(2)).toBe('countdown-urgent');
  expect(getCountdownClassName(-1)).toBe('countdown-urgent');
});

test('getCountdownClassName returns countdown-warning within threshold', () => {
  expect(getCountdownClassName(3)).toBe('countdown-warning');
  expect(getCountdownClassName(10)).toBe('countdown-warning');
});

test('getCountdownClassName returns countdown-normal beyond thresholds', () => {
  expect(getCountdownClassName(11)).toBe('countdown-normal');
  expect(getCountdownClassName(30)).toBe('countdown-normal');
});

test('getCountdownClassName respects custom thresholds', () => {
  expect(getCountdownClassName(5, 7, 14)).toBe('countdown-urgent');
  expect(getCountdownClassName(10, 7, 14)).toBe('countdown-warning');
  expect(getCountdownClassName(20, 7, 14)).toBe('countdown-normal');
});
