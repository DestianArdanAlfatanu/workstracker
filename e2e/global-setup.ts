import { execSync } from 'node:child_process';

/** Pastikan akun admin E2E tersedia di database dev sebelum tes berjalan. */
export default function globalSetup() {
  execSync('npx tsx --env-file=.env scripts/e2e-admin.ts', { cwd: 'api', stdio: 'inherit' });
}
