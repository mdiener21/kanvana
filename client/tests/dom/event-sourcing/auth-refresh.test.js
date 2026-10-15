// PocketBase treats an expired token as a guest instead of answering 401, so a
// stale login silently pushed nothing and pulled nothing while still showing "Live".
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../mocks/server.js';
import {
  getPb,
  initAuthRefresh,
  isAuthenticated,
  _resetAuthRefreshForTesting,
} from '../../../src/modules/sync.js';

const REFRESH_URL = '*/api/collections/users/auth-refresh';
const USER = { id: 'user1', email: 't@e.st' };

function jwt(expiresInSeconds) {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: USER.id, type: 'auth', exp })}.sig`;
}

function serveRefresh(respond) {
  const calls = [];
  server.use(http.post(REFRESH_URL, ({ request }) => {
    calls.push(request.headers.get('Authorization'));
    return respond();
  }));
  return calls;
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

beforeEach(() => {
  _resetAuthRefreshForTesting();
  getPb().authStore.clear();
});

afterEach(() => {
  _resetAuthRefreshForTesting();
  server.resetHandlers();
  getPb().authStore.clear();
  setVisibility('visible');
});

describe('auth refresh', () => {
  it('signs out a login that expired while the app was closed, so the user is asked to log in again', async () => {
    const calls = serveRefresh(() => HttpResponse.json({}, { status: 500 }));
    getPb().authStore.save(jwt(-60), USER);

    initAuthRefresh();

    expect(isAuthenticated()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('renews a still-valid login at startup', async () => {
    const renewed = jwt(7 * 86_400);
    const calls = serveRefresh(() => HttpResponse.json({ token: renewed, record: USER }));
    const old = jwt(3_600);
    getPb().authStore.save(old, USER);

    initAuthRefresh();

    await waitFor(() => expect(getPb().authStore.token).toBe(renewed));
    expect(calls).toEqual([old]);
  });

  it('renews again when the user returns to the tab', async () => {
    const calls = serveRefresh(() => HttpResponse.json({ token: jwt(7 * 86_400), record: USER }));
    getPb().authStore.save(jwt(3_600), USER);
    initAuthRefresh();
    await waitFor(() => expect(calls).toHaveLength(1));

    setVisibility('hidden');
    setVisibility('visible');

    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it('signs out when the server refuses the refresh', async () => {
    serveRefresh(() => HttpResponse.json({ message: 'invalid' }, { status: 401 }));
    getPb().authStore.save(jwt(3_600), USER);

    initAuthRefresh();

    await waitFor(() => expect(isAuthenticated()).toBe(false));
  });

  it('keeps the login when the refresh fails for lack of network', async () => {
    serveRefresh(() => HttpResponse.error());
    const token = jwt(3_600);
    getPb().authStore.save(token, USER);

    initAuthRefresh();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(isAuthenticated()).toBe(true);
    expect(getPb().authStore.token).toBe(token);
  });

  it('does nothing when signed out', async () => {
    const calls = serveRefresh(() => HttpResponse.json({}));

    initAuthRefresh();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toHaveLength(0);
  });
});
