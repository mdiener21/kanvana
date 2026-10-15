import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { waitForBoardReady } from '../e2e/board.helpers.js';

let server;
let origin;
let nextRelease;
let brokenRelease;
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    let path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/kanvana/')) path = path.slice('/kanvana'.length);
    if (path.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"code":200}');
      return;
    }
    if (path === '/') path = '/index.html';
    try {
      let body = await readFile(join(process.env.KANVANA_PWA_TEST_DIR, path));
      if (path === '/sw.js' && nextRelease) {
        body = body.toString().replace(/(CACHE_PREFIX \+ )"[a-f0-9]+"/, '$1"next-release"');
        if (brokenRelease) body = body.replace('"index.html"', '"missing-release.html","index.html"');
      }
      if (path === '/index.html' && nextRelease) {
        body = body.toString().replace(/<title>.*?<\/title>/, '<title>Kanvana updated</title>');
      }
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { nextRelease = false; brokenRelease = false; });

async function boot(page, path = '/') {
  await page.goto(origin + path);
  await waitForBoardReady(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function createTask(page, title) {
  await page.getByRole('button', { name: 'Add task to To Do', exact: true }).click();
  await page.locator('#task-title').fill(title);
  await page.locator('#task-submit-btn').click();
  await expect(page.locator('#task-modal')).toHaveClass(/hidden/);
}

test('mobile install metadata uses branded PNGs and supports subpath hosting', async ({ page }) => {
  await boot(page, '/kanvana/');
  const metadata = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const manifest = await (await fetch(href)).json();
    const icons = await Promise.all([...manifest.icons.map(icon => new URL(icon.src, href).href),
      document.querySelector('link[rel="apple-touch-icon"]').href].map(async src => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }));
    return { manifest, icons, scope: (await navigator.serviceWorker.ready).scope };
  });
  expect(metadata.manifest.display).toBe('standalone');
  expect(metadata.manifest.name).toBe('Kanvana');
  expect(metadata.icons).toEqual([[192, 192], [512, 512], [512, 512], [180, 180]]);
  expect(metadata.scope).toBe(origin + '/kanvana/');
});

test('offline launches preserve tasks and all app views without caching API responses', async ({ page, context }) => {
  await boot(page);
  await createTask(page, 'Keep this offline');
  await page.evaluate(() => fetch('/api/health'));
  await context.setOffline(true);
  await page.reload();
  await waitForBoardReady(page);
  await expect(page.getByRole('listitem', { name: /Keep this offline/ })).toBeVisible();
  const api = await page.evaluate(() => fetch('/api/health').then(() => 'cached').catch(() => 'offline'));
  expect(api).toBe('offline');
  for (const path of ['/reports.html', '/calendar.html', '/impressum.html']) {
    await page.goto(origin + path);
    await expect(page.locator('h1, .rpt-title').first()).toBeVisible();
  }
});

test('a waiting release reloads on request and keeps local tasks across two tabs', async ({ page, context }) => {
  await boot(page);
  await createTask(page, 'Survive an update');
  await page.setViewportSize({ width: 320, height: 740 });
  const second = await context.newPage();
  await boot(second);
  let reloads = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) reloads += 1; });
  nextRelease = true;
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await expect(page.getByRole('button', { name: 'Reload to update' })).toBeVisible();
  const banner = await page.locator('#pwa-banner').boundingBox();
  expect(banner.x).toBeGreaterThanOrEqual(0);
  expect(banner.x + banner.width).toBeLessThanOrEqual(320);
  const updateButton = await page.getByRole('button', { name: 'Reload to update' }).boundingBox();
  expect(updateButton.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: '/tmp/kanvana-pwa-update-mobile.png' });
  await expect(page).not.toHaveTitle('Kanvana updated');
  await page.getByRole('button', { name: 'Reload to update' }).click();
  await expect(page).toHaveTitle('Kanvana updated');
  await expect(second).toHaveTitle('Kanvana updated');
  await waitForBoardReady(page);
  await expect(page.getByRole('listitem', { name: /Survive an update/ })).toBeVisible();
  expect(reloads).toBe(1);
  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle('Kanvana updated');
});

test('an update already waiting when the app opens can still be applied', async ({ page }) => {
  await boot(page);
  nextRelease = true;
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await expect(page.getByRole('button', { name: 'Reload to update' })).toBeVisible();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reload to update' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload to update' }).click();
  await expect(page).toHaveTitle('Kanvana updated');
});

test('a release missing an app file cannot replace the working offline app', async ({ page, context }) => {
  await boot(page);
  nextRelease = true;
  brokenRelease = true;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const finished = new Promise(resolve => registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant') resolve();
      });
    }, { once: true }));
    await registration.update();
    await finished;
  });
  await expect(page.getByRole('button', { name: 'Reload to update' })).toHaveCount(0);
  await context.setOffline(true);
  await page.reload();
  await waitForBoardReady(page);
  await expect(page).not.toHaveTitle('Kanvana updated');
});
