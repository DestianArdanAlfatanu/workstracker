/**
 * Membuat akun admin (pemilik aplikasi) — dipakai sekali saat setup production.
 *
 *   npm run admin:create -w api -- --email kamu@domain.com --name "Nama Kamu"
 *   npm run admin:create -w api -- --promote email@yang.sudah.ada
 *
 * Password acak dicetak sekali di terminal; wajib diganti saat login pertama.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      promote: { type: 'string' },
    },
  });

  if (values.promote) {
    const email = values.promote.trim().toLowerCase();
    const user = await prisma.user.update({ where: { email }, data: { role: 'admin', status: 'active' } }).catch(() => null);
    if (!user) throw new Error(`User dengan email ${email} tidak ditemukan`);
    console.log(`✔ ${email} sekarang admin.`);
    return;
  }

  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !name) {
    throw new Error('Gunakan: --email <email> --name "<nama>"  atau  --promote <email>');
  }
  const password = randomBytes(9).toString('base64url');
  await prisma.user.create({
    data: { email, name, role: 'admin', mustChangePassword: true, passwordHash: await hashPassword(password) },
  });
  console.log('✔ Admin dibuat. Simpan kredensial ini (hanya ditampilkan sekali):');
  console.log(`  Email    : ${email}`);
  console.log(`  Password : ${password}`);
}

main()
  .catch((e) => {
    console.error(`✘ ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
