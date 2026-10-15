import { flushPendingPersists } from './idb-store.js';
import { flushDomainEvents } from './event-sourcing/emitter.js';

function showBanner(message, actionText, action) {
  document.getElementById('pwa-banner')?.remove();
  const banner = document.createElement('section');
  banner.id = 'pwa-banner';
  banner.className = 'pwa-banner';
  banner.setAttribute('aria-label', 'App installation and updates');
  const text = document.createElement('p');
  text.setAttribute('role', 'status');
  text.textContent = message;
  banner.append(text);
  const actions = document.createElement('div');
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-small';
    button.textContent = actionText;
    button.addEventListener('click', async () => {
      button.disabled = true;
      await action();
    });
    actions.append(button);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn-small btn-secondary';
  dismiss.textContent = action ? 'Later' : 'Got it';
  dismiss.addEventListener('click', () => banner.remove());
  actions.append(dismiss);
  banner.append(actions);
  document.body.append(banner);
}

export async function initializePwa() {
  if (!('serviceWorker' in navigator)) return () => {};
  const installButton = document.getElementById('install-app-btn');
  const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installPrompt = null;
  let controlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  const cleanups = [];
  const listen = (target, name, handler) => {
    target.addEventListener(name, handler);
    cleanups.push(() => target.removeEventListener(name, handler));
  };
  const updateInstallButton = () => {
    installButton?.classList.toggle('hidden', installed() || (!installPrompt && !ios));
  };
  updateInstallButton();
  listen(window, 'beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
  });
  listen(window, 'appinstalled', () => {
    installPrompt = null;
    installButton?.classList.add('hidden');
  });
  if (installButton) listen(installButton, 'click', async () => {
    if (!installPrompt) {
      showBanner('To install Kanvana on your iPhone or iPad, open the browser’s Share menu, choose Add to Home Screen, then tap Add.');
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    updateInstallButton();
    await prompt.prompt();
    await prompt.userChoice;
  });
  const flushChanges = async () => {
    await flushDomainEvents();
    await flushPendingPersists();
  };
  listen(navigator.serviceWorker, 'controllerchange', async () => {
    if (!controlled) { controlled = true; return; }
    if (reloading) return;
    reloading = true;
    await flushChanges();
    window.location.reload();
  });
  const registration = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, {
    scope: new URL('./', document.baseURI).pathname,
    updateViaCache: 'none'
  });
  const offerUpdate = () => {
    if (!registration.waiting || !navigator.serviceWorker.controller) return;
    showBanner('A new version of Kanvana is available. Reload when you’ve finished editing.', 'Reload to update', async () => {
      await flushChanges();
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  const watchInstalling = () => {
    const worker = registration.installing;
    if (worker) listen(worker, 'statechange', () => {
      if (worker.state === 'installed') offerUpdate();
    });
  };
  listen(registration, 'updatefound', watchInstalling);
  watchInstalling();
  offerUpdate();
  const checkForUpdate = () => {
    if (document.visibilityState === 'hidden') return;
    offerUpdate();
    registration.update().catch(err => console.error('[Kanvana] PWA update check failed', err));
  };
  listen(window, 'online', checkForUpdate);
  listen(document, 'visibilitychange', checkForUpdate);
  const interval = setInterval(checkForUpdate, 60 * 60 * 1000);
  return () => {
    clearInterval(interval);
    cleanups.forEach(cleanup => cleanup());
    document.getElementById('pwa-banner')?.remove();
  };
}

if (import.meta.env.PROD) {
  initializePwa().catch(err => console.error('[Kanvana] PWA registration failed', err));
}
