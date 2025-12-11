import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    // Environment variables for production
    'import.meta.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL || '')
  }
});
