import { Prisma } from '@prisma/client';
import {
  COST_BASIS,
  PLAN_KEYS,
  PLANS,
  planRank,
  todayISO,
  type AdminListQuery,
  type AdminOverview,
  type Plan,
} from '@wt/shared';
import { AppError, notFound } from '../lib/http';
import { generateDefaultPassword, hashPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { removeUserFiles } from '../lib/storage';
import { fromISODate } from '../lib/serialize';
import { revokeAllSessions } from './auth.service';
import { lastMonths } from './stats.service';
import { monthStart } from './ai/quota';

const NOT_FOUND_MESSAGE = 'Pembeli tidak ditemukan';

/** Sertakan data penjualan + jumlah lamaran aktif (bukan isi lamarannya). */
const buyerInclude = {
  license: true,
  _count: { select: { applications: { where: { deletedAt: null } } } },
} satisfies Prisma.UserInclude;

interface LicenseInput {
  whatsapp?: string | null;
  purchasedAt?: string;
  price?: number | null;
  notes?: string | null;
}

const emailTaken = () =>
  new AppError('EMAIL_TAKEN', 'Email sudah dipakai akun lain', { email: 'Email sudah dipakai akun lain' });

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Admin hanya mengelola akun pembeli (role user), bukan sesama admin. */
async function findBuyer(id: bigint) {
  const user = await prisma.user.findFirst({ where: { id, role: 'user', isDemo: false } });
  if (!user) throw notFound(NOT_FOUND_MESSAGE);
  return user;
}

const getBuyer = (id: bigint) =>
  prisma.user.findUniqueOrThrow({ where: { id }, include: buyerInclude });

export async function listBuyers(query: AdminListQuery) {
  const where: Prisma.UserWhereInput = { role: 'user', isDemo: false };
  if (query.status) where.status = query.status;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q } },
      { email: { contains: query.q } },
      { license: { whatsapp: { contains: query.q.replace(/\D/g, '') || query.q } } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: buyerInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

export async function createBuyer(
  adminId: bigint,
  input: { name: string; email: string; plan: Plan } & LicenseInput & { purchasedAt: string },
) {
  const tempPassword = generateDefaultPassword(input.name);
  const passwordHash = await hashPassword(tempPassword);
  const credits = PLANS[input.plan].credits;
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'user',
        mustChangePassword: true,
        plan: input.plan,
        aiCredits: credits,
        ...(credits > 0
          ? { creditLedger: { create: { delta: credits, reason: 'plan_grant', note: `Paket ${PLANS[input.plan].name}`, createdById: adminId } } }
          : {}),
        license: {
          create: {
            whatsapp: input.whatsapp ?? null,
            purchasedAt: fromISODate(input.purchasedAt),
            price: input.price ?? null,
            notes: input.notes ?? null,
            createdById: adminId,
          },
        },
      },
    });
    return { user: await getBuyer(user.id), tempPassword };
  } catch (e) {
    if (isUniqueViolation(e)) throw emailTaken();
    throw e;
  }
}

export async function updateBuyer(id: bigint, input: { name?: string; email?: string } & LicenseInput) {
  await findBuyer(id);
  const license: Prisma.LicenseUpdateInput = {};
  if (input.whatsapp !== undefined) license.whatsapp = input.whatsapp;
  if (input.purchasedAt !== undefined) license.purchasedAt = fromISODate(input.purchasedAt);
  if (input.price !== undefined) license.price = input.price;
  if (input.notes !== undefined) license.notes = input.notes;

  try {
    await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(Object.keys(license).length
          ? {
              license: {
                upsert: {
                  update: license,
                  create: {
                    whatsapp: input.whatsapp ?? null,
                    purchasedAt: fromISODate(input.purchasedAt ?? todayISO()),
                    price: input.price ?? null,
                    notes: input.notes ?? null,
                  },
                },
              },
            }
          : {}),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw emailTaken();
    throw e;
  }
  return getBuyer(id);
}

export async function resetPassword(id: bigint) {
  const user = await findBuyer(id);
  const tempPassword = generateDefaultPassword(user.name);
  const passwordHash = await hashPassword(tempPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await revokeAllSessions(id, tx);
  });
  return { user: await getBuyer(id), tempPassword };
}

export async function setStatus(id: bigint, status: 'active' | 'suspended') {
  await findBuyer(id);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status } });
    if (status === 'suspended') await revokeAllSessions(id, tx);
  });
  return getBuyer(id);
}

export async function deleteBuyer(id: bigint) {
  await findBuyer(id);
  await prisma.user.delete({ where: { id } });
  await removeUserFiles(id);
}

export async function overview(): Promise<AdminOverview> {
  const months = lastMonths(12);
  const currentMonth = months[months.length - 1];
  const buyerLicense = { user: { role: 'user' as const } };

  const buyerPurchase = { user: { role: 'user' as const, isDemo: false } };
  const [statusGroups, revenue, monthRevenue, rows, ai, demos, extra, monthExtra, extraRows, planGroups, creditsUsed] = await Promise.all([
    prisma.user.groupBy({ by: ['status'], where: { role: 'user', isDemo: false }, _count: { _all: true } }),
    prisma.license.aggregate({ where: buyerLicense, _sum: { price: true } }),
    prisma.license.aggregate({
      where: { ...buyerLicense, purchasedAt: { gte: fromISODate(`${currentMonth}-01`) } },
      _sum: { price: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ ym: string; sales: bigint; revenue: bigint | number | string | null }>>`
      SELECT DATE_FORMAT(l.purchased_at, '%Y-%m') AS ym, COUNT(*) AS sales, COALESCE(SUM(l.price), 0) AS revenue
      FROM licenses l
      JOIN users u ON u.id = l.user_id
      WHERE u.role = 'user' AND l.purchased_at >= ${fromISODate(`${months[0]}-01`)}
      GROUP BY ym`,
    prisma.aiGeneration.aggregate({
      where: { createdAt: { gte: monthStart() } },
      _sum: { costMicroUsd: true },
      _count: { _all: true },
    }),
    // Akun demo yang sudah dihapus tidak terhitung; perkiraan minat bulan ini.
    prisma.user.count({ where: { isDemo: true, createdAt: { gte: monthStart() } } }),
    // Upgrade & isi ulang kredit.
    prisma.purchase.aggregate({ where: buyerPurchase, _sum: { price: true } }),
    prisma.purchase.aggregate({
      where: { ...buyerPurchase, paidAt: { gte: fromISODate(`${currentMonth}-01`) } },
      _sum: { price: true },
    }),
    prisma.$queryRaw<Array<{ ym: string; revenue: bigint | number | string | null }>>`
      SELECT DATE_FORMAT(p.paid_at, '%Y-%m') AS ym, COALESCE(SUM(p.price), 0) AS revenue
      FROM purchases p
      JOIN users u ON u.id = p.user_id
      WHERE u.role = 'user' AND p.paid_at >= ${fromISODate(`${months[0]}-01`)}
      GROUP BY ym`,
    prisma.user.groupBy({ by: ['plan'], where: { role: 'user', isDemo: false, status: 'active' }, _count: { _all: true } }),
    prisma.aiCreditLedger.aggregate({
      where: { reason: 'usage', createdAt: { gte: monthStart() }, user: { isDemo: false } },
      _sum: { delta: true },
    }),
  ]);
  // Modal per kredit hanya dari pemakaian sungguhan (bukan demo/admin yang tidak dipotong kredit).
  const paidAi = await prisma.aiGeneration.aggregate({
    where: { createdAt: { gte: monthStart() }, status: 'completed', user: { isDemo: false, role: 'user' } },
    _sum: { costMicroUsd: true },
  });

  const count = (s: 'active' | 'suspended') => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const byMonth = new Map(rows.map((r) => [r.ym, r]));
  const extraByMonth = new Map(extraRows.map((r) => [r.ym, Number(r.revenue ?? 0)]));
  const usedCredits = -(creditsUsed._sum.delta ?? 0);
  const paidCostIdr = ((paidAi._sum.costMicroUsd ?? 0) / 1_000_000) * COST_BASIS.usdToIdr * (1 + COST_BASIS.vat);

  return {
    totalBuyers: count('active') + count('suspended'),
    active: count('active'),
    suspended: count('suspended'),
    revenueTotal: (revenue._sum.price ?? 0) + (extra._sum.price ?? 0),
    revenueThisMonth: (monthRevenue._sum.price ?? 0) + (monthExtra._sum.price ?? 0),
    salesThisMonth: monthRevenue._count._all,
    aiGenerationsThisMonth: ai._count._all,
    aiCostThisMonthUsd: (ai._sum.costMicroUsd ?? 0) / 1_000_000,
    aiCreditsUsedThisMonth: usedCredits,
    aiCostPerCreditIdr: usedCredits > 0 ? Math.round(paidCostIdr / usedCredits) : null,
    byPlan: Object.fromEntries(
      PLAN_KEYS.map((p) => [p, planGroups.find((g) => g.plan === p)?._count._all ?? 0]),
    ) as Record<Plan, number>,
    demosThisMonth: demos,
    monthly: months.map((month) => {
      const r = byMonth.get(month);
      return { month, sales: Number(r?.sales ?? 0), revenue: Number(r?.revenue ?? 0) + (extraByMonth.get(month) ?? 0) };
    }),
  };
}

/** Kredit AI terpakai bulan ini per user. */
export async function aiUsageFor(userIds: bigint[]) {
  if (userIds.length === 0) return new Map<string, number>();
  const groups = await prisma.aiCreditLedger.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, reason: 'usage', createdAt: { gte: monthStart() } },
    _sum: { delta: true },
  });
  return new Map(groups.map((g) => [g.userId.toString(), -(g._sum.delta ?? 0)]));
}

interface PaymentInput {
  price: number;
  paidAt: string;
  notes?: string | null;
}

/** Pencatat perubahan: admin (id) atau pembayaran otomatis (null + pesanan Midtrans). */
interface Actor {
  createdById: bigint | null;
  paymentOrderId?: bigint | null;
}

/**
 * Inti ubah paket, dipakai admin & pembayaran otomatis. Naik ke paket yang memberi kredit
 * (Premium) menambah kredit paket tersebut. Turun paket tidak menghapus sisa kredit.
 */
export async function applyPlanChange(
  tx: Prisma.TransactionClient,
  user: { id: bigint; plan: Plan },
  input: PaymentInput & { plan: Plan },
  actor: Actor,
) {
  const upgrade = planRank(input.plan) > planRank(user.plan);
  const grant = upgrade ? Math.max(0, PLANS[input.plan].credits - PLANS[user.plan].credits) : 0;
  await tx.user.update({
    where: { id: user.id },
    data: { plan: input.plan, ...(grant ? { aiCredits: { increment: grant } } : {}) },
  });
  if (grant) {
    await tx.aiCreditLedger.create({
      data: { userId: user.id, delta: grant, reason: 'plan_grant', note: `Upgrade ke ${PLANS[input.plan].name}`, createdById: actor.createdById },
    });
  }
  await tx.purchase.create({
    data: {
      userId: user.id,
      kind: 'upgrade',
      plan: input.plan,
      credits: grant || null,
      price: input.price,
      paidAt: fromISODate(input.paidAt),
      notes: input.notes ?? null,
      createdById: actor.createdById,
      paymentOrderId: actor.paymentOrderId ?? null,
    },
  });
  return grant;
}

/** Inti isi ulang kredit (tercatat sebagai pembelian), dipakai admin & pembayaran otomatis. */
export async function applyTopup(tx: Prisma.TransactionClient, userId: bigint, input: PaymentInput & { credits: number }, actor: Actor) {
  await tx.user.update({ where: { id: userId }, data: { aiCredits: { increment: input.credits } } });
  await tx.aiCreditLedger.create({
    data: { userId, delta: input.credits, reason: 'topup', note: input.notes?.slice(0, 255) ?? null, createdById: actor.createdById },
  });
  await tx.purchase.create({
    data: {
      userId,
      kind: 'topup',
      credits: input.credits,
      price: input.price,
      paidAt: fromISODate(input.paidAt),
      notes: input.notes ?? null,
      createdById: actor.createdById,
      paymentOrderId: actor.paymentOrderId ?? null,
    },
  });
}

/** Ubah paket oleh admin (biasanya upgrade, bayar selisih). */
export async function setPlan(adminId: bigint, id: bigint, input: PaymentInput & { plan: Plan }) {
  const user = await findBuyer(id);
  if (user.plan === input.plan) {
    throw new AppError('VALIDATION_ERROR', `Pembeli sudah memakai paket ${PLANS[input.plan].name}`, { plan: 'Paket sama dengan sekarang' });
  }
  await prisma.$transaction((tx) => applyPlanChange(tx, user, input, { createdById: adminId }));
  return getBuyer(id);
}

/** Isi ulang kredit (positif, tercatat sebagai pembelian) atau koreksi (negatif) oleh admin. */
export async function addCredits(adminId: bigint, id: bigint, input: PaymentInput & { credits: number }) {
  const user = await findBuyer(id);
  if (input.credits < 0 && user.aiCredits + input.credits < 0) {
    throw new AppError('VALIDATION_ERROR', `Saldo hanya ${user.aiCredits} kredit`, { credits: 'Melebihi saldo' });
  }
  await prisma.$transaction(async (tx) => {
    if (input.credits > 0) return applyTopup(tx, id, input, { createdById: adminId });
    await tx.user.update({ where: { id }, data: { aiCredits: { increment: input.credits } } });
    await tx.aiCreditLedger.create({
      data: { userId: id, delta: input.credits, reason: 'admin_adjust', note: input.notes?.slice(0, 255) ?? null, createdById: adminId },
    });
  });
  return getBuyer(id);
}

export async function purchasesOf(id: bigint) {
  await findBuyer(id);
  return prisma.purchase.findMany({ where: { userId: id }, orderBy: [{ paidAt: 'desc' }, { id: 'desc' }] });
}