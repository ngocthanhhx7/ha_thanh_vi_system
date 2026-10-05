import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const apiProxy =
  process.env.HTV_VITE_DISABLE_API_PROXY === '1'
    ? {}
    : { '/api': 'http://127.0.0.1:4000', '/uploads': 'http://127.0.0.1:4000' };

export default defineConfig({
  plugins: [react()],
  envDir: process.env.HTV_VITE_ENV_DIR,
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: { port: 4173 },
});
