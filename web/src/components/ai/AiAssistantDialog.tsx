import {
  AI_LANGUAGES,
  type AiGeneration,
  type AtsRequirement,
  type ApplicationDetail,
  type CoverLetterOptionsInput,
  type InterviewPrepOptionsInput,
  type InterviewQuestion,
} from '@wt/shared';
import {
  Check,
  ClipboardCopy,
  Download,
  FileText,
  ListPlus,
  Lock,
  MessageCircle,
  MessagesSquare,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, apiStream } from '@/lib/api';
import { whatsappLink } from '@/lib/config';
import { formatDateTime } from '@/lib/format';
import {
  useAiUsage,
  useAtsCheck,
  useCareerProfile,
  useCreatePracticeTasks,
  useDeleteGeneration,
  useGenerateInterviewPrep,
  useGenerations,
  useRefreshAi,
  useUpdateGeneration,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from '../application-ui';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/input';

const CONSENT_KEY = 'wt-ai-consent-v1';
const readConsent = () => {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
};
const saveConsent = () => {
  try {
    localStorage.setItem(CONSENT_KEY, '1');
  } catch {
    /* mode privat: persetujuan hanya berlaku sesi ini */
  }
};

const LANG_LABEL: Record<(typeof AI_LANGUAGES)[number], string> = { id: 'Bahasa Indonesia', en: 'English' };
const NO_CV = 'none';

type Tab = 'cover' | 'interview' | 'ats';

// Opsi di form (CV dipilih sebagai id angka atau null).
type CoverOpts = Required<Pick<CoverLetterOptionsInput, 'language' | 'tone' | 'length'>> & {
  cvAttachmentId: number | null;
  extraNotes: string;
};
type PrepOpts = Required<Pick<InterviewPrepOptionsInput, 'language' | 'focus'>> & {
  questionCount: number;
  cvAttachmentId: number | null;
};

export function AiAssistantDialog({
  app,
  open,
  onOpenChange,
}: {
  app: ApplicationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const usage = useAiUsage();
  const profile = useCareerProfile();
  const [tab, setTab] = useState<Tab>('cover');
  const [consent, setConsent] = useState(readConsent);
  const pdfs = app.attachments.filter((a) => a.mimeType === 'application/pdf');
  const u = usage.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />
            AI Career Assistant
          </DialogTitle>
          <DialogDescription>
            {app.position} · {app.company}
          </DialogDescription>
        </DialogHeader>

        {!u ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : !u.enabled ? (
          <Locked />
        ) : !consent ? (
          <Consent
            onAccept={() => {
              saveConsent();
              setConsent(true);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl bg-muted p-1" role="tablist" aria-label="Fitur AI">
                {(
                  [
                    { key: 'cover', label: 'Cover Letter', icon: FileText },
                    { key: 'interview', label: 'Persiapan Interview', icon: MessagesSquare },
                    { key: 'ats', label: 'Cek CV', icon: ScanSearch },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground',
                      tab === key && 'bg-card text-foreground shadow-sm',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                  u.usedThisMonth >= u.limit ? 'bg-[#fde4e4] text-[#a32020]' : 'bg-accent text-accent-foreground',
                )}
              >
                Kuota bulan ini: {u.usedThisMonth}/{u.limit}
              </span>
            </div>

            <InputWarnings hasJobDescription={!!app.jobDescription?.trim()} completeness={profile.data?.completeness} />

            {tab === 'cover' ? (
              <CoverLetterTab app={app} pdfs={pdfs} />
            ) : tab === 'interview' ? (
              <InterviewTab app={app} pdfs={pdfs} />
            ) : (
              <AtsTab app={app} pdfs={pdfs} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Status: terkunci, persetujuan, peringatan input                     */
/* ------------------------------------------------------------------ */

function Locked() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br from-[#eef1fe] to-white px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Lock className="size-5" aria-hidden />
      </span>
      <h3 className="text-lg font-bold">Aktifkan AI Career Assistant</h3>
      <p className="max-w-md text-sm text-muted-foreground">
        Buat cover letter yang dipersonalisasi untuk tiap lamaran dan siapkan interview dengan daftar pertanyaan, poin
        jawaban, dan tips — berdasarkan profil dan deskripsi lowongan Anda. Tersedia sebagai add-on.
      </p>
      <Button asChild>
        <a
          href={whatsappLink('Halo admin, saya ingin mengaktifkan add-on AI Career Assistant di WorksTracker.')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle />
          Aktifkan via WhatsApp
        </a>
      </Button>
    </div>
  );
}

function Consent({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-2xl border p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">Sebelum memakai AI</p>
          <p className="text-muted-foreground">
            Untuk membuat hasil, WorksTracker mengirim data berikut ke penyedia AI (Anthropic): <strong>Profil Karier</strong>,
            data lamaran ini (perusahaan, posisi, lokasi, status, catatan, deskripsi lowongan), dan CV PDF hanya jika Anda
            memilihnya.
          </p>
          <p className="text-muted-foreground">
            Yang <strong>tidak</strong> dikirim: email & nomor Anda, kontak/email HR, gaji, dan lamaran lain. Hasil AI
            disimpan di akun Anda dan bisa dihapus kapan saja. Periksa kembali hasilnya sebelum dikirim.
          </p>
        </div>
      </div>
      <Button className="self-end" onClick={onAccept}>
        <Check />
        Saya mengerti, lanjutkan
      </Button>
    </div>
  );
}

function InputWarnings({ hasJobDescription, completeness }: { hasJobDescription: boolean; completeness?: number }) {
  const items: ReactNode[] = [];
  if (!hasJobDescription) {
    items.push('Deskripsi lowongan belum diisi — tempelkan di form Edit lamaran agar hasil sesuai kebutuhan perusahaan.');
  }
  if (completeness !== undefined && completeness < 60) {
    items.push(
      <>
        Profil karier baru {completeness}% lengkap.{' '}
        <Link to="/profil-karier" className="font-semibold underline underline-offset-2">
          Lengkapi profil
        </Link>{' '}
        agar AI punya bahan yang cukup.
      </>,
    );
  }
  if (items.length === 0) return null;
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden />
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </Alert>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen opsi                                                       */
/* ------------------------------------------------------------------ */

function OptionSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger aria-label={label} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CvSelect({
  pdfs,
  value,
  onChange,
}: {
  pdfs: ApplicationDetail['attachments'];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <OptionSelect
      label="Sertakan CV (PDF)"
      value={value ? String(value) : NO_CV}
      onChange={(v) => onChange(v === NO_CV ? null : Number(v))}
      options={[
        { value: NO_CV, label: pdfs.length ? 'Tanpa CV' : 'Tidak ada lampiran PDF' },
        ...pdfs.map((p) => ({ value: String(p.id), label: p.originalName })),
      ]}
    />
  );
}

function HistoryPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: AiGeneration[];
  selectedId: number | null;
  onSelect: (g: AiGeneration) => void;
}) {
  if (items.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Riwayat:</span>
      {items.map((g, i) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onSelect(g)}
          className={cn(
            'rounded-full border px-2.5 py-1 font-medium',
            g.id === selectedId ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
          )}
        >
          {i === 0 ? 'Terbaru' : formatDateTime(g.createdAt)}
        </button>
      ))}
    </div>
  );
}

function RatingButtons({ g }: { g: AiGeneration }) {
  const update = useUpdateGeneration();
  const rate = (rating: 1 | -1) =>
    update.mutate(
      { id: g.id, input: { rating: g.rating === rating ? null : rating } },
      { onSuccess: () => toast.success('Terima kasih atas penilaiannya'), onError: (e) => toast.error(errorMessage(e)) },
    );
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Nilai hasil AI">
      <Button variant="ghost" size="icon" className={cn('size-8', g.rating === 1 && 'bg-[#dcf7e7] text-[#0f6b3a]')} onClick={() => rate(1)} aria-pressed={g.rating === 1}>
        <ThumbsUp />
        <span className="sr-only">Hasil bagus</span>
      </Button>
      <Button variant="ghost" size="icon" className={cn('size-8', g.rating === -1 && 'bg-[#fde4e4] text-[#a32020]')} onClick={() => rate(-1)} aria-pressed={g.rating === -1}>
        <ThumbsDown />
        <span className="sr-only">Hasil kurang bagus</span>
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cover letter                                                        */
/* ------------------------------------------------------------------ */

function downloadDoc(text: string, filename: string) {
  const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const html = `<html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5}</style></head><body>${paragraphs}</body></html>`;
  const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CoverLetterTab({ app, pdfs }: { app: ApplicationDetail; pdfs: ApplicationDetail['attachments'] }) {
  const generations = useGenerations(app.id);
  const refresh = useRefreshAi();
  const update = useUpdateGeneration();
  const remove = useDeleteGeneration();
  const history = useMemo(() => (generations.data ?? []).filter((g) => g.kind === 'cover_letter'), [generations.data]);

  const [opts, setOpts] = useState<CoverOpts>({
    language: 'id',
    tone: 'formal',
    length: 'medium',
    cvAttachmentId: null,
    extraNotes: '',
  });
  const [selected, setSelected] = useState<AiGeneration | null>(null);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Tampilkan hasil terbaru saat riwayat dimuat.
  useEffect(() => {
    if (!selected && !streaming && history[0]) select(history[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const select = (g: AiGeneration) => {
    setSelected(g);
    setText(g.editedContent ?? g.content ?? '');
  };

  const generate = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setStreaming(true);
    setSelected(null);
    setText('');
    try {
      await apiStream(`/applications/${app.id}/ai/cover-letter`, opts, {
        signal: abort.signal,
        onEvent: (event, data) => {
          const d = data as { text?: string; generation?: AiGeneration; error?: { message: string } };
          if (event === 'delta' && d.text) setText((t) => t + d.text);
          else if (event === 'reset') setText('');
          else if (event === 'done' && d.generation) {
            setSelected(d.generation);
            setText(d.generation.content ?? '');
            toast.success('Cover letter selesai dibuat');
          } else if (event === 'error' && d.error) toast.error(d.error.message);
        },
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        toast.error(e instanceof ApiError ? e.message : 'Gagal membuat cover letter');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      void refresh(app.id);
    }
  };

  const original = selected ? (selected.editedContent ?? selected.content ?? '') : '';
  const dirty = !!selected && text !== original;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <OptionSelect
          label="Bahasa"
          value={opts.language}
          onChange={(language) => setOpts((o) => ({ ...o, language }))}
          options={AI_LANGUAGES.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
        <OptionSelect
          label="Nada"
          value={opts.tone}
          onChange={(tone) => setOpts((o) => ({ ...o, tone }))}
          options={[
            { value: 'formal', label: 'Formal' },
            { value: 'semi_formal', label: 'Semi-formal' },
            { value: 'enthusiastic', label: 'Antusias' },
          ]}
        />
        <OptionSelect
          label="Panjang"
          value={opts.length}
          onChange={(length) => setOpts((o) => ({ ...o, length }))}
          options={[
            { value: 'short', label: 'Singkat' },
            { value: 'medium', label: 'Sedang' },
            { value: 'long', label: 'Panjang' },
          ]}
        />
        <CvSelect pdfs={pdfs} value={opts.cvAttachmentId} onChange={(cvAttachmentId) => setOpts((o) => ({ ...o, cvAttachmentId }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cl-notes" className="text-xs text-muted-foreground">
          Catatan untuk AI (opsional)
        </Label>
        <Textarea
          id="cl-notes"
          rows={2}
          maxLength={1000}
          value={opts.extraNotes}
          onChange={(e) => setOpts((o) => ({ ...o, extraNotes: e.target.value }))}
          placeholder="mis. Tekankan pengalaman memimpin proyek dashboard; saya bisa mulai bulan depan."
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {streaming ? (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            <Square />
            Hentikan
          </Button>
        ) : (
          <Button onClick={() => void generate()}>
            <Sparkles />
            {history.length ? 'Buat versi baru' : 'Buat cover letter'}
          </Button>
        )}
      </div>

      <HistoryPicker items={history} selectedId={selected?.id ?? null} onSelect={select} />

      {(streaming || text) && (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Cover letter"
            value={text}
            readOnly={streaming}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className={cn('font-[inherit] leading-relaxed', streaming && 'bg-muted/40')}
          />
          <p className="sr-only" aria-live="polite">
            {streaming ? 'AI sedang menulis cover letter' : 'Cover letter siap'}
          </p>
          {!streaming && selected && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard.writeText(text).then(
                      () => toast.success('Disalin ke clipboard'),
                      () => toast.error('Gagal menyalin'),
                    )
                  }
                >
                  <ClipboardCopy />
                  Salin
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadDoc(text, `Cover Letter - ${app.company}.doc`)}>
                  <Download />
                  Unduh .doc
                </Button>
                {dirty && (
                  <Button
                    size="sm"
                    loading={update.isPending}
                    onClick={() =>
                      update.mutate(
                        { id: selected.id, input: { editedContent: text } },
                        {
                          onSuccess: (g) => {
                            setSelected(g);
                            toast.success('Perubahan disimpan');
                          },
                          onError: (e) => toast.error(errorMessage(e)),
                        },
                      )
                    }
                  >
                    Simpan perubahan
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <RatingButtons g={selected} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    remove.mutate(
                      { id: selected.id, applicationId: app.id },
                      {
                        onSuccess: () => {
                          setSelected(null);
                          setText('');
                          toast.success('Cover letter dihapus');
                        },
                      },
                    )
                  }
                >
                  <Trash2 />
                  <span className="sr-only">Hapus cover letter ini</span>
                </Button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Teks dalam [kurung siku] adalah bagian yang perlu Anda lengkapi. Selalu periksa fakta sebelum mengirim.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Persiapan interview                                                 */
/* ------------------------------------------------------------------ */

const CATEGORY_LABEL: Record<InterviewQuestion['category'], { label: string; cls: string }> = {
  behavioral: { label: 'Perilaku', cls: 'bg-violet-50 text-violet-800' },
  technical: { label: 'Teknis', cls: 'bg-accent text-accent-foreground' },
  motivation: { label: 'Motivasi', cls: 'bg-amber-50 text-amber-900' },
  situational: { label: 'Situasional', cls: 'bg-[#dcf7e7] text-[#0f6b3a]' },
};

function InterviewTab({ app, pdfs }: { app: ApplicationDetail; pdfs: ApplicationDetail['attachments'] }) {
  const generations = useGenerations(app.id);
  const generate = useGenerateInterviewPrep();
  const createTasks = useCreatePracticeTasks();
  const history = useMemo(() => (generations.data ?? []).filter((g) => g.kind === 'interview_prep'), [generations.data]);
  const [opts, setOpts] = useState<PrepOpts>({
    language: 'id',
    focus: 'mixed',
    questionCount: 10,
    cvAttachmentId: null,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState(0);

  const selected = history.find((g) => g.id === selectedId) ?? history[0] ?? null;
  const prep = selected?.prep;

  useEffect(() => setPicked(new Set()), [selected?.id]);
  useEffect(() => {
    if (!generate.isPending) return setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [generate.isPending]);

  const run = () =>
    generate.mutate(
      { applicationId: app.id, input: opts },
      {
        onSuccess: (g) => {
          setSelectedId(g.id);
          toast.success('Persiapan interview siap');
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const toTasks = () =>
    selected &&
    createTasks.mutate(
      { id: selected.id, questionIndexes: [...picked] },
      {
        onSuccess: ({ count }) => {
          setPicked(new Set());
          toast.success(`${count} tugas latihan ditambahkan ke Tugas`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <OptionSelect
          label="Bahasa"
          value={opts.language}
          onChange={(language) => setOpts((o) => ({ ...o, language }))}
          options={AI_LANGUAGES.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
        <OptionSelect
          label="Fokus"
          value={opts.focus}
          onChange={(focus) => setOpts((o) => ({ ...o, focus }))}
          options={[
            { value: 'mixed', label: 'Campuran' },
            { value: 'behavioral', label: 'Perilaku (STAR)' },
            { value: 'technical', label: 'Teknis' },
            { value: 'hr', label: 'Interview HR' },
          ]}
        />
        <OptionSelect
          label="Jumlah pertanyaan"
          value={String(opts.questionCount)}
          onChange={(v) => setOpts((o) => ({ ...o, questionCount: Number(v) }))}
          options={['5', '8', '10', '12', '15'].map((n) => ({ value: n, label: n }))}
        />
        <CvSelect pdfs={pdfs} value={opts.cvAttachmentId} onChange={(cvAttachmentId) => setOpts((o) => ({ ...o, cvAttachmentId }))} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} loading={generate.isPending}>
          {!generate.isPending && <Sparkles />}
          {generate.isPending ? 'Menyusun…' : history.length ? 'Buat ulang' : 'Siapkan interview'}
        </Button>
        {generate.isPending && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            AI sedang menganalisis lowongan & profil Anda ({elapsed} dtk, biasanya 20–60 dtk)…
          </span>
        )}
      </div>

      <HistoryPicker items={history} selectedId={selected?.id ?? null} onSelect={(g) => setSelectedId(g.id)} />

      {prep && selected && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-accent/60 p-4 text-sm">
            <p className="mb-1 font-semibold">Gambaran</p>
            <p className="text-muted-foreground">{prep.overview}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Pertanyaan yang mungkin ditanyakan ({prep.questions.length})</h3>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={picked.size === 0} loading={createTasks.isPending} onClick={toTasks}>
                <ListPlus />
                Jadikan tugas latihan{picked.size ? ` (${picked.size})` : ''}
              </Button>
              <RatingButtons g={selected} />
            </div>
          </div>

          <ol className="flex flex-col gap-2">
            {prep.questions.map((q, i) => {
              const cat = CATEGORY_LABEL[q.category];
              return (
                <li key={i} className="rounded-xl border">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-3 p-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={picked.has(i)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(v) =>
                          setPicked((s) => {
                            const next = new Set(s);
                            if (v === true) next.add(i);
                            else next.delete(i);
                            return next;
                          })
                        }
                        aria-label={`Pilih pertanyaan ${i + 1} untuk dijadikan tugas latihan`}
                      />
                      <span className="flex-1">
                        <span className={cn('mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold', cat.cls)}>{cat.label}</span>
                        <span className="text-sm font-semibold">
                          {i + 1}. {q.question}
                        </span>
                      </span>
                      <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </summary>
                    <div className="grid gap-3 border-t px-3 py-3 pl-10 text-sm sm:grid-cols-2">
                      <Section title="Mengapa ditanyakan">{q.whyAsked}</Section>
                      <Section title="Yang perlu dihindari">{q.avoid}</Section>
                      <Section title="Poin dari pengalaman Anda">
                        <ul className="list-disc pl-4">
                          {q.pointsToHighlight.map((p, j) => (
                            <li key={j}>{p}</li>
                          ))}
                        </ul>
                      </Section>
                      <Section title="Kerangka jawaban">
                        <ol className="list-decimal pl-4">
                          {q.answerOutline.map((p, j) => (
                            <li key={j}>{p}</li>
                          ))}
                        </ol>
                      </Section>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm font-bold">Pertanyaan untuk pewawancara</p>
              <ul className="list-disc pl-4 text-sm text-muted-foreground">
                {prep.questionsToAsk.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm font-bold">Tips akhir</p>
              <ul className="list-disc pl-4 text-sm text-muted-foreground">
                {prep.finalTips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Dibuat {formatDateTime(selected.createdAt)} · hasil AI dapat keliru, sesuaikan dengan pengalaman Anda.</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cek kecocokan CV (ATS)                                              */
/* ------------------------------------------------------------------ */

function scoreTone(score: number) {
  if (score >= 85) return { color: '#1baf7a', label: 'Sangat cocok' };
  if (score >= 70) return { color: 'var(--primary)', label: 'Cocok' };
  if (score >= 50) return { color: '#eda100', label: 'Cukup' };
  return { color: '#e34948', label: 'Kurang cocok' };
}

function ScoreRing({ score }: { score: number }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative size-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`Skor kecocokan ${score} dari 100`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--chart-track)" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={tone.color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{score}</span>
        <span className="text-[11px] text-muted-foreground">dari 100</span>
      </div>
    </div>
  );
}

const REQ_STATUS: Record<AtsRequirement['status'], { label: string; cls: string; icon: string }> = {
  met: { label: 'Terpenuhi', cls: 'bg-[#dcf7e7] text-[#0f6b3a]', icon: '✓' },
  partial: { label: 'Sebagian', cls: 'bg-amber-50 text-amber-900', icon: '◐' },
  missing: { label: 'Belum ada', cls: 'bg-[#fde4e4] text-[#a32020]', icon: '✕' },
};

function AtsTab({ app, pdfs }: { app: ApplicationDetail; pdfs: ApplicationDetail['attachments'] }) {
  const generations = useGenerations(app.id);
  const check = useAtsCheck();
  const history = useMemo(() => (generations.data ?? []).filter((g) => g.kind === 'ats_check'), [generations.data]);
  const [language, setLanguage] = useState<'id' | 'en'>('id');
  const [cvAttachmentId, setCv] = useState<number | null>(pdfs[0]?.id ?? null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = history.find((g) => g.id === selectedId) ?? history[0] ?? null;
  const ats = selected?.ats;
  const hasJd = !!app.jobDescription?.trim();

  const run = () =>
    check.mutate(
      { applicationId: app.id, input: { language, cvAttachmentId } },
      {
        onSuccess: (g) => {
          setSelectedId(g.id);
          toast.success('Pengecekan CV selesai');
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Bandingkan CV {pdfs.length ? '' : '(atau Profil Karier) '}dengan deskripsi lowongan: skor kecocokan, kata kunci yang
        hilang, dan saran perbaikan CV.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <OptionSelect
          label="Bahasa"
          value={language}
          onChange={setLanguage}
          options={AI_LANGUAGES.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
        <div className="sm:col-span-2">
          <CvSelect pdfs={pdfs} value={cvAttachmentId} onChange={setCv} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} loading={check.isPending} disabled={!hasJd}>
          {!check.isPending && <ScanSearch />}
          {check.isPending ? 'Menganalisis…' : history.length ? 'Cek ulang' : 'Cek kecocokan CV'}
        </Button>
        {!hasJd && <span className="text-sm text-muted-foreground">Isi deskripsi lowongan dulu (Edit lamaran).</span>}
      </div>

      <HistoryPicker items={history} selectedId={selected?.id ?? null} onSelect={(g) => setSelectedId(g.id)} />

      {ats && selected && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-4 rounded-2xl border p-4 sm:flex-row">
            <ScoreRing score={ats.score} />
            <div className="flex-1 text-center sm:text-left">
              <p className="text-lg font-bold">{ats.verdict || scoreTone(ats.score).label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{ats.summary}</p>
            </div>
            <RatingButtons g={selected} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <KeywordList title="Kata kunci yang cocok" items={ats.matchedKeywords} matched />
            <KeywordList title="Kata kunci yang belum ada" items={ats.missingKeywords} />
          </div>

          <div className="rounded-xl border">
            <p className="border-b px-4 py-2.5 text-sm font-bold">Kebutuhan lowongan</p>
            <ul className="divide-y">
              {ats.requirements.map((r, i) => {
                const st = REQ_STATUS[r.status];
                return (
                  <li key={i} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{r.requirement}</span>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', st.cls)}>
                        <span aria-hidden>{st.icon} </span>
                        {st.label}
                      </span>
                    </div>
                    {r.evidence && <p className="text-xs text-muted-foreground">Bukti: {r.evidence}</p>}
                    {r.suggestion && <p className="text-xs">Saran: {r.suggestion}</p>}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm font-bold">Perbaikan CV</p>
              <ul className="list-disc pl-4 text-sm text-muted-foreground">
                {ats.cvImprovements.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm font-bold">Langkah berikutnya</p>
              <ul className="list-disc pl-4 text-sm text-muted-foreground">
                {ats.nextSteps.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dibuat {formatDateTime(selected.createdAt)} · hanya tambahkan kata kunci yang benar-benar sesuai pengalaman Anda.
          </p>
        </div>
      )}
    </div>
  );
}

function KeywordList({ title, items, matched }: { title: string; items: string[]; matched?: boolean }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="mb-2 text-sm font-bold">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((k) => (
            <li
              key={k}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                matched ? 'bg-[#dcf7e7] text-[#0f6b3a]' : 'bg-[#fde4e4] text-[#a32020]',
              )}
            >
              <span aria-hidden>{matched ? '✓ ' : '+ '}</span>
              {k}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}