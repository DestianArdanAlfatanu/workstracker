import { AI_CREDIT_COST, MAX_POSTER_BYTES, MAX_POSTER_IMAGES, extractCost, type JobExtract } from '@wt/shared';
import { ChevronDown, ClipboardPaste, FileText, ImagePlus, Lock, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { useAiUsage, useExtractJob } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from '../application-ui';
import { CreditInfo, useUpgradePrompt } from '../plan';
import { Button } from '../ui/button';
import { Textarea } from '../ui/input';

type Mode = 'poster' | 'text';

interface Poster {
  id: string;
  blob: Blob;
  url: string;
  name: string;
}

const MAX_SIDE = 2048;

/**
 * Perkecil gambar di browser (sisi terpanjang 2048 px, JPEG) agar unggah cepat & hemat token.
 * Jika browser tidak bisa membaca formatnya (mis. HEIC), file asli dikirim apa adanya.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type !== 'image/heic') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Panel "Isi otomatis" di form Tambah lamaran: dari poster loker (gambar) atau teks lowongan. Paket Premium. */
export function AutoFillPanel({
  onFill,
  initialText,
  initialImages,
}: {
  onFill: (data: JobExtract) => void;
  /** Bahan awal dari loker yang dibagikan ke aplikasi (panel langsung terbuka). */
  initialText?: string;
  initialImages?: File[];
}) {
  const [open, setOpen] = useState(!!(initialText || initialImages?.length));
  const [mode, setMode] = useState<Mode>(initialImages?.length ? 'poster' : initialText ? 'text' : 'poster');
  const [text, setText] = useState(initialText ?? '');
  const [posters, setPosters] = useState<Poster[]>([]);
  const [posterText, setPosterText] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const usage = useAiUsage();
  const extract = useExtractJob();
  const [upgradeDialog, promptUpgrade] = useUpgradePrompt();
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const u = usage.data;
  const enabled = u?.enabled;
  const cost = mode === 'poster' ? extractCost(posters.length) : AI_CREDIT_COST.job_extract;

  // Bersihkan object URL saat panel ditutup / komponen dilepas.
  const postersRef = useRef(posters);
  postersRef.current = posters;
  useEffect(() => () => postersRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const addFiles = async (files: Iterable<File>) => {
    const images = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (images.length === 0) {
      toast.error('Pilih file gambar (JPG, PNG, WEBP, atau HEIC)');
      return;
    }
    const room = MAX_POSTER_IMAGES - postersRef.current.length;
    if (room <= 0) {
      toast.error(`Maksimal ${MAX_POSTER_IMAGES} gambar per lowongan`);
      return;
    }
    if (images.length > room) toast.info(`Hanya ${room} gambar pertama yang ditambahkan (maks. ${MAX_POSTER_IMAGES}).`);
    const added: Poster[] = [];
    for (const file of images.slice(0, room)) {
      const blob = await shrink(file);
      if (blob.size > MAX_POSTER_BYTES) {
        toast.error(`${file.name} terlalu besar (maks. ${MAX_POSTER_BYTES / 1024 / 1024} MB)`);
        continue;
      }
      added.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), name: file.name || 'poster' });
    }
    setPosters((prev) => [...prev, ...added].slice(0, MAX_POSTER_IMAGES));
  };

  // Gambar yang dibagikan dari aplikasi lain langsung masuk ke daftar poster.
  const initialLoaded = useRef(false);
  useEffect(() => {
    if (initialLoaded.current || !initialImages?.length) return;
    initialLoaded.current = true;
    void addFiles(initialImages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = (pid: string) =>
    setPosters((prev) => {
      prev.filter((p) => p.id === pid).forEach((p) => URL.revokeObjectURL(p.url));
      return prev.filter((p) => p.id !== pid);
    });

  // Tempel gambar dari clipboard (Ctrl+V / tahan-tempel di HP) selama tab poster terbuka.
  useEffect(() => {
    if (!open || mode !== 'poster' || !enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, enabled]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(e.dataTransfer.files);
  };

  const run = () => {
    const vars = mode === 'poster' ? { images: posters.map((p) => p.blob) } : { text };
    extract.mutate(vars, {
      onSuccess: (data) => {
        onFill(data);
        if (mode === 'poster') {
          setPosterText(data.posterText);
          posters.forEach((p) => URL.revokeObjectURL(p.url));
          setPosters([]);
        } else {
          setText('');
          setOpen(false);
        }
        toast.success(
          data.company || data.position
            ? 'Form terisi otomatis. Periksa kembali sebelum menyimpan.'
            : 'AI tidak menemukan info lowongan yang jelas. Coba gambar lain atau isi manual.',
        );
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const canRun = mode === 'poster' ? posters.length > 0 : text.trim().length >= 80;

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-accent/40">
      {upgradeDialog}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-accent-foreground"
      >
        <Sparkles className="size-4" aria-hidden />
        Isi otomatis dari poster atau teks loker
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">AI</span>
        <ChevronDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {enabled === false ? (
            <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Lock className="size-4" aria-hidden />
                Unggah poster loker dari Instagram, AI langsung mengisi form ini. Tersedia di paket Premium.
              </p>
              <Button type="button" size="sm" onClick={() => promptUpgrade('ai')}>
                Lihat paket Premium
              </Button>
            </div>
          ) : (
            <>
              <div className="inline-flex self-start rounded-lg bg-card p-0.5" role="tablist" aria-label="Sumber isi otomatis">
                {(
                  [
                    { key: 'poster', label: 'Dari poster', icon: ImagePlus },
                    { key: 'text', label: 'Dari teks', icon: FileText },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mode === key}
                    onClick={() => setMode(key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground',
                      mode === key && 'bg-primary text-primary-foreground',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'poster' ? (
                <>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-card px-3 py-4 text-center transition-colors',
                      dragging ? 'border-primary bg-accent' : 'border-border',
                    )}
                  >
                    {posters.length > 0 && (
                      <ul className="grid w-full grid-cols-4 gap-2" aria-label="Gambar poster">
                        {posters.map((p, i) => (
                          <li key={p.id} className="relative aspect-[4/5] overflow-hidden rounded-lg border bg-muted">
                            <img src={p.url} alt={`Poster ${i + 1}`} className="size-full object-cover" />
                            <button
                              type="button"
                              onClick={() => remove(p.id)}
                              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                            >
                              <X className="size-3.5" aria-hidden />
                              <span className="sr-only">Hapus poster {i + 1}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {posters.length < MAX_POSTER_IMAGES && (
                      <>
                        <ImagePlus className="size-6 text-primary" aria-hidden />
                        <p className="text-xs text-muted-foreground">
                          Seret gambar ke sini, tempel (<kbd className="font-sans font-semibold">Ctrl+V</kbd>), atau
                        </p>
                        <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                          <ImagePlus />
                          {posters.length ? 'Tambah slide' : 'Pilih gambar poster'}
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Screenshot/simpan poster dari Instagram · maks. {MAX_POSTER_IMAGES} slide · JPG, PNG, WEBP, HEIC
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      className="sr-only"
                      aria-label="Pilih gambar poster"
                      onChange={(e) => {
                        if (e.target.files) void addFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ClipboardPaste className="size-3.5" aria-hidden />
                    Gambar hanya dibaca AI dan tidak disimpan di server.
                  </p>
                </>
              ) : (
                <>
                  <label htmlFor={id} className="text-xs text-muted-foreground">
                    Salin seluruh teks iklan lowongan (LinkedIn, Jobstreet, Glints, caption Instagram, dll.) lalu tempel di sini.
                  </label>
                  <Textarea
                    id={id}
                    rows={5}
                    maxLength={20000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Tempel teks lowongan…"
                  />
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                {u ? <CreditInfo balance={u.balance} unlimited={u.unlimited} cost={cost} /> : <span />}
                <Button type="button" size="sm" loading={extract.isPending} disabled={!canRun} onClick={run}>
                  {!extract.isPending && <Sparkles />}
                  {extract.isPending ? (mode === 'poster' ? 'Membaca poster…' : 'Membaca…') : 'Isi otomatis'}
                </Button>
              </div>

              {posterText && (
                <details className="rounded-lg bg-card px-3 py-2 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold text-accent-foreground">
                    Teks dari poster (cek kembali bila ada yang keliru)
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{posterText}</p>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
