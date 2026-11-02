// A refresh answers for the token it was sent with. Real PocketBase SDK over MSW, because the
// SDK saving every auth response to the shared auth store is the behaviour under guard.
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../mocks/server.js';
import { ensureAuthenticated, getPb, getUser, isAuthenticated, logoutUser, refreshAuth } from '../../../src/modules/sync.js';

const REFRESH = '*/api/collections/users/auth-refresh';
const USER_A = { id: 'user-a', email: 'a@e.st' };
const USER_B = { id: 'user-b', email: 'b@e.st' };

function jwt(user, suffix = 'sig', expiresIn = 3600) {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: user.id, type: 'auth', exp: Math.floor(Date.now() / 1000) + expiresIn })}.${suffix}`;
}

const TOKEN_A = jwt(USER_A);
const TOKEN_A_REFRESHED = jwt(USER_A, 'refreshed');
const TOKEN_B = jwt(USER_B);

// The refresh stays in flight until `answer` is called with its response.
function holdRefresh() {
  let answer;
  const answered = new Promise((res) => { answer = res; });
  let received;
  const arrived = new Promise((res) => { received = res; });
  server.use(http.post(REFRESH, async () => {
    received();
    return answered;
  }));
  return { answer, arrived };
}

const refreshed = () => HttpResponse.json({ token: TOKEN_A_REFRESHED, record: USER_A });
const rejected = () => HttpResponse.json({ message: 'bad token' }, { status: 401 });

describe('auth refresh racing a sign-out or sign-in', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  beforeEach(() => {
    getPb().authStore.clear();
    getPb().authStore.save(TOKEN_A, USER_A);
  });

  it('saves the new token when nothing changed while the refresh was out', async () => {
    const { answer, arrived } = holdRefresh();
    const running = refreshAuth();
    await arrived;
    answer(refreshed());
    await expect(running).resolves.toBe(true);
    expect(getPb().authStore.token).toBe(TOKEN_A_REFRESHED);
  });

  it('keeps a sign-out made while the refresh was out', async () => {
    const { answer, arrived } = holdRefresh();
    const running = refreshAuth();
    await arrived;
    logoutUser();
    answer(refreshed());
    await expect(running).resolves.toBe(false);
    expect(isAuthenticated()).toBe(false);
    expect(getPb().authStore.token).toBe('');
  });

  it('keeps a different account signed in while the refresh was out', async () => {
    const { answer, arrived } = holdRefresh();
    const running = refreshAuth();
    await arrived;
    getPb().authStore.save(TOKEN_B, USER_B);
    answer(refreshed());
    await expect(running).resolves.toBe(true);
    expect(getPb().authStore.token).toBe(TOKEN_B);
    expect(getUser().id).toBe(USER_B.id);
  });

  it('does not sign out a different account when the old token\'s refresh is rejected', async () => {
    const { answer, arrived } = holdRefresh();
    const running = refreshAuth();
    await arrived;
    getPb().authStore.save(TOKEN_B, USER_B);
    answer(rejected());
    await expect(running).resolves.toBe(true);
    expect(getUser().id).toBe(USER_B.id);
  });

  it('still signs out when the token it sent is rejected', async () => {
    const { answer, arrived } = holdRefresh();
    const running = refreshAuth();
    await arrived;
    answer(rejected());
    await expect(running).resolves.toBe(false);
    expect(isAuthenticated()).toBe(false);
  });

  it('applies the same rule to the refresh of an expired token', async () => {
    getPb().authStore.save(jwt(USER_A, 'old', -10), USER_A);
    const { answer, arrived } = holdRefresh();
    const running = ensureAuthenticated();
    await arrived;
    logoutUser();
    answer(refreshed());
    await expect(running).resolves.toBe(false);
    expect(isAuthenticated()).toBe(false);
  });
});
