import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API is proxied under /api so the session cookie is same-origin and the Origin header matches APP_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  build: { target: 'es2022', sourcemap: true },
});
