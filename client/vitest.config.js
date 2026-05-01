import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests: pure functions, state helpers, validators, storage
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.js'],
  },
});
