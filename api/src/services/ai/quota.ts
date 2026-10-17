import { AI_CREDIT_COST, hasFeature, todayISO, type AiGenerationKind, type AiUsage } from '@wt/shared';
import type { Prisma } from '@prisma/client';
import { AI_MODEL } from '../../lib/ai';
import { AppError } from '../../lib/http';
import { prisma } from '../../lib/prisma';

/** Awal bulan berjalan (WIB) sebagai Date UTC. */
export const monthStart = (now = new Date()) => new Date(`${todayISO(now).slice(0, 7)}-01T00:00:00+07:00`);

/** Kredit terpakai bulan ini (dari ledger). */
export async function creditsUsedThisMonth(userId: bigint) {
  const agg = await prisma.aiCreditLedger.aggregate({
    where: { userId, reason: 'usage', createdAt: { gte: monthStart() } },
    _sum: { delta: true },
  });
  return -(agg._sum.delta ?? 0);
}

async function account(userId: bigint) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true, role: true, aiCredits: true } });
}

export async function usage(userId: bigint): Promise<AiUsage> {
  const u = await account(userId);
  return {
    enabled: hasFeature(u.plan, u.role, 'ai'),
    plan: u.plan,
    balance: u.aiCredits,
    unlimited: u.role === 'admin',
    costs: AI_CREDIT_COST,
    model: AI_MODEL,
  };
}

/** Paket Premium dan saldo kredit cukup. Kredit baru dipotong setelah AI berhasil (lihat `chargeCredits`). */
export async function assertCanGenerate(userId: bigint, cost: number) {
  const u = await account(userId);
  if (!hasFeature(u.plan, u.role, 'ai')) {
    throw new AppError('PLAN_REQUIRED', 'AI Career Assistant tersedia di paket Premium.', undefined, { requiredPlan: 'premium' });
  }
  if (u.role !== 'admin' && u.aiCredits < cost) {
    throw new AppError(
      'AI_CREDITS_EXHAUSTED',
      u.aiCredits === 0
        ? 'Kredit AI Anda sudah habis. Isi ulang kredit lewat admin untuk melanjutkan.'
        : `Kredit AI tidak cukup: aksi ini butuh ${cost} kredit, sisa ${u.aiCredits}.`,
    );
  }
}

/**
 * Potong kredit untuk generasi yang berhasil (di dalam transaksi yang sama dengan penyimpanan hasil).
 * Update bersyarat mencegah saldo minus bila ada dua permintaan bersamaan.
 */
export async function chargeCredits(
  tx: Prisma.TransactionClient,
  userId: bigint,
  kind: AiGenerationKind,
  cost: number,
  generationId: bigint,
) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  if (user.role === 'admin') return;
  const { count } = await tx.user.updateMany({
    where: { id: userId, aiCredits: { gte: cost } },
    data: { aiCredits: { decrement: cost } },
  });
  if (count === 0) {
    throw new AppError('AI_CREDITS_EXHAUSTED', 'Kredit AI tidak cukup untuk menyimpan hasil ini.');
  }
  await tx.aiCreditLedger.create({
    data: { userId, delta: -cost, reason: 'usage', generationId, note: kind },
  });
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
