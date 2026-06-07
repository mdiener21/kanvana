import { defineConfig } from 'vite';

const appVersion = process.env.npm_package_version ?? '0.0.0';

export default defineConfig({
  root: 'src',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  build: {
    rollupOptions: {
      input: {
        index: 'src/index.html',
        reports: 'src/reports.html',
        calendar: 'src/calendar.html',
        impressum: 'src/impressum.html'
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // Reports pulls in ECharts, which can otherwise bloat the reports entry chunk.
          // Split ECharts (and its renderer dependency) into dedicated vendor chunks.
          if (id.includes('/node_modules/echarts/')) return 'vendor-echarts';
          if (id.includes('/node_modules/zrender/')) return 'vendor-zrender';

          // Keep other deps in the default vendor chunk.
          return 'vendor';
        }
      }
    },
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    open: !process.env.CI && !process.env.DOCKER,
    // Opt-in same-origin proxy to PocketBase for live e2e: the sandboxed test
    // browser can only reach its own origin, so a cross-origin call to PB :8090
    // is blocked. Set PB_PROXY_TARGET to route /api through the dev server.
    // Normal dev (no env var) is unaffected.
    proxy: process.env.PB_PROXY_TARGET
      ? { '/api': { target: process.env.PB_PROXY_TARGET, changeOrigin: true } }
      : undefined
  },
  base: './'
});
