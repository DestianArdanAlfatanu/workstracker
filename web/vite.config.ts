import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        // Pisahkan vendor agar bisa di-cache lintas rilis.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'react-hook-form', '@hookform/resolvers', 'zod'],
          ui: [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            'sonner',
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxy agar cookie refresh token same-origin di development.
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:4000' },
  },
});
