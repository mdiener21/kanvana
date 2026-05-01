import { test, expect } from 'vitest';
import { escapeHtml, formatBytes } from '../../src/modules/security.js';

test('escapeHtml encodes HTML-sensitive characters', () => {
  expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;');
});

test('formatBytes formats small and larger sizes', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(2048)).toBe('2.0 KB');
});