import { execSync } from 'node:child_process';
import { config } from 'dotenv';

export default function setup() {
  const { DATABASE_URL } = config({ path: '.env.test' }).parsed ?? {};
  if (!DATABASE_URL?.includes('_test')) {
    throw new Error('DATABASE_URL di .env.test harus mengarah ke database *_test');
  }
  // Terapkan migrasi yang belum jalan; data dibersihkan per test lewat resetDb().
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL },
  });
}
