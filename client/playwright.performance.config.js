import { defineConfig, devices } from '@playwright/test';

const performancePort = Number(process.env.PERFORMANCE_PORT || 3101);
const baseURL = `http://127.0.0.1:${performancePort}`;

export default defineConfig({
  testDir: './tests/performance',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: 'test-results/performance',
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--enable-precise-memory-info'],
    },
  },
  projects: [
    {
      name: 'chromium-performance',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Measured against a production build, not the dev server: Vite's on-demand
  // transform makes cold startup timings swing several hundred percent between
  // runs, which no stable budget can survive.
  webServer: {
    command: `npm run build -- --outDir ../dist-perf && npm run preview -- --outDir ../dist-perf --host 127.0.0.1 --port ${performancePort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: { VITE_PB_URL: '/' },
  },
});
