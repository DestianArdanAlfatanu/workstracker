import type { StatsSummary } from '@wt/shared';
import { Download, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useStats } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { LOGO_FILES, LOGO_RATIO } from './brand';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

type Format = 'story' | 'wide';
const SIZES: Record<Format, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1350, label: 'Instagram (4:5)' },
  wide: { w: 1200, h: 628, label: 'LinkedIn (1,91:1)' },
};

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const num = new Intl.NumberFormat('id-ID');
const monthYear = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

interface CardData {
  name: string | null;
  total: number;
  interview: number;
  offer: number;
  responseRate: number;
  weekCount: number;
  weekGoal: number | null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    img.src = src;
  });
}

/**
 * Tulis teks dengan ukuran font yang diperkecil bila melebihi maxW (paling kecil 55% ukuran awal),
 * lalu dipotong dengan "…" bila masih terlalu panjang.
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number) {
  let px = size;
  ctx.font = `${weight} ${px}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && px > size * 0.55) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  let out = text;
  while (ctx.measureText(out).width > maxW && out.length > 1) out = out.slice(0, -2) + '…';
  ctx.fillText(out, x, y);
}

/** Gambar kartu progres di canvas (tanpa library). Posisi dihitung berurutan dari atas agar tidak menumpuk. */
function drawCard(canvas: HTMLCanvasElement, d: CardData, format: Format, logo: HTMLImageElement) {
  const { w, h } = SIZES[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const story = format === 'story';

  // Latar
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, w * 0.7);
  glow.addColorStop(0, 'rgba(37,99,235,0.55)');
  glow.addColorStop(1, 'rgba(37,99,235,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const pad = story ? 84 : 60;
  const innerW = w - pad * 2;
  ctx.textBaseline = 'alphabetic';

  // Logo resmi versi latar gelap (assets/workstracker-logo-on-dark.svg)
  const logoH = story ? 80 : 50;
  ctx.drawImage(logo, pad, pad, logoH * LOGO_RATIO, logoH);

  // Subjudul & judul, di bawah logo
  const subSize = story ? 38 : 24;
  const titleSize = story ? 76 : 48;
  let y = pad + logoH + (story ? 80 : 48);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  fitText(ctx, `Progres pencarian kerja · ${monthYear.format(new Date())}`, pad, y, innerW, 500, subSize);
  y += titleSize + (story ? 18 : 12);
  ctx.fillStyle = '#fff';
  fitText(ctx, d.name ? `Rekap lamaran ${d.name}` : 'Rekap lamaranku', pad, y, innerW, 800, titleSize);

  // Angka utama
  if (story) {
    y += 270;
    ctx.fillStyle = '#ffffff';
    fitText(ctx, num.format(d.total), pad - 6, y, innerW, 800, 220);
    y += 70;
    ctx.fillStyle = '#93c5fd';
    fitText(ctx, 'lamaran dikirim', pad, y, innerW, 600, 44);
  }

  // Kotak statistik
  const stats = [
    ...(format === 'wide' ? [{ v: num.format(d.total), l: 'Lamaran' }] : []),
    { v: num.format(d.interview), l: 'Interview' },
    { v: num.format(d.offer), l: 'Offer' },
    { v: `${num.format(Math.round(d.responseRate))}%`, l: 'Response rate' },
    ...(format === 'story' ? [{ v: d.weekGoal ? `${d.weekCount}/${d.weekGoal}` : num.format(d.weekCount), l: 'Lamaran minggu ini' }] : []),
  ];
  const cols = story ? 2 : 4;
  const gap = story ? 24 : 20;
  const boxW = (innerW - gap * (cols - 1)) / cols;
  const boxH = story ? 200 : 160;
  const boxPad = story ? 32 : 24;
  const footSize = story ? 34 : 22;
  const footY = h - (story ? pad * 0.8 : pad * 0.75);
  // LinkedIn: kotak statistik di tengah ruang antara judul dan footer.
  const minY = y + (story ? 60 : 44);
  const maxY = footY - footSize - 36 - boxH;
  const startY = story ? minY : Math.max(minY, Math.round((minY + maxY) / 2));
  stats.forEach((st, i) => {
    const x = pad + (i % cols) * (boxW + gap);
    const by = startY + Math.floor(i / cols) * (boxH + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(x, by, boxW, boxH, story ? 28 : 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    fitText(ctx, st.v, x + boxPad, by + boxH / 2 + (story ? 10 : 8), boxW - boxPad * 2, 800, story ? 84 : 60);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    fitText(ctx, st.l, x + boxPad, by + boxH - boxPad, boxW - boxPad * 2, 500, story ? 32 : 24);
  });

  // Footer: di Instagram dua baris (alamat situs cukup panjang), di LinkedIn satu baris.
  const host = window.location.host;
  if (story) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    fitText(ctx, 'Lacak lamaranmu dengan WorksTracker', pad, footY - footSize - 14, innerW, 500, footSize);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    fitText(ctx, host, pad, footY, innerW, 600, footSize);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    fitText(ctx, `Lacak lamaranmu dengan WorksTracker · ${host}`, pad, footY, innerW, 500, footSize);
  }
}

function cardData(s: StatsSummary, name: string | null): CardData {
  return {
    name,
    total: s.total - s.countsByStatus.wishlist,
    interview: s.interview + s.offer + s.accepted,
    offer: s.offer + s.accepted,
    responseRate: s.responseRate,
    weekCount: s.weekly.count,
    weekGoal: s.weekly.goal,
  };
}

export function ShareProgressDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state } = useAuth();
  const stats = useStats();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<Format>('story');
  const [showName, setShowName] = useState(true);
  const firstName = state.user && !state.user.isDemo ? (state.user.name.split(' ')[0] ?? null) : null;

  useEffect(() => {
    if (!open || !stats.data) return;
    let cancelled = false;
    // Pastikan font dimuat sebelum menggambar agar canvas memakai Plus Jakarta Sans.
    // Logo juga dimuat dulu agar ikut tergambar.
    void Promise.allSettled([document.fonts.load(`800 40px ${FONT}`), loadImage(LOGO_FILES.dark)]).then(([, logo]) => {
      if (!cancelled && canvasRef.current && stats.data && logo.status === 'fulfilled') {
        drawCard(canvasRef.current, cardData(stats.data, showName ? firstName : null), format, logo.value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, stats.data, format, showName, firstName]);

  const toBlob = () =>
    new Promise<Blob>((resolve, reject) =>
      canvasRef.current?.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar'))), 'image/png'),
    );
  const filename = `progres-workstracker-${format}.png`;

  const download = async () => {
    const url = URL.createObjectURL(await toBlob());
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Gambar progres diunduh');
  };

  const share = async () => {
    try {
      const file = new File([await toBlob()], filename, { type: 'image/png' });
      await navigator.share({ files: [file], title: 'Progres pencarian kerja saya', text: 'Dilacak dengan WorksTracker' });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Gagal membagikan, coba unduh gambarnya');
    }
  };
  const canShare =
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Bagikan progres</DialogTitle>
          <DialogDescription>Unduh kartu progres untuk dibagikan di Instagram atau LinkedIn.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-muted p-1" role="group" aria-label="Format gambar">
            {(Object.keys(SIZES) as Format[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground',
                  format === f && 'bg-card text-foreground shadow-sm',
                )}
              >
                {SIZES[f].label}
              </button>
            ))}
          </div>
          {firstName && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showName} onCheckedChange={(v) => setShowName(v === true)} />
              Tampilkan nama
            </label>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border bg-muted">
          <canvas
            ref={canvasRef}
            className="mx-auto block h-auto max-h-[55dvh] w-auto max-w-full"
            role="img"
            aria-label="Pratinjau kartu progres"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canShare && (
            <Button variant="outline" onClick={() => void share()}>
              <Share2 />
              Bagikan
            </Button>
          )}
          <Button onClick={() => void download()} disabled={!stats.data}>
            <Download />
            Unduh PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
