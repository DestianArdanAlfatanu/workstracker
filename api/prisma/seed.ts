/**
 * Data demo (development saja):
 * - admin@workstracker.local / admin12345 (admin)
 * - demo@workstracker.local / demo12345 dengan beberapa lamaran
 * - beberapa pembeli contoh untuk halaman admin
 * Aman dijalankan ulang — lamaran user demo dibuat ulang.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { SAMPLE_APPLICATIONS, seedSampleWorkspace } from '../src/services/demo/sample-data';

const prisma = new PrismaClient();
const day = 86_400_000;
const date = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * day);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
};

const SAMPLE_BUYERS = [
  { name: 'Rina Kartika', email: 'rina@contoh.id', whatsapp: '6281234567801', daysAgo: 150, price: 49_000 },
  { name: 'Bagus Pratama', email: 'bagus@contoh.id', whatsapp: '6281234567802', daysAgo: 95, price: 49_000 },
  { name: 'Sari Wulandari', email: 'sari@contoh.id', whatsapp: '6281234567803', daysAgo: 40, price: 59_000 },
  { name: 'Dimas Saputra', email: 'dimas@contoh.id', whatsapp: '6281234567804', daysAgo: 5, price: 59_000, suspended: true },
];

async function seedAccounts() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed hanya untuk development. Gunakan `npm run admin:create` di production.');
  }
  const hash = await bcrypt.hash('demo12345', 12);

  await prisma.user.upsert({
    where: { email: 'admin@workstracker.local' },
    update: { role: 'admin', status: 'active' },
    create: {
      name: 'Admin WorksTracker',
      email: 'admin@workstracker.local',
      role: 'admin',
      passwordHash: await bcrypt.hash('admin12345', 12),
    },
  });

  for (const b of SAMPLE_BUYERS) {
    const license = { whatsapp: b.whatsapp, purchasedAt: date(-b.daysAgo), price: b.price, notes: 'Data contoh' };
    await prisma.user.upsert({
      where: { email: b.email },
      update: { license: { upsert: { create: license, update: license } } },
      create: {
        name: b.name,
        email: b.email,
        passwordHash: hash,
        status: b.suspended ? 'suspended' : 'active',
        emailReminders: false,
        lastLoginAt: b.suspended ? null : new Date(Date.now() - b.daysAgo * 0.2 * day),
        license: { create: license },
      },
    });
  }
}

async function main() {
  await seedAccounts();
  const email = 'demo@workstracker.local';
  const demoLicense = { whatsapp: '6281200000000', purchasedAt: date(-20), price: 49_000, notes: 'Akun demo' };
  const user = await prisma.user.upsert({
    where: { email },
    update: { license: { upsert: { create: demoLicense, update: demoLicense } } },
    create: {
      name: 'Pengguna Demo',
      email,
      passwordHash: await bcrypt.hash('demo12345', 12),
      license: { create: demoLicense },
    },
  });
  await seedSampleWorkspace(user.id, prisma);
  await prisma.user.update({ where: { id: user.id }, data: { aiEnabled: true, aiMonthlyLimit: 30 } });

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@workstracker.local' } });
  await prisma.announcement.deleteMany({ where: { createdById: admin.id } });
  await prisma.announcement.create({
    data: {
      title: 'Fitur baru: Board Kanban, Kalender & Tugas',
      body: 'Sekarang kamu bisa menggeser lamaran antar status di tampilan Board, melihat jadwal di Kalender, dan mencatat to-do per lamaran.',
      level: 'update',
      published: true,
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });

  console.log('Seed selesai:');
  console.log('  Admin   : admin@workstracker.local (password awal admin12345; tidak diubah bila akun sudah ada)');
  console.log(`  Pembeli : ${email} / demo12345 (${SAMPLE_APPLICATIONS.length} lamaran)`);
  console.log(`  + ${SAMPLE_BUYERS.length} pembeli contoh (password demo12345)`);
}

main().finally(() => prisma.$disconnect());