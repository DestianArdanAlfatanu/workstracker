import { SOURCE_LABELS, STATUS_LABELS, type Insight, type Insights } from '@wt/shared';
import { Clock, Hourglass, Lightbulb, MailQuestion, Send, Share2, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { ShareProgressDialog } from '@/components/ShareProgressDialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInsights } from '@/lib/queries';
import { cn } from '@/lib/utils';

const PERIODS: Array<{ value: Insights['period']; label: string }> = [
  { value: '30d', label: '30 hari' },
  { value: '90d', label: '90 hari' },
  { value: 'all', label: 'Semua' },
];

const TONE: Record<Insight['tone'], { icon: LucideIcon; cls: string }> = {
  positive: { icon: TrendingUp, cls: 'bg-[#dcf7e7] text-[#0f6b3a]' },
  warning: { icon: TriangleAlert, cls: 'bg-amber-100 text-amber-900' },
  info: { icon: Lightbulb, cls: 'bg-accent text-accent-foreground' },
};

const num = new Intl.NumberFormat('id-ID');
const pct = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

function Tile({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: LucideIcon }) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <span className="flex size-10 items-center justify-center rounded-full border border-border">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-[1.6rem] font-bold leading-tight tracking-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}

/** Bar horizontal satu warna dengan label langsung (tanpa legenda). */
function HBar({ label, value, max, right, sub }: { label: string; value: number; max: number; right: string; sub?: string }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{right}</span>
          {sub && <span className="ml-1.5 text-xs text-muted-foreground">{sub}</span>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--chart-track)]" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0}%` }}
        />
      </div>
    </li>
  );
}

export function InsightPage() {
  const [period, setPeriod] = useState<Insights['period']>('90d');
  const [share, setShare] = useState(false);
  const { data, isPending, isError, isPlaceholderData } = useInsights(period);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-card p-1 shadow-[0_1px_3px_rgba(17,20,45,0.05)]" role="group" aria-label="Periode">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground',
                period === p.value && 'bg-primary text-primary-foreground shadow-sm',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setShare(true)}>
          <Share2 />
          Bagikan progres
        </Button>
      </div>

      {isError && <Alert variant="destructive">Gagal memuat insight.</Alert>}

      {isPending || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className={cn('flex flex-col gap-4', isPlaceholderData && 'opacity-60')}>
          {data.insights.length > 0 && (
            <section aria-label="Insight" className="grid gap-3 md:grid-cols-2">
              {data.insights.map((ins) => {
                const tone = TONE[ins.tone];
                const Icon = tone.icon;
                return (
                  <Card key={ins.id} className="flex items-start gap-3 p-4">
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tone.cls)}>
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold">{ins.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{ins.detail}</p>
                    </div>
                  </Card>
                );
              })}
            </section>
          )}

          <section aria-label="Ringkasan" className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Tile label="Lamaran dikirim" value={num.format(data.totalApplied)} icon={Send} hint="Tanpa wishlist" />
            <Tile
              label="Waktu sampai direspons"
              value={data.medianDaysToResponse != null ? `${data.medianDaysToResponse} hari` : '—'}
              icon={Clock}
              hint="Median"
            />
            <Tile
              label="Waktu sampai interview"
              value={data.medianDaysToInterview != null ? `${data.medianDaysToInterview} hari` : '—'}
              icon={Hourglass}
              hint="Median"
            />
            <Tile label="Belum ada kabar" value={num.format(data.stale)} icon={MailQuestion} hint="Applied > 14 hari" />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="flex flex-col gap-4 p-5">
              <div>
                <h2 className="text-base font-bold tracking-tight">Funnel lamaran</h2>
                <p className="text-xs text-muted-foreground">Berapa lamaran yang pernah mencapai tiap tahap</p>
              </div>
              <ul className="flex flex-col gap-3">
                {data.funnel.map((f) => (
                  <HBar
                    key={f.stage}
                    label={STATUS_LABELS[f.stage]}
                    value={f.count}
                    max={data.funnel[0].count}
                    right={num.format(f.count)}
                    sub={data.funnel[0].count ? `${pct.format((f.count / data.funnel[0].count) * 100)}%` : undefined}
                  />
                ))}
              </ul>
            </Card>

            <Card className="flex flex-col gap-4 p-5">
              <div>
                <h2 className="text-base font-bold tracking-tight">Response rate per kanal</h2>
                <p className="text-xs text-muted-foreground">Persentase lamaran yang mendapat respons (Screening atau lebih)</p>
              </div>
              {data.bySource.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data di periode ini.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.bySource.map((s) => (
                    <HBar
                      key={s.source}
                      label={`${SOURCE_LABELS[s.source]}${s.applied < 3 ? ' · data sedikit' : ''}`}
                      value={s.rate}
                      max={100}
                      right={`${pct.format(s.rate)}%`}
                      sub={`${s.responded}/${s.applied}`}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      <ShareProgressDialog open={share} onOpenChange={setShare} />
    </div>
  );
}
