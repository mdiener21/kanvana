import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pwa',
  globalSetup: './tests/pwa/setup.mjs',
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'] }
});
