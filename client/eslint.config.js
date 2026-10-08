import globals from 'globals';

export default [
  {
    ignores: ['dist*/**', 'coverage/**', '.playwright-cli/**', 'test-results/**', 'playwright-report/**']
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        __APP_VERSION__: 'readonly',
        __CACHE_VERSION__: 'readonly',
        __PRECACHE_URLS__: 'readonly'
      }
    },
    rules: {
      'no-async-promise-executor': 'error',
      'no-constant-condition': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-redeclare': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'valid-typeof': 'error'
    }
  }
];
