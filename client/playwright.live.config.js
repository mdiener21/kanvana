import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

// Live e2e config for the event-sourcing specs. With no target it builds backend/Dockerfile and
// runs a throwaway PocketBase on an unused port, with no volume, removed afterwards, so a run can
// never reach the Docker stack and its pb_data volume on :8090. PB_PROXY_TARGET uses a PocketBase
// you run yourself instead. Either way a PocketBase that is not healthy fails the run in global
// setup, rather than the specs skipping themselves. The dev server proxies /api to it, so the
// sandboxed browser can reach it same-origin.
//
//   npm run test:e2e:live

const e2ePort = Number(process.env.E2E_LIVE_PORT || 3101);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

// Set in the environment because workers load this file again, and specs read PB_PROXY_TARGET.
if (!process.env.PB_PROXY_TARGET) {
  const pickPort = "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
  const port = execFileSync(process.execPath, ['-e', pickPort], { encoding: 'utf8' }).trim();
  process.env.LIVE_PB_THROWAWAY_PORT = port;
  process.env.PB_PROXY_TARGET = `http://127.0.0.1:${port}`;
}

export default defineConfig({
  testDir: './tests/e2e/event-sourcing',
  globalSetup: './tests/e2e/event-sourcing/live-pocketbase.setup.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    // PB_PROXY_TARGET routes /api → PB. VITE_PB_URL='/' keeps the app
    // same-origin so it calls /api (proxied) instead of PB cross-origin —
    // required now that envDir loads client/.env.local's absolute URL.
    env: { PB_PROXY_TARGET: process.env.PB_PROXY_TARGET, VITE_PB_URL: '/' },
  },
});
