import type { JobExtract } from '@wt/shared';
import { ChevronDown, Lock, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { whatsappLink } from '@/lib/config';
import { useAiUsage, useExtractJob } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from '../application-ui';
import { Button } from '../ui/button';
import { Textarea } from '../ui/input';

/** Panel "Isi otomatis dari teks lowongan" di form Tambah lamaran (add-on AI). */
export function AutoFillPanel({ onFill }: { onFill: (data: JobExtract) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const usage = useAiUsage();
  const extract = useExtractJob();
  const id = useId();
  const enabled = usage.data?.enabled;

  const run = () =>
    extract.mutate(text, {
      onSuccess: (data) => {
        onFill(data);
        setOpen(false);
        setText('');
        toast.success('Form terisi otomatis — periksa kembali sebelum menyimpan');
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-accent/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-accent-foreground"
      >
        <Sparkles className="size-4" aria-hidden />
        Isi otomatis dari teks lowongan
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">AI</span>
        <ChevronDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {enabled === false ? (
            <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Lock className="size-4" aria-hidden />
                Fitur ini bagian dari add-on AI Career Assistant.
              </p>
              <Button asChild size="sm">
                <a
                  href={whatsappLink('Halo admin, saya ingin mengaktifkan add-on AI Career Assistant di WorksTracker.')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Aktifkan via WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <>
              <label htmlFor={id} className="text-xs text-muted-foreground">
                Salin seluruh teks iklan lowongan (LinkedIn, Jobstreet, Glints, dll.) lalu tempel di sini.
              </label>
              <Textarea
                id={id}
                rows={5}
                maxLength={20000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tempel teks lowongan…"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Memakai 1 kuota AI · data bisa diedit sebelum disimpan</span>
                <Button type="button" size="sm" loading={extract.isPending} disabled={text.trim().length < 80} onClick={run}>
                  {!extract.isPending && <Sparkles />}
                  {extract.isPending ? 'Membaca…' : 'Isi otomatis'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
