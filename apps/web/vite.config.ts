import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: (id: string): string | undefined => {
          if (id.includes('node_modules')) {
            if (/react-router-dom|\/react\/|\/react-dom\//.test(id)) return 'react-vendor';
            if (id.includes('@tanstack/react-query')) return 'query-vendor';
            if (id.includes('firebase')) return 'firebase-vendor';
            if (id.includes('recharts')) return 'charts-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
