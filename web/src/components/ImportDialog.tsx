import {
  duplicateKeys,
  IMPORT_BATCH_SIZE,
  IMPORT_FIELDS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  parseDelimited,
  SOURCE_LABELS,
  STATUS_LABELS,
  prepareRow,
  splitHeader,
  suggestMapping,
  type ImportCell,
  type ImportField,
  type ImportMapping,
  type PreparedRow,
} from '@wt/shared';
import { ArrowLeft, CheckCircle2, ClipboardPaste, Download, FileUp, TriangleAlert, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import { commitImport, downloadImportTemplate, parseImportFile, useBulkAction, useRefreshWork } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from './application-ui';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const UNUSED = 'none';
const PREVIEW_ROWS = 20;

interface Source {
  name: string;
  headers: string[];
  rows: ImportCell[][];
}

type Step = 'pick' | 'map' | 'preview' | 'saving' | 'done';

interface Done {
  created: number;
  ids: number[];
  skipped: Array<{ line: number; reason: string }>;
}

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Impor lamaran dari Excel/CSV atau tempel dari Google Sheets: pilih file → cocokkan kolom → pratinjau → simpan. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<Step>('pick');
  const [source, setSource] = useState<Source | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [fillEmptyDate, setFillEmptyDate] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [dbDuplicates, setDbDuplicates] = useState<Set<number> | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useRefreshWork();
  const bulk = useBulkAction();

  const reset = () => {
    setStep('pick');
    setSource(null);
    setMapping({});
    setDbDuplicates(null);
    setProgress(0);
    setDone(null);
    setError(null);
  };

  const close = (o: boolean) => {
    if (step === 'saving') return; // tunggu sampai selesai menyimpan
    onOpenChange(o);
    if (!o) setTimeout(reset, 200);
  };

  const load = (s: Source, suggested?: ImportMapping) => {
    if (s.rows.length === 0) return setError('Tidak ada data. Baris pertama harus judul kolom, data mulai baris kedua.');
    if (s.rows.length > IMPORT_MAX_ROWS) return setError(`Maksimal ${IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris per impor.`);
    setError(null);
    setSource(s);
    setMapping(suggested ?? suggestMapping(s.headers));
    setStep('map');
  };

  /* ------------------------- Baris siap / bermasalah ------------------------- */
  const prepared = useMemo(() => {
    if (!source) return [];
    const seen = new Set<string>();
    return source.rows.map((row, i) => {
      const r = prepareRow(row, mapping, { fillEmptyDate }, i + 2);
      let inFileDuplicate = false;
      if (r.data) {
        const keys = duplicateKeys(r.data);
        inFileDuplicate = keys.some((k) => seen.has(k));
        keys.forEach((k) => seen.add(k));
      }
      return { ...r, inFileDuplicate };
    });
  }, [source, mapping, fillEmptyDate]);

  const ready = prepared.filter((r) => r.data && !r.inFileDuplicate);
  const invalid = prepared.filter((r) => !r.data);
  const fileDuplicates = prepared.filter((r) => r.inFileDuplicate);
  const warned = ready.filter((r) => r.warnings.length);
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && f.key !== 'appliedAt' && mapping[f.key] === undefined);
  const dbDupCount = dbDuplicates ? ready.filter((r) => dbDuplicates.has(r.line)).length : 0;
  const toSave = skipDuplicates && dbDuplicates ? ready.filter((r) => !dbDuplicates.has(r.line)) : ready;

  const payload = (rows: PreparedRow[]) => rows.map((r) => ({ line: r.line, input: r.input as Record<string, unknown> }));

  const goPreview = async () => {
    setStep('preview');
    setDbDuplicates(null);
    try {
      const dup = new Set<number>();
      for (const batch of chunk(ready, IMPORT_BATCH_SIZE)) {
        const r = await commitImport({ rows: payload(batch), dryRun: true });
        r.skipped.filter((s) => s.duplicate).forEach((s) => dup.add(s.line));
      }
      setDbDuplicates(dup);
    } catch (e) {
      setDbDuplicates(new Set());
      setError(errorMessage(e));
    }
  };

  const save = async () => {
    setStep('saving');
    setError(null);
    const result: Done = { created: 0, ids: [], skipped: [] };
    const batches = chunk(toSave, IMPORT_BATCH_SIZE);
    try {
      for (const [i, batch] of batches.entries()) {
        const r = await commitImport({ rows: payload(batch), skipDuplicates });
        result.created += r.created;
        result.ids.push(...r.ids);
        result.skipped.push(...r.skipped);
        setProgress(Math.round(((i + 1) / batches.length) * 100));
      }
      setDone(result);
      setStep('done');
    } catch (e) {
      // Batch yang sudah tersimpan tetap ada; tampilkan hasil sejauh ini.
      setError(errorMessage(e));
      setDone(result);
      setStep('done');
    } finally {
      void refresh();
    }
  };

  const undo = (ids: number[]) =>
    Promise.all(chunk(ids, 500).map((part) => bulk.mutateAsync({ action: 'delete', ids: part })))
      .then(() => {
        toast.success(`${ids.length} lamaran hasil impor dibatalkan`);
        close(false);
      })
      .catch((e) => toast.error(errorMessage(e)));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Impor lamaran</DialogTitle>
          <DialogDescription>
            {step === 'pick' && 'Pindahkan catatan lamaran dari Excel, CSV, atau Google Sheets.'}
            {step === 'map' && `${source?.name}: ${source?.rows.length} baris. Cocokkan kolom file dengan data WorksTracker.`}
            {step === 'preview' && 'Periksa hasilnya sebelum disimpan.'}
            {step === 'saving' && 'Menyimpan lamaran…'}
            {step === 'done' && 'Impor selesai.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            {error}
          </Alert>
        )}

        {step === 'pick' && <PickStep onLoad={load} onError={setError} />}

        {step === 'map' && source && (
          <>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {IMPORT_FIELDS.map((f) => (
                <ColumnSelect
                  key={f.key}
                  field={f.key}
                  label={f.label}
                  required={f.required}
                  hint={f.hint}
                  headers={source.headers}
                  sample={source.rows[0]}
                  value={mapping[f.key]}
                  onChange={(col) =>
                    setMapping((m) => {
                      const next = { ...m };
                      // Satu kolom hanya untuk satu field.
                      for (const k of Object.keys(next) as ImportField[]) if (next[k] === col) delete next[k];
                      if (col === undefined) delete next[f.key];
                      else next[f.key] = col;
                      return next;
                    })
                  }
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={fillEmptyDate} onCheckedChange={(v) => setFillEmptyDate(v === true)} />
              Tanggal lamar kosong diisi tanggal hari ini
            </label>
            {missingRequired.length > 0 && (
              <p className="text-sm font-medium text-destructive">Pilih kolom untuk: {missingRequired.map((f) => f.label).join(', ')}.</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('pick')}>
                <ArrowLeft />
                Ganti file
              </Button>
              <Button onClick={() => void goPreview()} disabled={missingRequired.length > 0}>
                Lanjut ke pratinjau
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Ringkasan impor">
              <Stat label="Siap diimpor" value={toSave.length} tone="ok" />
              <Stat label="Bermasalah" value={invalid.length} tone={invalid.length ? 'bad' : undefined} />
              <Stat label="Sudah ada" value={dbDuplicates ? dbDupCount : '…'} />
              <Stat label="Ganda di file" value={fileDuplicates.length} />
            </div>

            <PreviewList rows={ready.slice(0, PREVIEW_ROWS)} total={ready.length} duplicates={dbDuplicates} />

            {invalid.length > 0 && (
              <details className="rounded-xl border p-3 text-sm" open={ready.length === 0}>
                <summary className="cursor-pointer font-semibold">{invalid.length} baris bermasalah (dilewati)</summary>
                <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {invalid.map((r) => (
                    <li key={r.line}>
                      <span className="font-medium">Baris {r.line}:</span> <span className="text-destructive">{r.errors.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {warned.length > 0 && (
              <details className="rounded-xl border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">{warned.length} baris dengan catatan</summary>
                <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-muted-foreground">
                  {warned.map((r) => (
                    <li key={r.line}>
                      <span className="font-medium text-foreground">Baris {r.line}:</span> {r.warnings.join('; ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {dbDupCount > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(v === true)} />
                Lewati {dbDupCount} lamaran yang sudah ada di WorksTracker
              </label>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('map')}>
                <ArrowLeft />
                Ubah kolom
              </Button>
              <Button onClick={() => void save()} disabled={!dbDuplicates || toSave.length === 0}>
                Impor {toSave.length} lamaran
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'saving' && (
          <div className="flex flex-col gap-2 py-6">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--chart-track)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progres impor">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(progress, 5)}%` }} />
            </div>
            <p className="text-center text-sm text-muted-foreground">Menyimpan {toSave.length} lamaran…</p>
          </div>
        )}

        {step === 'done' && done && (
          <>
            <div className="flex items-start gap-3 rounded-2xl bg-accent p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold">{done.created} lamaran diimpor</p>
                {done.skipped.length > 0 && <p className="text-muted-foreground">{done.skipped.length} baris dilewati.</p>}
              </div>
            </div>
            {done.skipped.length > 0 && (
              <details className="rounded-xl border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Baris yang dilewati</summary>
                <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-muted-foreground">
                  {done.skipped.map((s) => (
                    <li key={s.line}>
                      <span className="font-medium text-foreground">Baris {s.line}:</span> {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <DialogFooter>
              {done.ids.length > 0 && (
                <Button variant="outline" onClick={() => void undo(done.ids)} loading={bulk.isPending}>
                  {!bulk.isPending && <Undo2 />}
                  Batalkan impor
                </Button>
              )}
              <Button onClick={() => close(false)}>Selesai</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickStep({ onLoad, onError }: { onLoad: (s: Source, mapping?: ImportMapping) => void; onError: (m: string | null) => void }) {
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(xlsx|csv|tsv|txt|xls)$/i.test(file.name)) return onError('Gunakan file .xlsx atau .csv');
    if (file.size > IMPORT_MAX_BYTES) return onError('Ukuran file maksimal 2 MB');
    setBusy(true);
    onError(null);
    try {
      const r = await parseImportFile(file);
      onLoad({ name: r.sheet ? `${file.name} (sheet ${r.sheet})` : file.name, headers: r.headers, rows: r.rows }, r.suggestedMapping);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const usePasted = () => {
    const { headers, rows } = splitHeader(parseDelimited(pasted));
    onLoad({ name: 'Data tempel', headers, rows });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 rounded-xl bg-muted p-1 sm:inline-flex sm:self-start" role="tablist" aria-label="Sumber data">
        {(
          [
            { key: 'file', label: 'Unggah file', icon: FileUp },
            { key: 'paste', label: 'Tempel dari Google Sheets', icon: ClipboardPaste },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-center text-sm font-medium leading-tight text-muted-foreground',
              mode === key && 'bg-card text-foreground shadow-sm',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pickFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors',
            dragging ? 'border-primary bg-accent' : 'border-input hover:bg-muted/50',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <FileUp className="size-6 text-primary" aria-hidden />
          <span>{busy ? 'Membaca file…' : <><span className="font-semibold text-primary">Pilih file</span> atau seret ke sini</>}</span>
          <span className="text-xs text-muted-foreground">Excel (.xlsx) atau CSV, maks. 2 MB dan {IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris</span>
          <input
            type="file"
            accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="File spreadsheet"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-paste">Salin tabel di Google Sheets (termasuk baris judul), lalu tempel di sini</Label>
          <Textarea
            id="import-paste"
            rows={7}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'Perusahaan\tPosisi\tTanggal lamar\tStatus\nTokopedia\tFrontend Engineer\t03/10/2026\tInterview'}
            className="font-mono text-xs"
          />
          <Button className="self-end" onClick={usePasted} disabled={!pasted.trim()}>
            Lanjut
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Kolom dicocokkan otomatis (Perusahaan, Posisi, Tanggal, Status, Link, dll.). Dari Google Sheets juga bisa lewat
          File, Download, lalu .xlsx atau .csv.
        </p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => void downloadImportTemplate().catch((e) => toast.error(errorMessage(e)))}>
          <Download />
          Unduh template
        </Button>
      </div>
    </div>
  );
}

function ColumnSelect({
  field,
  label,
  required,
  hint,
  headers,
  sample,
  value,
  onChange,
}: {
  field: ImportField;
  label: string;
  required?: boolean;
  hint?: string;
  headers: string[];
  sample?: ImportCell[];
  value: number | undefined;
  onChange: (col: number | undefined) => void;
}) {
  const id = `import-col-${field}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      <Select value={value === undefined ? UNUSED : String(value)} onValueChange={(v) => onChange(v === UNUSED ? undefined : Number(v))}>
        <SelectTrigger id={id} aria-label={`Kolom untuk ${label}`} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNUSED}>Tidak dipakai</SelectItem>
          {headers.map((h, i) => {
            const s = sample?.[i];
            const example = s == null || s === '' ? '' : String(s).slice(0, 24);
            return (
              <SelectItem key={i} value={String(i)}>
                {h}
                {example && <span className="text-muted-foreground"> (mis. {example})</span>}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'bad' }) {
  return (
    <div className={cn('rounded-xl border p-3', tone === 'ok' && 'border-primary/30 bg-accent', tone === 'bad' && 'border-destructive/30 bg-red-50 dark:bg-red-950/30')}>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function PreviewList({ rows, total, duplicates }: { rows: PreparedRow[]; total: number; duplicates: Set<number> | null }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Tidak ada baris yang siap diimpor.</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">
        Pratinjau {rows.length} dari {total} baris siap
      </p>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-xl border" aria-label="Pratinjau impor">
        {rows.map((r) => {
          const d = r.data!;
          return (
            <li key={r.line} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
              <span className="w-12 shrink-0 text-xs text-muted-foreground">#{r.line}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{d.company}</span>
                <span className="text-muted-foreground"> · {d.position}</span>
              </span>
              <span className="flex shrink-0 flex-wrap gap-1.5 text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5">{formatDate(d.appliedAt)}</span>
                <span className="rounded bg-muted px-1.5 py-0.5">{STATUS_LABELS[d.status]}</span>
                <span className="rounded bg-muted px-1.5 py-0.5">{SOURCE_LABELS[d.source]}</span>
                {duplicates?.has(r.line) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">sudah ada</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
