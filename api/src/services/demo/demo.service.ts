import { DEMO_CREDITS } from '@wt/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '../../lib/http';
import { hashPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { removeUserFiles } from '../../lib/storage';
import { issueTokens } from '../auth.service';
import { seedSampleWorkspace } from './sample-data';

export const DEMO_TTL_HOURS = 24;
const MAX_ACTIVE_DEMOS = Number(process.env.DEMO_MAX_ACTIVE ?? 300);

/**
 * Buat akun demo sementara berisi data contoh lalu terbitkan sesi.
 * Tidak ada email/password yang bisa dipakai login — sesi hanya dari tombol demo.
 */
export async function startDemo() {
  const now = new Date();
  const active = await prisma.user.count({ where: { isDemo: true, demoExpiresAt: { gt: now } } });
  if (active >= MAX_ACTIVE_DEMOS) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Demo sedang ramai dipakai. Coba lagi beberapa menit lagi.');
  }

  const user = await prisma.user.create({
    data: {
      name: 'Pengunjung Demo',
      email: `demo-${randomUUID()}@demo.workstracker.local`,
      // Password acak yang tidak pernah ditampilkan; login biasa juga ditolak untuk akun demo.
      passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
      isDemo: true,
      demoExpiresAt: new Date(now.getTime() + DEMO_TTL_HOURS * 3_600_000),
      // Demo memperlihatkan semua fitur (Premium); hasil AI berupa contoh tanpa biaya.
      plan: 'premium',
      aiCredits: DEMO_CREDITS,
      emailReminders: false,
    },
  });
  try {
    await seedSampleWorkspace(user.id);
  } catch (e) {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    throw e;
  }
  return { user: await prisma.user.findUniqueOrThrow({ where: { id: user.id } }), tokens: await issueTokens(user.id) };
}

/** Hapus akun demo yang sudah kedaluwarsa (beserta seluruh datanya). */
export async function purgeExpiredDemos(now = new Date()) {
  const expired = await prisma.user.findMany({
    where: { isDemo: true, demoExpiresAt: { lt: now } },
    select: { id: true },
    take: 500,
  });
  if (expired.length === 0) return 0;
  const ids = expired.map((u) => u.id);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await Promise.all(ids.map((id) => removeUserFiles(id)));
  return ids.length;
}
