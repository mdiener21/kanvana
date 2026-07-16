import { defineConfig, devices } from '@playwright/test';

// Live e2e config for event-sourcing convergence specs (AC-009). Requires the
// Docker PocketBase stack to be up; specs skip themselves when PB is
// unreachable. The dev server proxies /api → PB (PB_PROXY_TARGET) so the
// sandboxed browser can reach the backend same-origin.
//
//   npm run test:e2e:live
//
// Override the PB target with PB_PROXY_TARGET / VITE_PB_URL if PB is elsewhere.

const e2ePort = Number(process.env.E2E_LIVE_PORT || 3101);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const pbTarget = process.env.PB_PROXY_TARGET || process.env.VITE_PB_URL || 'http://localhost:8090';

export default defineConfig({
  testDir: './tests/e2e/event-sourcing',
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
    env: { PB_PROXY_TARGET: pbTarget, VITE_PB_URL: '/' },
  },
});
