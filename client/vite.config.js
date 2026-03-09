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
        calendar: 'src/calendar.html'
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
    open: true
  },
  base: './'
});
