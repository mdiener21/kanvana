// Smoke tests that verify the MSW test infrastructure works correctly.
// These tests do not exercise production modules — they exist to confirm
// that MSW intercepts requests and that DOM helpers render and read correctly.
// Add real DOM component tests in separate files that import production modules.
import { getByTestId, waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { exampleApiUrl } from '../mocks/handlers.js';
import { server } from '../mocks/server.js';
import { mountToBody } from './setup.js';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Simulates the fetch-then-render pattern used by production modules.
async function loadExampleItems() {
  const status = getByTestId(document.body, 'api-status');
  try {
    const response = await fetch(exampleApiUrl);
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    const data = await response.json();
    status.textContent = `Loaded ${data.items.length} items`;
  } catch {
    status.textContent = 'Unable to load items';
  }
}

test('MSW intercepts requests and DOM reflects successful response', async () => {
  mountToBody('<section><p data-testid="api-status">Loading…</p></section>');
  await loadExampleItems();
  await waitFor(() => {
    expect(getByTestId(document.body, 'api-status').textContent).toBe('Loaded 2 items');
  });
});

test('MSW per-test handler override causes DOM to reflect error state', async () => {
  server.use(
    http.get(exampleApiUrl, () => HttpResponse.json({ message: 'Boom' }, { status: 500 }))
  );
  mountToBody('<section><p data-testid="api-status">Loading…</p></section>');
  await loadExampleItems();
  await waitFor(() => {
    expect(getByTestId(document.body, 'api-status').textContent).toBe('Unable to load items');
  });
});