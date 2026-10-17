import type { MonthTrend } from '@wt/shared';
import {
  CalendarCheck2,
  CalendarClock,
  FileStack,
  Gift,
  MessagesSquare,
  Plus,
  Share2,
  TriangleAlert,
  XCircle,
  type LucideIcon,
  Upload,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApplicationUI } from '@/components/application-ui';
import {
  ActivityBarChart,
  percentOf,
  SourceBubbles,
  StatusRadial,
  topSources,
  TrendBadge,
  type RadialItem,
} from '@/components/charts';
import { EmptyState } from '@/components/common';
import { AnnouncementBanner, WeeklyGoalCard } from '@/components/dashboard-extras';
import { InstallBanner } from '@/components/MobileAppCard';
import { ShareProgressDialog } from '@/components/ShareProgressDialog';
import { usePlan, useUpgradePrompt } from '@/components/plan';
import { DueBadge, StatusBadge } from '@/components/status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useStats, useUpcoming } from '@/lib/queries';
import { cn } from '@/lib/utils';

const num = new Intl.NumberFormat('id-ID');
const percent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

function CardHead({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  inverse,
  highlight,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  trend: MonthTrend;
  inverse?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        'flex flex-col gap-4 p-4 sm:p-5',
        highlight && 'border-transparent bg-[#1d4ed8] text-white shadow-[0_14px_28px_-20px_rgba(15,23,42,0.7)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-full',
            highlight ? 'bg-white/20' : 'border border-border bg-card',
          )}
        >
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <TrendBadge trend={trend} inverse={inverse} onDark={highlight} />
      </div>
      <div>
        <p className={cn('text-sm font-medium', highlight ? 'text-white/85' : 'text-muted-foreground')}>{label}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[1.75rem] font-bold leading-tight tracking-tight">{num.format(value)}</span>
          <span className={cn('text-xs', highlight ? 'text-white/75' : 'text-muted-foreground')}>
            {num.format(trend.current)} bulan ini
          </span>
        </div>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const ui = useApplicationUI();
  const stats = useStats();
  const upcoming = useUpcoming(5);
  const [months, setMonths] = useState('6');
  const [share, setShare] = useState(false);
  const canShare = usePlan().has('share_card');
  const [upgradeDialog, promptUpgrade] = useUpgradePrompt();
  const s = stats.data;

  if (stats.isError) {
    return <Alert variant="destructive">Gagal memuat statistik. Muat ulang halaman untuk mencoba lagi.</Alert>;
  }

  if (!s) {
    return (
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-4 xl:col-span-7">
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl bg-card" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl bg-card" />
        </div>
        <div className="grid gap-4 xl:col-span-5">
          <Skeleton className="h-96 rounded-2xl bg-card" />
          <Skeleton className="h-64 rounded-2xl bg-card" />
        </div>
      </div>
    );
  }

  const radial: RadialItem[] = [
    { label: 'Aktif', value: s.active, color: 'var(--chart-active)' },
    { label: 'Offer & diterima', value: s.offer + s.accepted, color: 'var(--chart-offer)' },
    { label: 'Ditolak', value: s.rejected, color: 'var(--chart-rejected)' },
  ];
  const sources = topSources(s.bySource);

  return (
    <div className="flex flex-col gap-4">
      <AnnouncementBanner />
      <InstallBanner />
      {s.overdueCount > 0 && (
        <Alert variant="warning" className="rounded-2xl">
          <TriangleAlert aria-hidden />
          <div>
            <AlertTitle>{s.overdueCount} jadwal follow-up terlewat</AlertTitle>
            <AlertDescription>
              Segera tindak lanjuti atau perbarui tanggalnya.{' '}
              <Link to="/applications?sort=next_action_date:asc" className="font-semibold underline underline-offset-2">
                Lihat lamaran
              </Link>
            </AlertDescription>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Kolom kiri */}
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-7">
          <section aria-label="Ringkasan" className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            <KpiCard label="Total lamaran" value={s.total} icon={FileStack} trend={s.trends.applied} highlight />
            <KpiCard label="Interview" value={s.interview} icon={MessagesSquare} trend={s.trends.interview} />
            <KpiCard label="Offer" value={s.offer} icon={Gift} trend={s.trends.offer} />
            <KpiCard label="Ditolak" value={s.rejected} icon={XCircle} trend={s.trends.rejected} inverse />
          </section>

          <Card className="flex flex-col gap-5 p-5">
            <CardHead
              title="Aktivitas Lamaran"
              description="Jumlah lamaran per bulan dan yang mendapat respons (Screening+)"
              action={
                <Select value={months} onValueChange={setMonths}>
                  <SelectTrigger aria-label="Rentang waktu" className="h-9 w-auto gap-2 rounded-full px-3.5 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="6">6 bulan</SelectItem>
                    <SelectItem value="12">12 bulan</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
            {s.total === 0 ? (
              <EmptyState
                icon={FileStack}
                title="Belum ada lamaran"
                description="Catat lamaran pertama Anda. Cukup isi perusahaan, posisi, tanggal, dan status."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={ui.openCreate}>
                      <Plus />
                      Tambah lamaran
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/applications" state={{ openImport: true }}>
                        <Upload />
                        Impor dari Excel
                      </Link>
                    </Button>
                  </div>
                }
                className="py-8"
              />
            ) : (
              <ActivityBarChart data={s.monthly.slice(-Number(months))} />
            )}
          </Card>

          <Card className="flex flex-1 flex-col gap-4 p-5">
            <CardHead
              title="Jadwal Terdekat"
              description="Interview dan follow-up yang perlu diingat"
              action={
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link to="/applications?sort=next_action_date:asc">Lihat semua</Link>
                </Button>
              }
            />
            {upcoming.isPending ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !upcoming.data?.length ? (
              <EmptyState
                icon={CalendarCheck2}
                title="Tidak ada jadwal"
                description="Isi tanggal tindak lanjut pada lamaran agar muncul di sini."
                className="py-6"
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.data.map((app) => (
                  <li key={app.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => ui.openDetail(app.id)}
                      className="flex h-full w-full flex-col gap-2 rounded-xl border p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                    >
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
                          <CalendarClock className="size-3.5" aria-hidden />
                          {formatDate(app.nextActionDate)}
                        </span>
                        <DueBadge date={app.nextActionDate} status={app.status} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{app.company}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {app.nextActionNote || app.position}
                        </span>
                      </span>
                      <StatusBadge status={app.status} className="self-start" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Kolom kanan */}
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-5">
          <WeeklyGoalCard weekly={s.weekly} />
          <Card className="flex flex-col gap-5 p-5">
            <CardHead
              title="Statistik Status"
              description="Komposisi lamaran berdasarkan status saat ini"
              action={
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => (canShare ? setShare(true) : promptUpgrade('share_card'))}>
                  <Share2 />
                  Bagikan
                </Button>
              }
            />
            <StatusRadial
              items={radial}
              total={s.total}
              centerValue={`${percent.format(s.responseRate)}%`}
              centerLabel="Response rate"
            />
            <ul className="flex flex-col gap-3">
              {radial.map((it) => (
                <li key={it.label} className="flex items-center gap-3 text-sm">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: it.color }} aria-hidden />
                  <span className="flex-1 font-medium">{it.label}</span>
                  <span className="font-semibold tabular-nums">{num.format(it.value)}</span>
                  <span className="w-14 rounded-full bg-muted px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {percentOf(it.value, s.total)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Response rate: lamaran yang pernah mencapai Screening atau lebih, dari{' '}
              {num.format(s.total - s.countsByStatus.wishlist)} lamaran (tanpa Wishlist).
            </p>
          </Card>

          <Card className="flex flex-1 flex-col gap-4 p-5">
            <CardHead
              title="Sumber Lamaran"
              description="Kanal yang paling sering Anda gunakan"
              action={
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link to="/insight">Lihat insight</Link>
                </Button>
              }
            />
            {sources.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data sumber.</p>
            ) : (
              <div className="grid items-center gap-4 min-[420px]:grid-cols-[minmax(0,11rem)_1fr]">
                <div className="flex justify-center">
                  <SourceBubbles data={sources} />
                </div>
                <ul className="flex flex-col gap-3">
                  {sources.map((d) => (
                    <li key={d.source} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="size-2.5 rounded-full" style={{ background: d.color }} aria-hidden />
                        <span className="flex-1 truncate font-medium">{d.label}</span>
                        <span className="text-xs font-semibold tabular-nums">{num.format(d.value)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--chart-track)]" aria-hidden>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.total ? (d.value / s.total) * 100 : 0}%`, background: d.color }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ShareProgressDialog open={share} onOpenChange={setShare} />
      {upgradeDialog}
    </div>
  );
}
