import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DOM integration tests: rendered HTML, events, modals, forms
    include: ['tests/dom/**/*.test.js'],
    environment: 'jsdom',
    setupFiles: ['tests/dom/setup.js'],
  },
});
