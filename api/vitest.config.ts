import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const testEnv = config({ path: '.env.test' }).parsed ?? {};

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./test/globalSetup.ts'],
    // Semua file memakai satu database test, jadi dijalankan berurutan.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
