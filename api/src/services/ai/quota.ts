import { todayISO } from '@wt/shared';
import { AppError } from '../../lib/http';
import { prisma } from '../../lib/prisma';

/** Awal bulan berjalan (WIB) sebagai Date UTC. */
export const monthStart = (now = new Date()) => new Date(`${todayISO(now).slice(0, 7)}-01T00:00:00+07:00`);

/** Hanya generasi yang berhasil yang menghitung kuota. */
export function usedThisMonth(userId: bigint) {
  return prisma.aiGeneration.count({
    where: { userId, status: 'completed', createdAt: { gte: monthStart() } },
  });
}

export async function usage(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { aiEnabled: true, aiMonthlyLimit: true, role: true },
  });
  // Admin selalu bisa memakai AI (untuk mencoba & mendemokan), dengan batas longgar.
  if (user.role === 'admin') return { enabled: true, limit: 1000, usedThisMonth: await usedThisMonth(userId) };
  return { enabled: user.aiEnabled, limit: user.aiMonthlyLimit, usedThisMonth: await usedThisMonth(userId) };
}

/** Add-on aktif dan kuota bulan ini masih tersedia. */
export async function assertCanGenerate(userId: bigint) {
  const u = await usage(userId);
  if (!u.enabled) {
    throw new AppError('AI_NOT_ENABLED', 'AI Career Assistant belum aktif untuk akun Anda. Hubungi admin untuk mengaktifkan.');
  }
  if (u.usedThisMonth >= u.limit) {
    throw new AppError(
      'AI_QUOTA_EXCEEDED',
      `Kuota AI bulan ini sudah habis (${u.usedThisMonth}/${u.limit}). Kuota direset awal bulan depan.`,
    );
  }
}

/** Satu generasi berjalan per user (proses API tunggal). */
const inFlight = new Set<string>();

export function acquireSlot(userId: bigint) {
  const key = userId.toString();
  if (inFlight.has(key)) {
    throw new AppError('RATE_LIMITED', 'Masih ada permintaan AI yang sedang diproses. Tunggu hingga selesai.');
  }
  inFlight.add(key);
  return () => inFlight.delete(key);
}
