import { defineConfig, devices } from '@playwright/test';
import { E2E_MAIL_DIR } from './e2e/paths';

/**
 * E2E untuk alur utama. Membutuhkan MySQL berjalan; API memakai database dari api/.env.
 * Global setup membuat akun admin khusus tes (e2e-admin@workstracker.local).
 * Playwright menjalankan server sendiri di port 4100/5180 agar tidak bentrok dengan `npm run dev`.
 * Jalankan: npm run test:e2e
 */
const API_PORT = 4100;
const WEB_PORT = 5180;
const channel = process.env.PW_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 }, channel } },
  ],
  webServer: [
    {
      command: 'npm run dev -w api',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      // AI_FAKE: AI Career Assistant memakai provider palsu (tanpa biaya API).
      // MAIL_PREVIEW: email tidak dikirim, disimpan sebagai file di MAIL_PREVIEW_DIR (dibaca tes lupa password).
      env: {
        PORT: String(API_PORT),
        LOGIN_RATE_LIMIT_MAX: '1000',
        DEMO_RATE_LIMIT_MAX: '1000',
        RESET_RATE_LIMIT_MAX: '1000',
        AI_FAKE: '1',
        MAIL_PREVIEW: '1',
        MAIL_PREVIEW_DIR: E2E_MAIL_DIR,
      },
    },
    {
      command: `npm run dev -w web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
