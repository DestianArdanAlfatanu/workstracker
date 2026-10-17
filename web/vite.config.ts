import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: pasang di layar utama, Share Target (bagikan loker dari aplikasi lain), push, offline dasar.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 },
      // SW juga aktif di dev agar Share Target & push bisa diuji di localhost.
      devOptions: { enabled: true, type: 'module', navigateFallback: undefined },
      includeAssets: ['favicon.svg', 'icon-32.png', 'apple-touch-icon.png', 'badge-96.png'],
      manifest: {
        id: '/',
        name: 'WorksTracker',
        short_name: 'WorksTracker',
        description: 'Catat dan pantau semua lamaran kerja di satu tempat',
        lang: 'id',
        start_url: '/?pwa=1',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F8FAFC',
        theme_color: '#1D4ED8',
        categories: ['productivity', 'business'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Tambah lamaran', short_name: 'Tambah', url: '/applications?baru=1', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Tugas', url: '/tasks', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'images', accept: ['image/*'] }],
          },
        },
      },
    }),
  ],
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
  // Tunnel HTTPS untuk uji di HP (npm run tunnel → *.trycloudflare.com).
  preview: {
    port: 4173,
    allowedHosts: ['.trycloudflare.com'],
  },
  server: {
    port: 5173,
    allowedHosts: ['.trycloudflare.com'],
    // Proxy agar cookie refresh token same-origin di development.
    proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:4000' },
  },
});
