import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { initializePwa } from '../../src/modules/pwa.js';
import { flushPendingPersists } from '../../src/modules/idb-store.js';
import { flushDomainEvents } from '../../src/modules/event-sourcing/emitter.js';

vi.mock('../../src/modules/idb-store.js', () => ({ flushPendingPersists: vi.fn(async () => {}) }));
vi.mock('../../src/modules/event-sourcing/emitter.js', () => ({ flushDomainEvents: vi.fn(async () => {}) }));

let cleanup;
let serviceWorker;
let registration;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<button id="install-app-btn" class="hidden">Install app</button>';
  registration = Object.assign(new EventTarget(), {
    waiting: null, installing: null, update: vi.fn(async () => {})
  });
  serviceWorker = Object.assign(new EventTarget(), {
    controller: {}, register: vi.fn(async () => registration)
  });
  vi.stubGlobal('navigator', { serviceWorker, userAgent: 'Android', platform: 'Linux', maxTouchPoints: 1 });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.unstubAllGlobals();
});

describe('PWA controls', () => {
  it('offers the native install prompt only when the browser makes it available', async () => {
    cleanup = await initializePwa();
    const button = document.getElementById('install-app-btn');
    expect(button.classList.contains('hidden')).toBe(true);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome: 'accepted' })
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(button.classList.contains('hidden')).toBe(false);
    button.click();
    await waitFor(() => expect(event.prompt).toHaveBeenCalledOnce());
    expect(button.classList.contains('hidden')).toBe(true);
  });

  it('provides Add to Home Screen instructions on iOS without a native install event', async () => {
    navigator.userAgent = 'iPhone';
    cleanup = await initializePwa();
    document.getElementById('install-app-btn').click();
    expect(document.getElementById('pwa-banner').textContent).toContain('Share menu');
    expect(document.getElementById('pwa-banner').textContent).toContain('Add to Home Screen');
  });

  it('hides the install control in an installed app', async () => {
    navigator.standalone = true;
    navigator.userAgent = 'iPhone';
    cleanup = await initializePwa();
    expect(document.getElementById('install-app-btn').classList.contains('hidden')).toBe(true);
  });

  it('flushes pending local changes before activating an already waiting update', async () => {
    registration.waiting = { postMessage: vi.fn() };
    cleanup = await initializePwa();
    const buttons = [...document.querySelectorAll('#pwa-banner button')];
    buttons.find(button => button.textContent === 'Reload to update').click();
    await waitFor(() => expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    expect(flushDomainEvents).toHaveBeenCalledOnce();
    expect(flushPendingPersists.mock.invocationCallOrder[0]).toBeLessThan(registration.waiting.postMessage.mock.invocationCallOrder[0]);
  });

  it('detects a newly installed worker and checks updates when the app comes online', async () => {
    cleanup = await initializePwa();
    const worker = Object.assign(new EventTarget(), { state: 'installing' });
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    registration.waiting = { postMessage: vi.fn() };
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(document.getElementById('pwa-banner').textContent).toContain('new version');
    window.dispatchEvent(new Event('online'));
    expect(registration.update).toHaveBeenCalledOnce();
    expect(serviceWorker.register.mock.calls[0][1].updateViaCache).toBe('none');
  });
});
