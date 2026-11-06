import { defineConfig } from 'vite';

import { memeTowerApiMockPlugin } from './vite.memeTowerApiMock';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '',
  plugins: [memeTowerApiMockPlugin()],
  server: {
    allowedHosts: true,
    open: false,
    proxy: {
      '/saturn-api': {
        target: 'http://localhost:5001',
        rewrite: (path) => path.replace(/^\/saturn-api/, ''),
      },
    },
  },
  optimizeDeps: {
    include: ['three', '@dimforge/rapier3d-compat', 'gifuct-js', 'i18next'],
  },
  build: {
    // top-level await для инициализации Rapier (WebAssembly)
    target: 'es2022',
    sourcemap: true,
    // Rapier встраивает WebAssembly в JS (~2 МБ), три.js ~0.6 МБ
    chunkSizeWarningLimit: 5000,
  },
});
