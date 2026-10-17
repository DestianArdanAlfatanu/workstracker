import { CV_MAX_ACTIVE, CV_MAX_BYTES, CV_TYPES, type CvDocument } from '@wt/shared';
import {
  Archive,
  Download,
  FileText,
  FileUp,
  Info,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/components/application-ui';
import { ConfirmDialog } from '@/components/common';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { downloadCv, useCvs, useDeleteCv, useReplaceCv, useUpdateCv, useUploadCv } from '@/lib/queries';
import { cn } from '@/lib/utils';

const ACCEPT = '.pdf,.doc,.docx,' + Object.keys(CV_TYPES).join(',');
const EXT_OK = /\.(pdf|docx?)$/i;

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Cek cepat di browser; server tetap memeriksa isi file. */
function checkFile(file: File): string | null {
  if (!EXT_OK.test(file.name)) return 'Format CV harus PDF, DOC, atau DOCX.';
  if (file.size > CV_MAX_BYTES) return 'Ukuran CV maksimal 5 MB.';
  return null;
}

const labelFromName = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 100);

const download = (cv: CvDocument) => downloadCv(cv).catch((e) => toast.error(errorMessage(e)));

export function CvPage() {
  const { state } = useAuth();
  const isDemo = !!state.user?.isDemo;
  const { data, isPending } = useCvs();
  const active = (data ?? []).filter((c) => !c.archived);
  const archived = (data ?? []).filter((c) => c.archived);

  if (isPending) return <Skeleton className="h-96 max-w-3xl rounded-2xl bg-card" />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
            <FileText className="size-5" aria-hidden />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">Simpan CV sekali, pakai di banyak lamaran</h2>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground" aria-label="Jumlah CV aktif">
                {active.length}/{CV_MAX_ACTIVE} CV
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Simpan sampai {CV_MAX_ACTIVE} versi CV, misalnya untuk posisi yang berbeda. Saat menambah lamaran, pilih CV
              yang Anda kirim. AI Assistant membaca CV yang dipilih di lamaran itu.
            </p>
          </div>
        </div>
      </Card>

      {active.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Daftar CV">
          {active.map((cv) => (
            <CvCard key={cv.id} cv={cv} readOnly={isDemo} />
          ))}
        </ul>
      )}

      {isDemo ? (
        <Alert variant="info">
          <Info aria-hidden />
          Upload CV dinonaktifkan di mode demo.
        </Alert>
      ) : active.length >= CV_MAX_ACTIVE ? (
        <Alert variant="info">
          <Info aria-hidden />
          <span>Sudah ada {CV_MAX_ACTIVE} CV. Hapus atau ganti file salah satu CV untuk menyimpan versi baru.</span>
        </Alert>
      ) : (
        <UploadCard first={active.length === 0} />
      )}

      {archived.length > 0 && (
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Versi lama ({archived.length})
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            CV yang sudah diganti atau dihapus, tapi masih tercatat di lamaran lama. Disimpan agar Anda tetap tahu CV mana
            yang dikirim. Terhapus otomatis bila tidak ada lamaran yang memakainya lagi.
          </p>
          <ul className="mt-3 divide-y">
            {archived.map((cv) => (
              <li key={cv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <Archive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{cv.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {cv.originalName} · dipakai di {cv.usedBy} lamaran
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => void download(cv)}>
                  <Download />
                  Unduh
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function UploadCard({ first }: { first: boolean }) {
  const upload = useUploadCv();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const problem = checkFile(f);
    setError(problem);
    if (problem) return;
    setFile(f);
    if (!label.trim()) setLabel(labelFromName(f.name));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Pilih file CV dulu.');
    if (!label.trim()) return setError('Beri nama CV, misalnya "CV Frontend".');
    try {
      await upload.mutateAsync({ file, label: label.trim() });
      toast.success(first ? 'CV disimpan dan dijadikan CV utama' : 'CV disimpan');
      setFile(null);
      setLabel('');
      setError(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Unggah CV baru</h3>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors',
            dragging ? 'border-primary bg-accent' : 'border-input hover:bg-muted/50',
          )}
        >
          <FileUp className="size-6 text-primary" aria-hidden />
          {file ? (
            <span className="font-medium break-all">
              {file.name} <span className="font-normal text-muted-foreground">({formatSize(file.size)})</span>
            </span>
          ) : (
            <span>
              <span className="font-semibold text-primary">Pilih file</span> atau seret ke sini
            </span>
          )}
          <span className="text-xs text-muted-foreground">PDF, DOC, atau DOCX, maks. 5 MB</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="File CV"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cv-label">Nama CV</Label>
          <Input
            id="cv-label"
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="mis. CV Frontend, CV Bahasa Inggris"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="self-end" loading={upload.isPending} disabled={!file}>
          {!upload.isPending && <Upload />}
          {upload.isPending ? 'Mengunggah…' : 'Simpan CV'}
        </Button>
      </form>
    </Card>
  );
}

function CvCard({ cv, readOnly }: { cv: CvDocument; readOnly: boolean }) {
  const update = useUpdateCv();
  const replace = useReplaceCv();
  const remove = useDeleteCv();
  const fileRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const makeDefault = () =>
    update.mutate(
      { id: cv.id, input: { isDefault: true } },
      { onSuccess: () => toast.success(`${cv.label} dijadikan CV utama`), onError: (e) => toast.error(errorMessage(e)) },
    );

  const onReplace = (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    const problem = checkFile(f);
    if (problem) return void toast.error(problem);
    replace.mutate(
      { id: cv.id, file: f },
      {
        onSuccess: () =>
          toast.success(
            cv.usedBy
              ? `File diganti. Versi lama tetap tersimpan untuk ${cv.usedBy} lamaran sebelumnya.`
              : 'File CV diganti',
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const onDelete = () =>
    remove.mutate(cv.id, {
      onSuccess: (r) => toast.success(r.archived ? 'CV dipindah ke Versi lama' : 'CV dihapus'),
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <li>
      <Card className={cn('flex items-start gap-3 p-4', cv.isDefault && 'ring-2 ring-primary/40')}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 font-semibold [overflow-wrap:anywhere]">{cv.label}</h3>
            {cv.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                <Star className="size-3" aria-hidden />
                Utama
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{cv.originalName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatSize(cv.size)}
            {cv.pageCount ? ` · ${cv.pageCount} halaman` : ''} · diunggah {formatDate(cv.createdAt)} ·{' '}
            {cv.usedBy ? `dipakai di ${cv.usedBy} lamaran` : 'belum dipakai'}
          </p>
          {!cv.hasText && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {cv.mimeType === 'application/pdf'
                ? 'Teks CV tidak terbaca (kemungkinan hasil scan). AI tetap bisa membaca file PDF-nya.'
                : 'Teks file Word lama ini tidak terbaca. Unggah versi PDF atau DOCX agar bisa dibaca AI.'}
            </p>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={`File pengganti ${cv.label}`}
          onChange={(e) => onReplace(e.target.files?.[0])}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Aksi ${cv.label}`} loading={replace.isPending || remove.isPending}>
              {!(replace.isPending || remove.isPending) && <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void download(cv)} className="rounded-lg">
              <Download />
              Unduh
            </DropdownMenuItem>
            {!readOnly && (
              <>
                {!cv.isDefault && (
                  <DropdownMenuItem onSelect={makeDefault} className="rounded-lg">
                    <Star />
                    Jadikan CV utama
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setRenaming(true)} className="rounded-lg">
                  <Pencil />
                  Ganti nama
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fileRef.current?.click()} className="rounded-lg">
                  <RefreshCw />
                  Ganti file
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setConfirmDelete(true)}
                  className="rounded-lg text-destructive focus:text-destructive"
                >
                  <Trash2 />
                  Hapus
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </Card>

      <RenameDialog cv={cv} open={renaming} onOpenChange={setRenaming} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Hapus ${cv.label}?`}
        description={
          cv.usedBy
            ? `CV ini tercatat di ${cv.usedBy} lamaran. CV dipindah ke "Versi lama" agar lamaran tersebut tetap menunjukkan CV yang dikirim, dan tidak lagi dihitung dalam batas ${CV_MAX_ACTIVE} CV.`
            : 'File CV akan dihapus permanen.'
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={onDelete}
      />
    </li>
  );
}

function RenameDialog({ cv, open, onOpenChange }: { cv: CvDocument; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateCv();
  const [label, setLabel] = useState(cv.label);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    update.mutate(
      { id: cv.id, input: { label: label.trim() } },
      {
        onSuccess: () => {
          toast.success('Nama CV diganti');
          onOpenChange(false);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setLabel(cv.label);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Ganti nama CV</DialogTitle>
            <DialogDescription>Nama ini muncul saat memilih CV di form lamaran.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cv-rename-${cv.id}`}>Nama CV</Label>
            <Input id={`cv-rename-${cv.id}`} value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="submit" loading={update.isPending} disabled={!label.trim()}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
