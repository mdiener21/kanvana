import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT || 3100);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

/**
 * Playwright configuration for kanvana E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Live event-sourcing specs need a running PocketBase + the /api proxy;
  // they run via playwright.live.config.js, not the default suite.
  testIgnore: '**/event-sourcing/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
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
    // Force same-origin base. envDir now loads client/.env.local (absolute
    // localhost:8090) for real dev, but the sandboxed test browser can only
    // reach its own origin — pin '/' so the mocked suite stays same-origin.
    env: { VITE_PB_URL: '/' },
  },
});
