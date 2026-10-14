import {
  addDaysISO,
  RESPONDED_STATUSES,
  SOURCE_LABELS,
  todayISO,
  type Insight,
  type Insights,
  type Source,
  type Status,
} from '@wt/shared';
import { prisma } from '../lib/prisma';
import { fromISODate } from '../lib/serialize';
import { weeklyProgress } from './stats.service';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'accepted'] as const;
const RANK: Partial<Record<Status, number>> = { applied: 0, screening: 1, interview: 2, offer: 3, accepted: 4 };
const DAY = 86_400_000;
const STALE_DAYS = 14;
const MIN_PER_SOURCE = 3;

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
const fmtPct = (v: number) => `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Analitik lamaran + insight berbasis aturan (tanpa AI). */
export async function insights(userId: bigint, period: Insights['period']): Promise<Insights> {
  const today = todayISO();
  const since = period === 'all' ? undefined : fromISODate(addDaysISO(today, period === '30d' ? -30 : -90));

  const apps = await prisma.application.findMany({
    where: { userId, deletedAt: null, status: { not: 'wishlist' }, ...(since ? { appliedAt: { gte: since } } : {}) },
    select: {
      source: true,
      status: true,
      appliedAt: true,
      history: { select: { toStatus: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
    },
  });

  const responded = new Set(RESPONDED_STATUSES as readonly string[]);
  const sourceStats = new Map<Source, { applied: number; responded: number }>();
  const funnel = [0, 0, 0, 0, 0];
  const daysToResponse: number[] = [];
  const daysToInterview: number[] = [];
  let respondedTotal = 0;
  let stale = 0;
  const staleCutoff = fromISODate(addDaysISO(today, -STALE_DAYS));

  for (const a of apps) {
    const statuses = [...a.history.map((h) => h.toStatus), a.status];
    const maxRank = Math.max(0, ...statuses.map((s) => RANK[s as Status] ?? 0));
    for (let i = 0; i <= maxRank; i++) funnel[i]++;

    const didRespond = statuses.some((s) => responded.has(s));
    if (didRespond) respondedTotal++;
    const s = sourceStats.get(a.source) ?? { applied: 0, responded: 0 };
    s.applied++;
    if (didRespond) s.responded++;
    sourceStats.set(a.source, s);

    const firstResponse = a.history.find((h) => responded.has(h.toStatus));
    if (firstResponse) daysToResponse.push(Math.max(0, Math.round((firstResponse.changedAt.getTime() - a.appliedAt.getTime()) / DAY)));
    const firstInterview = a.history.find((h) => (RANK[h.toStatus as Status] ?? 0) >= 2);
    if (firstInterview) daysToInterview.push(Math.max(0, Math.round((firstInterview.changedAt.getTime() - a.appliedAt.getTime()) / DAY)));

    if (a.status === 'applied' && a.appliedAt <= staleCutoff) stale++;
  }

  const total = apps.length;
  const overallRate = pct(respondedTotal, total);
  const bySource = [...sourceStats.entries()]
    .map(([source, v]) => ({ source, applied: v.applied, responded: v.responded, rate: pct(v.responded, v.applied) }))
    .sort((a, b) => b.rate - a.rate || b.applied - a.applied);

  const medianDaysToResponse = median(daysToResponse);
  const medianDaysToInterview = median(daysToInterview);

  /* --------------------------- Insight otomatis --------------------------- */
  const list: Insight[] = [];
  if (total < 5) {
    list.push({
      id: 'not-enough-data',
      tone: 'info',
      title: 'Data masih sedikit',
      detail: 'Insight akan makin akurat setelah Anda mencatat 5 lamaran atau lebih.',
    });
  }

  const eligible = bySource.filter((s) => s.applied >= MIN_PER_SOURCE);
  const best = eligible[0];
  if (best && overallRate > 0 && best.rate >= overallRate * 1.5 && best.responded > 0) {
    list.push({
      id: 'best-source',
      tone: 'positive',
      title: `${SOURCE_LABELS[best.source]} paling efektif`,
      detail: `Response rate ${fmtPct(best.rate)}, ${(best.rate / overallRate).toLocaleString('id-ID', { maximumFractionDigits: 1 })}x rata-rata (${fmtPct(overallRate)}). Prioritaskan kanal ini.`,
    });
  }

  const busiest = [...eligible].sort((a, b) => b.applied - a.applied)[0];
  if (busiest && busiest !== best && busiest.applied >= 5 && busiest.rate < overallRate * 0.6) {
    list.push({
      id: 'weak-busy-source',
      tone: 'warning',
      title: `Banyak melamar lewat ${SOURCE_LABELS[busiest.source]}, tapi responsnya rendah`,
      detail: `${busiest.applied} lamaran dengan response rate ${fmtPct(busiest.rate)} (rata-rata ${fmtPct(overallRate)}). Coba sesuaikan CV untuk tiap lowongan atau cari referral.`,
    });
  }

  if (stale > 0) {
    list.push({
      id: 'stale',
      tone: 'warning',
      title: `${stale} lamaran belum ada kabar lebih dari ${STALE_DAYS} hari`,
      detail: 'Kirim follow-up singkat ke rekruter — banyak perusahaan merespons setelah diingatkan.',
    });
  }

  if (medianDaysToResponse != null) {
    list.push({
      id: 'response-time',
      tone: 'info',
      title: `Perusahaan biasanya merespons dalam ${medianDaysToResponse} hari`,
      detail: `Jika lewat ${medianDaysToResponse + 7} hari tanpa kabar, itu waktu yang tepat untuk follow-up.`,
    });
  }

  const weekly = await weeklyProgress(userId);
  if (weekly.goal) {
    const lastFour = weekly.history.slice(-5, -1);
    const hit = lastFour.filter((w) => w.count >= weekly.goal!).length;
    list.push({
      id: 'weekly-goal',
      tone: hit >= 3 ? 'positive' : 'info',
      title: `Target mingguan tercapai ${hit} dari 4 minggu terakhir`,
      detail:
        hit >= 3
          ? 'Konsistensi yang bagus — pertahankan ritmenya.'
          : `Coba bagi target ${weekly.goal} lamaran menjadi 1–2 lamaran per hari kerja.`,
    });
  }

  return {
    period,
    totalApplied: total,
    bySource,
    funnel: STAGES.map((stage, i) => ({ stage, count: funnel[i] })),
    medianDaysToResponse,
    medianDaysToInterview,
    stale,
    insights: list,
  };
}
