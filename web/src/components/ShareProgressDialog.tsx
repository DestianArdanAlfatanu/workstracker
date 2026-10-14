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

/** Gambar kartu progres di canvas (tanpa library). */
function drawCard(canvas: HTMLCanvasElement, d: CardData, format: Format, logo: HTMLImageElement) {
  const { w, h } = SIZES[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const s = format === 'story' ? 1 : 0.62; // skala tipografi

  // Latar
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#14162b');
  bg.addColorStop(1, '#202a6b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, w * 0.7);
  glow.addColorStop(0, 'rgba(84,112,255,0.55)');
  glow.addColorStop(1, 'rgba(84,112,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const pad = format === 'story' ? 84 : 64;

  // Logo resmi versi latar gelap (assets/workstracker-logo-on-dark.svg)
  const logoH = 72 * s + 8;
  ctx.drawImage(logo, pad, pad, logoH * LOGO_RATIO, logoH);
  // Judul
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 ${34 * s + 4}px ${FONT}`;
  const top = format === 'story' ? 330 : 190;
  ctx.fillText(`Progres pencarian kerja · ${monthYear.format(new Date())}`, pad, top - 100 * s);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${70 * s + 6}px ${FONT}`;
  ctx.fillText(d.name ? `Perjalanan karier ${d.name}` : 'Perjalanan karierku', pad, top);

  // Angka utama
  if (format === 'story') {
    ctx.font = `800 220px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(num.format(d.total), pad - 6, 600);
    ctx.font = `600 44px ${FONT}`;
    ctx.fillStyle = '#93a3f5';
    ctx.fillText('lamaran dikirim', pad, 670);
  }

  // Kotak statistik
  const stats = [
    ...(format === 'wide' ? [{ v: num.format(d.total), l: 'Lamaran' }] : []),
    { v: num.format(d.interview), l: 'Interview' },
    { v: num.format(d.offer), l: 'Offer' },
    { v: `${num.format(Math.round(d.responseRate))}%`, l: 'Response rate' },
    ...(format === 'story' ? [{ v: d.weekGoal ? `${d.weekCount}/${d.weekGoal}` : num.format(d.weekCount), l: 'Lamaran minggu ini' }] : []),
  ];
  const cols = format === 'story' ? 2 : 4;
  const gap = 24;
  const boxW = (w - pad * 2 - gap * (cols - 1)) / cols;
  const boxH = format === 'story' ? 200 : 170;
  const startY = format === 'story' ? 740 : 290;
  stats.forEach((st, i) => {
    const x = pad + (i % cols) * (boxW + gap);
    const y = startY + Math.floor(i / cols) * (boxH + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 28);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${format === 'story' ? 84 : 64}px ${FONT}`;
    ctx.fillText(st.v, x + 32, y + boxH / 2 + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `500 ${format === 'story' ? 32 : 26}px ${FONT}`;
    ctx.fillText(st.l, x + 32, y + boxH - 32);
  });

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `500 ${30 * s + 6}px ${FONT}`;
  ctx.fillText(`Lacak lamaranmu dengan WorksTracker · ${window.location.host}`, pad, h - pad * 0.8);
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
