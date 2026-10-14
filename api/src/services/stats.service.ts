import { Prisma } from '@prisma/client';
import {
  ACTIVE_STATUSES,
  FINAL_STATUSES,
  RESPONDED_STATUSES,
  SOURCES,
  STATUSES,
  addDaysISO,
  todayISO,
  weekStartISO,
  type MonthTrend,
  type Source,
  type Status,
  type StatsSummary,
  type WeeklyProgress,
} from '@wt/shared';
import { prisma } from '../lib/prisma';
import { fromISODate, toISODate } from '../lib/serialize';

const MONTHS = 12;
// Zona waktu aplikasi (Asia/Jakarta, UTC+7) untuk mengelompokkan timestamp per bulan.
const TZ_OFFSET_HOURS = 7;

/** Daftar "YYYY-MM" untuk `count` bulan terakhir, berakhir di bulan berjalan. */
export function lastMonths(count: number, today = todayISO()): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const WEEKS = 8;

/** Progres target mingguan: lamaran (non-wishlist) per minggu Senin–Minggu. */
export async function weeklyProgress(userId: bigint): Promise<WeeklyProgress> {
  const weekStart = weekStartISO(todayISO());
  const firstWeek = addDaysISO(weekStart, -7 * (WEEKS - 1));
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { weeklyGoal: true } }),
    prisma.application.findMany({
      where: { userId, deletedAt: null, status: { not: 'wishlist' }, appliedAt: { gte: fromISODate(firstWeek) } },
      select: { appliedAt: true },
    }),
  ]);
  const counts = new Map<string, number>();
  for (const r of rows) {
    const w = weekStartISO(toISODate(r.appliedAt));
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const history = Array.from({ length: WEEKS }, (_, i) => {
    const w = addDaysISO(firstWeek, i * 7);
    return { weekStart: w, count: counts.get(w) ?? 0 };
  });
  return {
    weekStart,
    weekEnd: addDaysISO(weekStart, 6),
    goal: user?.weeklyGoal ?? null,
    count: counts.get(weekStart) ?? 0,
    history,
  };
}

const respondedList = Prisma.join(RESPONDED_STATUSES.map((s) => Prisma.sql`${s}`));

export async function summary(userId: bigint): Promise<StatsSummary> {
  const base = { userId, deletedAt: null };
  const months = lastMonths(MONTHS);
  const [prevMonth, currentMonth] = months.slice(-2);

  const [groups, sourceGroups, responded, overdueCount, monthlyRows, transitionRows, weekly] = await Promise.all([
    prisma.application.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.application.groupBy({ by: ['source'], where: base, _count: { _all: true } }),
    // Pernah mencapai Screening atau lebih: status saat ini, atau tercatat di riwayat.
    prisma.application.count({
      where: {
        ...base,
        status: { not: 'wishlist' },
        OR: [
          { status: { in: [...RESPONDED_STATUSES] } },
          { history: { some: { toStatus: { in: [...RESPONDED_STATUSES] } } } },
        ],
      },
    }),
    prisma.application.count({
      where: {
        ...base,
        status: { notIn: [...FINAL_STATUSES] },
        nextActionDate: { lt: fromISODate(todayISO()) },
      },
    }),
    prisma.$queryRaw<Array<{ ym: string; applied: bigint; responded: bigint | number | null }>>`
      SELECT DATE_FORMAT(a.applied_at, '%Y-%m') AS ym,
             COUNT(*) AS applied,
             SUM(CASE WHEN a.status IN (${respondedList})
                        OR EXISTS (SELECT 1 FROM status_history h
                                   WHERE h.application_id = a.id AND h.to_status IN (${respondedList}))
                      THEN 1 ELSE 0 END) AS responded
      FROM applications a
      WHERE a.user_id = ${userId} AND a.deleted_at IS NULL AND a.status <> 'wishlist'
        AND a.applied_at >= ${fromISODate(`${months[0]}-01`)}
      GROUP BY ym`,
    prisma.$queryRaw<Array<{ toStatus: string; ym: string; n: bigint }>>`
      SELECT h.to_status AS toStatus,
             DATE_FORMAT(DATE_ADD(h.changed_at, INTERVAL ${Prisma.raw(String(TZ_OFFSET_HOURS))} HOUR), '%Y-%m') AS ym,
             COUNT(DISTINCT h.application_id) AS n
      FROM status_history h
      JOIN applications a ON a.id = h.application_id
      WHERE a.user_id = ${userId} AND a.deleted_at IS NULL
        AND h.to_status IN ('interview', 'offer', 'rejected')
        AND h.changed_at >= ${new Date(`${prevMonth}-01T00:00:00+07:00`)}
      GROUP BY toStatus, ym`,
    weeklyProgress(userId),
  ]);

  const countsByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const g of groups) countsByStatus[g.status] = g._count._all;

  const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<Source, number>;
  for (const g of sourceGroups) bySource[g.source] = g._count._all;

  const monthlyMap = new Map(monthlyRows.map((r) => [r.ym, r]));
  const monthly = months.map((month) => {
    const row = monthlyMap.get(month);
    return { month, applied: Number(row?.applied ?? 0), responded: Number(row?.responded ?? 0) };
  });

  const transition = (status: string): MonthTrend => {
    const find = (ym: string) => Number(transitionRows.find((r) => r.toStatus === status && r.ym === ym)?.n ?? 0);
    return { current: find(currentMonth), previous: find(prevMonth) };
  };

  const total = STATUSES.reduce((sum, s) => sum + countsByStatus[s], 0);
  const nonWishlist = total - countsByStatus.wishlist;

  return {
    total,
    active: ACTIVE_STATUSES.reduce((sum, s) => sum + countsByStatus[s], 0),
    interview: countsByStatus.interview,
    offer: countsByStatus.offer,
    accepted: countsByStatus.accepted,
    rejected: countsByStatus.rejected,
    responseRate: nonWishlist === 0 ? 0 : Math.round((responded / nonWishlist) * 1000) / 10,
    overdueCount,
    countsByStatus,
    bySource,
    weekly,
    monthly,
    trends: {
      applied: { current: monthly[MONTHS - 1].applied, previous: monthly[MONTHS - 2].applied },
      interview: transition('interview'),
      offer: transition('offer'),
      rejected: transition('rejected'),
    },
  };
}
