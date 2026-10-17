import { parseSharedJob, SOURCE_LABELS, STATUS_LABELS, todayISO } from '@wt/shared';
import { ExternalLink, ImageIcon, Link2, ListChecks, Pencil, Share2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApplicationUI } from '@/components/application-ui';
import { usePlan } from '@/components/plan';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SHARE_CACHE } from '@/lib/pwa';
import { useJobLookup, useShareResolve } from '@/lib/queries';

/** Ambil gambar yang dibagikan (disimpan service worker) lalu hapus dari cache. */
async function takeSharedImages(count: number): Promise<File[]> {
  if (!count || !('caches' in window)) return [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    const files: File[] = [];
    for (let i = 0; i < Math.min(count, 4); i++) {
      const res = await cache.match(`/shared/${i}`);
      if (!res) continue;
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get('X-File-Name') ?? `poster-${i + 1}.jpg`);
      files.push(new File([blob], name, { type: blob.type || 'image/jpeg' }));
    }
    await caches.delete(SHARE_CACHE);
    return files;
  } catch {
    return [];
  }
}

/**
 * Tujuan menu Share di HP (PWA Share Target): link/teks/gambar loker dari LinkedIn, Instagram,
 * Jobstreet, dll. langsung menjadi form Tambah lamaran yang terisi.
 */
export function SharePage() {
  const [params] = useSearchParams();
  const ui = useApplicationUI();
  const { has } = usePlan();
  const shared = useMemo(
    () => parseSharedJob({ title: params.get('title'), text: params.get('text'), url: params.get('url') }),
    [params],
  );
  const imageCount = Number(params.get('img') ?? 0);
  const [images, setImages] = useState<File[] | null>(imageCount ? null : []);
  useEffect(() => {
    if (imageCount) void takeSharedImages(imageCount).then(setImages);
  }, [imageCount]);

  // Halaman portal loker dibaca server (judul, perusahaan, deskripsi) bila dari portal yang dikenal.
  const knownPortal = shared.source !== 'company_site' && shared.source !== 'other';
  const resolve = useShareResolve(shared.url, knownPortal);
  const duplicate = useJobLookup(shared.url);

  const info = resolve.data;
  const company = shared.company ?? info?.company ?? null;
  const position = shared.position ?? info?.position ?? null;
  // Cek duplikat harus hasil terbaru (bukan cache) sebelum form dibuka otomatis.
  const ready = images !== null && (!knownPortal || !resolve.isFetching) && (!shared.url || duplicate.isFetchedAfterMount);

  const openForm = () => {
    const deadline = info?.deadline && info.deadline >= todayISO() ? info.deadline : undefined;
    const aiText = [shared.text, info?.description].filter(Boolean).join('\n\n').slice(0, 20000);
    ui.openCreateWith({
      values: {
        company: company ?? undefined,
        position: position ?? undefined,
        location: shared.location ?? info?.location ?? undefined,
        workType: info?.workType ?? undefined,
        jobUrl: shared.url ?? undefined,
        source: shared.source,
        notes: shared.text ? shared.text.slice(0, 5000) : undefined,
        jobDescription: info?.description ?? undefined,
        nextActionDate: deadline,
        nextActionNote: deadline ? 'Batas akhir melamar' : undefined,
      },
      aiText: has('ai') && aiText.length >= 80 ? aiText : undefined,
      aiImages: images?.length ? images : undefined,
    });
  };

  // Langsung buka form saat data siap, kecuali lowongan ini sudah pernah disimpan.
  const opened = useRef(false);
  useEffect(() => {
    if (!ready || opened.current || duplicate.data) return;
    opened.current = true;
    openForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, duplicate.data]);

  const nothing = !shared.url && !shared.text && !imageCount;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
            <Share2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">Loker yang dibagikan</h2>
            <p className="text-sm text-muted-foreground">
              {nothing
                ? 'Tidak ada link atau teks yang diterima.'
                : ready
                  ? 'Periksa form yang terbuka, lalu simpan.'
                  : 'Membaca lowongan…'}
            </p>
          </div>
        </div>

        {params.get('error') && (
          <Alert variant="warning">
            <TriangleAlert aria-hidden />
            Sebagian data yang dibagikan tidak terbaca. Isi sisanya secara manual.
          </Alert>
        )}

        {shared.url && (
          <a
            href={shared.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 break-all rounded-xl bg-muted px-3 py-2 text-sm text-primary"
          >
            <Link2 className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{shared.url}</span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          </a>
        )}

        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Sumber</dt>
          <dd>{SOURCE_LABELS[shared.source]}</dd>
          <dt className="text-muted-foreground">Perusahaan</dt>
          <dd>{company ?? <span className="text-muted-foreground">Belum terbaca</span>}</dd>
          <dt className="text-muted-foreground">Posisi</dt>
          <dd>{position ?? <span className="text-muted-foreground">Belum terbaca</span>}</dd>
          {imageCount > 0 && (
            <>
              <dt className="text-muted-foreground">Gambar</dt>
              <dd className="flex items-center gap-1.5">
                <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                {imageCount} gambar{has('ai') ? ' (bisa dibaca AI di form)' : ''}
              </dd>
            </>
          )}
        </dl>

        {knownPortal && resolve.data && !resolve.data.fetched && (
          <p className="text-xs text-muted-foreground">
            Halaman lowongan tidak bisa dibaca otomatis (mungkin perlu login). Isi perusahaan dan posisi secara manual
            {has('ai') ? ', atau tempel teks lowongan ke Isi otomatis AI.' : '.'}
          </p>
        )}

        {duplicate.data && (
          <Alert variant="warning">
            <TriangleAlert aria-hidden />
            <span>
              Lowongan ini sudah tersimpan: {duplicate.data.position} di {duplicate.data.company} (
              {STATUS_LABELS[duplicate.data.status]}).{' '}
              <button type="button" className="font-semibold underline" onClick={() => ui.openDetail(duplicate.data!.id)}>
                Lihat
              </button>
            </span>
          </Alert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={openForm} disabled={!ready} loading={!ready && !nothing} className="sm:flex-1">
            {ready && <Pencil />}
            {duplicate.data ? 'Tetap simpan sebagai lamaran baru' : 'Buka form lamaran'}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/applications">
              <ListChecks />
              Daftar lamaran
            </Link>
          </Button>
        </div>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Tips: di aplikasi LinkedIn, Instagram, Jobstreet, atau browser, tekan Bagikan lalu pilih WorksTracker. Bisa juga
        membagikan screenshot poster loker.
      </p>
    </div>
  );
}
