import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    // Add a temporary tunnel hostname only when the frontend itself is
    // exposed through Cloudflare. Provider webhooks should target the backend.
    allowedHosts: (process.env.VITE_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'].includes(err.code)) return;
            console.warn('[vite api proxy error]', err.message);
          });
        }
      }
    }
  }
});
