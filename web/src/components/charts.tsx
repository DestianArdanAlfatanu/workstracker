import { SOURCE_LABELS, type MonthlyActivity, type MonthTrend, type Source } from '@wt/shared';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const num = new Intl.NumberFormat('id-ID');
const pct = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

/* ------------------------------------------------------------------ */
/* Badge tren bulan ini vs bulan lalu                                  */
/* ------------------------------------------------------------------ */

/**
 * Pill "+12%" / "−8%" dengan ikon panah (tidak hanya warna).
 * `inverse`: kenaikan dianggap buruk (mis. jumlah ditolak).
 */
export function TrendBadge({
  trend,
  inverse = false,
  onDark = false,
}: {
  trend: MonthTrend;
  inverse?: boolean;
  onDark?: boolean;
}) {
  const { current, previous } = trend;
  if (current === 0 && previous === 0) return null;

  const base = 'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums';
  if (previous === 0) {
    return (
      <span className={cn(base, onDark ? 'bg-white/20 text-white' : 'bg-accent text-accent-foreground')}>
        Baru bulan ini
      </span>
    );
  }
  const change = Math.round(((current - previous) / previous) * 100);
  const up = change >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        base,
        onDark
          ? 'bg-white text-foreground'
          : good
            ? 'bg-[#dcf7e7] text-[#0f6b3a]'
            : 'bg-[#fde4e4] text-[#a32020]',
      )}
      title={`Bulan ini ${current}, bulan lalu ${previous}`}
    >
      <Icon className="size-3" aria-hidden />
      {up ? '+' : '−'}
      {Math.abs(change)}%<span className="sr-only"> dibanding bulan lalu</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Bar chart aktivitas bulanan (dua seri berkelompok)                  */
/* ------------------------------------------------------------------ */

const monthShort = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthDate = (ym: string) => new Date(`${ym}-01T00:00:00Z`);

/** Batas atas sumbu Y dengan 4 interval berlangkah "bulat" (1, 2, 5 × 10ⁿ). */
function niceMax(value: number) {
  const raw = value / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return Math.max(step, 1) * 4;
}

export interface BarSeries<T> {
  key: keyof T & string;
  label: string;
  color: string;
}

/**
 * Grafik batang bulanan berkelompok dengan satu sumbu Y.
 * `tooltipExtra` menambah baris info di tooltip tanpa menambah sumbu kedua.
 */
export function MonthlyBarChart<T extends { month: string }>({
  data,
  series,
  caption,
  formatValue = (v) => num.format(v),
  formatAxis = formatValue,
  tooltipExtra,
}: {
  data: T[];
  series: BarSeries<T>[];
  caption: string;
  formatValue?: (v: number) => string;
  formatAxis?: (v: number) => string;
  tooltipExtra?: (d: T) => ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const value = (d: T, key: keyof T) => Number(d[key] ?? 0);
  const max = niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => value(d, s.key)))));
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const tableId = useId();

  return (
    <div className="flex flex-col gap-4">
      {series.length > 1 && (
        <ul className="flex items-center gap-4 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex h-56 gap-2" aria-hidden>
        {/* Sumbu Y */}
        <div className="flex w-10 shrink-0 flex-col-reverse justify-between pb-6 text-right text-[11px] tabular-nums text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="-mb-1.5 leading-none">
              {formatAxis(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Grid */}
          <div className="absolute inset-x-0 bottom-6 top-0 flex flex-col-reverse justify-between">
            {ticks.map((t, i) => (
              <div key={t} className={cn('h-px w-full', i === 0 ? 'bg-[#d5d8e3]' : 'bg-[var(--chart-grid)]')} />
            ))}
          </div>

          {/* Bar per bulan */}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <div
                key={d.month}
                className="relative flex flex-1 flex-col items-center"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((a) => (a === i ? null : a))}
              >
                {active === i && <div className="absolute inset-x-0.5 bottom-6 top-0 rounded-lg bg-accent/70" />}
                <div className="relative flex h-full w-full items-end justify-center gap-[3px] pb-6">
                  {series.map((s) => {
                    const v = value(d, s.key);
                    return (
                      <div
                        key={s.key}
                        className={cn(
                          'rounded-t-[4px] transition-[height] duration-500',
                          series.length > 1 ? 'w-[min(14px,30%)]' : 'w-[min(22px,45%)]',
                        )}
                        style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 3 : 0, background: s.color }}
                      />
                    );
                  })}
                </div>
                <span
                  className={cn(
                    'absolute bottom-0 text-[11px] text-muted-foreground',
                    // Layar sempit: tampilkan label selang-seling agar tidak bertumpuk.
                    data.length > 8 && (data.length - 1 - i) % 2 === 1 && 'max-sm:hidden',
                  )}
                >
                  {monthShort.format(monthDate(d.month))}
                </span>

                {active === i && (
                  <div
                    className={cn(
                      'pointer-events-none absolute bottom-[calc(100%-2.5rem)] z-10 w-max rounded-xl bg-[#14162b] px-3 py-2 text-xs text-white shadow-lg',
                      i < data.length / 2 ? 'left-1/2' : 'right-1/2',
                    )}
                  >
                    <p className="mb-1 font-semibold capitalize">{monthLong.format(monthDate(d.month))}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex items-center gap-2">
                        <span className="size-2 rounded-full ring-1 ring-white/60" style={{ background: s.color }} />
                        <span className="font-semibold tabular-nums">{formatValue(value(d, s.key))}</span>
                        <span className="text-white/70">{s.label}</span>
                      </p>
                    ))}
                    {tooltipExtra?.(d)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tampilan tabel untuk pembaca layar */}
      <table className="sr-only" aria-labelledby={tableId}>
        <caption id={tableId}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Bulan</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{monthLong.format(monthDate(d.month))}</th>
              {series.map((s) => (
                <td key={s.key}>{formatValue(value(d, s.key))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ACTIVITY_SERIES: BarSeries<MonthlyActivity>[] = [
  { key: 'applied', label: 'Dilamar', color: 'var(--chart-applied)' },
  { key: 'responded', label: 'Dapat respons', color: 'var(--chart-responded)' },
];

export function ActivityBarChart({ data }: { data: MonthlyActivity[] }) {
  return <MonthlyBarChart data={data} series={ACTIVITY_SERIES} caption="Aktivitas lamaran per bulan" />;
}

/* ------------------------------------------------------------------ */
/* Radial konsentris: komposisi status utama                           */
/* ------------------------------------------------------------------ */

export interface RadialItem {
  label: string;
  value: number;
  color: string;
}

export function StatusRadial({
  items,
  total,
  centerValue,
  centerLabel,
}: {
  items: RadialItem[];
  total: number;
  centerValue: string;
  centerLabel: string;
}) {
  const size = 200;
  const stroke = 13;
  const gap = 6;
  const c = size / 2;

  return (
    <div className="relative mx-auto size-[200px]">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-full -rotate-90"
        role="img"
        aria-label={items.map((it) => `${it.label}: ${it.value} dari ${total}`).join(', ')}
      >
        {items.map((it, i) => {
          const r = c - stroke / 2 - i * (stroke + gap);
          const circ = 2 * Math.PI * r;
          const frac = total > 0 ? it.value / total : 0;
          return (
            <g key={it.label}>
              <circle cx={c} cy={c} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke} />
              {frac > 0 && (
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={it.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(circ * frac, 0.001)} ${circ}`}
                  className="transition-[stroke-dasharray] duration-700"
                >
                  <title>{`${it.label}: ${it.value}`}</title>
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold tracking-tight">{centerValue}</span>
        <span className="max-w-[6.5rem] text-[11px] leading-tight text-muted-foreground">{centerLabel}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bubble: lamaran per sumber                                          */
/* ------------------------------------------------------------------ */

// Satu hue (biru brand), makin gelap = makin banyak. Label angka ada di dalam bubble.
const BUBBLE_STEPS = ['#2b3fd0', '#3d5af1', '#6b80f4', '#a3b0f7'];
const BUBBLE_TEXT = ['#ffffff', '#ffffff', '#ffffff', '#11142d'];
// Posisi + radius maksimum per slot agar bubble tidak terpotong viewBox 190×180.
const BUBBLE_POS = [
  { x: 112, y: 84, maxR: 60 },
  { x: 44, y: 48, maxR: 42 },
  { x: 48, y: 130, maxR: 44 },
  { x: 156, y: 148, maxR: 30 },
];

export interface SourceDatum {
  source: Source | 'rest';
  label: string;
  value: number;
  color: string;
  textColor: string;
}

/** Ambil maksimal 4 sumber teratas; sisanya digabung ke "Lainnya". */
export function topSources(bySource: Record<Source, number>): SourceDatum[] {
  const sorted = (Object.entries(bySource) as [Source, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, sorted.length > 4 ? 3 : 4);
  const restValue = sorted.slice(top.length).reduce((s, [, v]) => s + v, 0);
  const rows: Array<{ source: Source | 'rest'; label: string; value: number }> = top.map(([source, value]) => ({
    source,
    label: SOURCE_LABELS[source],
    value,
  }));
  if (restValue > 0) rows.push({ source: 'rest', label: 'Sumber lain', value: restValue });
  // Urut dari terbesar agar bubble terbesar menempati posisi tengah dan warna tergelap.
  rows.sort((a, b) => b.value - a.value);
  return rows.map((r, i) => ({ ...r, color: BUBBLE_STEPS[i], textColor: BUBBLE_TEXT[i] }));
}

export function SourceBubbles({ data }: { data: SourceDatum[] }) {
  const maxV = Math.max(1, ...data.map((d) => d.value));
  const maxR = 56;
  return (
    <svg viewBox="0 0 190 180" className="h-auto w-full max-w-[200px]" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
      {data.map((d, i) => {
        const { x, y, maxR: slotMax } = BUBBLE_POS[i];
        const r = Math.min(slotMax, Math.max(18, maxR * Math.sqrt(d.value / maxV)));
        return (
          <g key={d.source}>
            <circle cx={x} cy={y} r={r} fill={d.color} stroke="var(--card)" strokeWidth={3}>
              <title>{`${d.label}: ${d.value} lamaran`}</title>
            </circle>
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={d.textColor}
              fontSize={r > 34 ? 15 : 12}
              fontWeight={700}
            >
              {num.format(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function percentOf(value: number, total: number) {
  return total > 0 ? `${pct.format((value / total) * 100)}%` : '0%';
}
