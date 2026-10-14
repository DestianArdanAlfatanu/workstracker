/**
 * Menyiapkan akun admin khusus E2E (development saja) agar tes tidak bergantung
 * pada password admin asli. Dipanggil oleh global setup Playwright.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

export const E2E_ADMIN_EMAIL = 'e2e-admin@workstracker.local';
const password = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-12345';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Akun admin E2E tidak boleh dibuat di production');
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: E2E_ADMIN_EMAIL },
    update: { passwordHash, role: 'admin', status: 'active', mustChangePassword: false },
    create: { email: E2E_ADMIN_EMAIL, name: 'Admin E2E', passwordHash, role: 'admin', emailReminders: false },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
