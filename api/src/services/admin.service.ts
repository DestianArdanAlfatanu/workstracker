import { Prisma } from '@prisma/client';
import { todayISO, type AdminListQuery, type AdminOverview } from '@wt/shared';
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
  input: { name: string; email: string } & LicenseInput & { purchasedAt: string },
) {
  const tempPassword = generateDefaultPassword(input.name);
  const passwordHash = await hashPassword(tempPassword);
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'user',
        mustChangePassword: true,
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

  const [statusGroups, revenue, monthRevenue, rows, ai, demos] = await Promise.all([
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
  ]);

  const count = (s: 'active' | 'suspended') => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const byMonth = new Map(rows.map((r) => [r.ym, r]));

  return {
    totalBuyers: count('active') + count('suspended'),
    active: count('active'),
    suspended: count('suspended'),
    revenueTotal: revenue._sum.price ?? 0,
    revenueThisMonth: monthRevenue._sum.price ?? 0,
    salesThisMonth: monthRevenue._count._all,
    aiGenerationsThisMonth: ai._count._all,
    aiCostThisMonthUsd: (ai._sum.costMicroUsd ?? 0) / 1_000_000,
    demosThisMonth: demos,
    monthly: months.map((month) => {
      const r = byMonth.get(month);
      return { month, sales: Number(r?.sales ?? 0), revenue: Number(r?.revenue ?? 0) };
    }),
  };
}

/** Jumlah generasi AI berhasil bulan ini per user. */
export async function aiUsageFor(userIds: bigint[]) {
  if (userIds.length === 0) return new Map<string, number>();
  const groups = await prisma.aiGeneration.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, status: 'completed', createdAt: { gte: monthStart() } },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.userId.toString(), g._count._all]));
}

export async function setAi(id: bigint, input: { aiEnabled?: boolean; aiMonthlyLimit?: number }) {
  await findBuyer(id);
  await prisma.user.update({ where: { id }, data: input });
  return getBuyer(id);
}