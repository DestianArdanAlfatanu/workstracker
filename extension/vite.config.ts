/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Manifest V3 dibuat saat build agar alamat WorksTracker (VITE_WT_URL) cukup diatur di satu tempat.
 * Development: http://localhost:5173 (website + proxy API). Produksi: domain asli, mis. https://workstracker.id
 */
function manifest(wtUrl: string, e2eKey?: string): Plugin {
  const origin = new URL(wtUrl);
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  return {
    name: 'wt-manifest',
    generateBundle() {
      const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(
          {
            manifest_version: 3,
            name: 'WorksTracker — Simpan Lowongan',
            short_name: 'WorksTracker',
            version: pkg.version,
            description:
              'Simpan lowongan dari LinkedIn, Jobstreet, Glints, Dealls, Kalibrr, KitaLulus, Loker.id, Indeed, Karirhub, Instagram, dan situs karier ke WorksTracker dengan satu klik.',
            action: { default_popup: 'popup.html', default_title: 'Simpan ke WorksTracker', default_icon: icons },
            icons,
            // activeTab: halaman hanya dibaca saat ikon diklik (tanpa izin "baca semua situs").
            permissions: ['activeTab', 'scripting', 'storage'],
            // Hanya domain WorksTracker (untuk memakai sesi login website).
            host_permissions: [`${origin.protocol}//${origin.hostname}/*`, ...(e2eKey ? ['<all_urls>'] : [])],
            // Build uji otomatis saja: ID extension tetap & izin membaca halaman uji.
            ...(e2eKey ? { key: e2eKey } : {}),
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const wtUrl = env.VITE_WT_URL || 'http://localhost:5173';
  const e2eKey = env.VITE_E2E_KEY || undefined;
  return {
    plugins: [react(), manifest(wtUrl, e2eKey)],
    define: {
      'import.meta.env.VITE_WT_URL': JSON.stringify(wtUrl),
      'import.meta.env.VITE_E2E': JSON.stringify(e2eKey ? '1' : ''),
    },
    build: {
      outDir: e2eKey ? 'dist-e2e' : 'dist',
      emptyOutDir: true,
      // Kode extension tidak boleh memuat skrip dari luar; semua dibundel.
      modulePreload: false,
      rollupOptions: { input: { popup: 'popup.html' } },
    },
    test: { environment: 'jsdom' },
  };
});