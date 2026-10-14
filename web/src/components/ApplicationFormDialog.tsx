import { zodResolver } from '@hookform/resolvers/zod';
import {
  applicationCreateSchema,
  SOURCE_LABELS,
  SOURCES,
  STATUS_LABELS,
  STATUSES,
  todayISO,
  WORK_TYPE_LABELS,
  WORK_TYPES,
  type Application,
  type ApplicationCreate,
  type JobExtract,
} from '@wt/shared';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { formatThousands } from '@/lib/format';
import { useCreateApplication, useUpdateApplication } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from './application-ui';
import { AutoFillPanel } from './ai/AutoFillPanel';
import { ConfirmDialog } from './common';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Textarea } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type FormValues = {
  company: string;
  position: string;
  appliedAt: string;
  status: string;
  source: string;
  location: string;
  workType: string;
  salaryMin: string;
  salaryMax: string;
  jobUrl: string;
  contactName: string;
  contactEmail: string;
  nextActionDate: string;
  nextActionNote: string;
  notes: string;
  jobDescription: string;
};

const NONE = '__none__';
const EXTRA_FIELDS: (keyof FormValues)[] = [
  'nextActionNote',
  'location',
  'workType',
  'salaryMin',
  'salaryMax',
  'jobUrl',
  'contactName',
  'contactEmail',
  'notes',
  'jobDescription',
];

function toFormValues(app: Application | null): FormValues {
  return {
    company: app?.company ?? '',
    position: app?.position ?? '',
    appliedAt: app?.appliedAt ?? todayISO(),
    status: app?.status ?? 'applied',
    source: app?.source ?? 'other',
    location: app?.location ?? '',
    workType: app?.workType ?? '',
    salaryMin: app?.salaryMin != null ? formatThousands(String(app.salaryMin)) : '',
    salaryMax: app?.salaryMax != null ? formatThousands(String(app.salaryMax)) : '',
    jobUrl: app?.jobUrl ?? '',
    contactName: app?.contactName ?? '',
    contactEmail: app?.contactEmail ?? '',
    nextActionDate: app?.nextActionDate ?? '',
    nextActionNote: app?.nextActionNote ?? '',
    notes: app?.notes ?? '',
    jobDescription: app?.jobDescription ?? '',
  };
}

// Skema Zod yang sama dengan API; hasil parse (sudah dinormalisasi) yang dikirim ke server.
const resolver = zodResolver(applicationCreateSchema) as unknown as Resolver<FormValues>;

interface Props {
  open: boolean;
  application: Application | null;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationFormDialog({ open, application, onOpenChange }: Props) {
  const isEdit = application !== null;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const createMutation = useCreateApplication();
  const updateMutation = useUpdateApplication();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver, defaultValues: toFormValues(null) });

  useEffect(() => {
    if (!open) return;
    reset(toFormValues(application));
    setFormError(null);
    setShowMore(
      !!application &&
        !!(application.location || application.salaryMin || application.salaryMax || application.jobUrl ||
          application.contactName || application.contactEmail || application.nextActionDate || application.notes ||
          application.jobDescription),
    );
  }, [open, application, reset]);

  const requestClose = () => {
    if (isDirty && !isSubmitting) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  /** Isi field dari hasil ekstraksi AI (hanya nilai yang ditemukan). */
  const applyExtract = (d: JobExtract) => {
    const opts = { shouldDirty: true, shouldValidate: false };
    const set = (name: keyof FormValues, value: string | number | null) => {
      if (value != null && value !== '') setValue(name, String(value), opts);
    };
    set('company', d.company);
    set('position', d.position);
    set('location', d.location);
    set('workType', d.workType);
    set('source', d.source);
    if (d.salaryMin != null) setValue('salaryMin', formatThousands(String(d.salaryMin)), opts);
    if (d.salaryMax != null) setValue('salaryMax', formatThousands(String(d.salaryMax)), opts);
    set('jobDescription', d.jobDescription);
    set('contactName', d.contactName);
    set('contactEmail', d.contactEmail);
    setShowMore(true);
  };

  // Buka bagian "Detail tambahan" jika ada error di dalamnya agar pesan terlihat.
  const revealErrors = (fields: string[]) => {
    if (fields.some((f) => EXTRA_FIELDS.includes(f as keyof FormValues))) setShowMore(true);
  };

  const onSubmit = handleSubmit(async (values) => {
    const input = values as unknown as ApplicationCreate;
    setFormError(null);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: application.id, input });
        toast.success(`Lamaran ke ${input.company} diperbarui`);
      } else {
        await createMutation.mutateAsync(input);
        toast.success(`Lamaran ke ${input.company} disimpan`);
      }
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [field, message] of Object.entries(e.fields)) {
          if (field in values) setError(field as keyof FormValues, { message });
        }
        revealErrors(Object.keys(e.fields));
      }
      setFormError(errorMessage(e));
    }
  }, (errs) => revealErrors(Object.keys(errs)));

  const salaryField = (name: 'salaryMin' | 'salaryMax') =>
    register(name, {
      onChange: (e) => setValue(name, formatThousands(e.target.value), { shouldDirty: true }),
    });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent className="max-w-2xl" onEscapeKeyDown={(e) => { e.preventDefault(); requestClose(); }}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit lamaran' : 'Tambah lamaran'}</DialogTitle>
            <DialogDescription>
              Kolom bertanda <span aria-hidden>*</span>
              <span className="sr-only">bintang</span> wajib diisi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {formError && <Alert variant="destructive">{formError}</Alert>}
            {!isEdit && <AutoFillPanel onFill={applyExtract} />}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Perusahaan" required error={errors.company?.message}>
                {(p) => <Input {...p} {...register('company')} placeholder="mis. Tokopedia" autoFocus />}
              </Field>
              <Field label="Posisi" required error={errors.position?.message}>
                {(p) => <Input {...p} {...register('position')} placeholder="mis. Frontend Engineer" />}
              </Field>
              <Field label="Tanggal lamar" required error={errors.appliedAt?.message}>
                {(p) => <Input {...p} type="date" max={todayISO()} {...register('appliedAt')} />}
              </Field>
              <Field label="Status" required error={errors.status?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger {...p}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </Field>
              <Field label="Sumber" error={errors.source?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="source"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger {...p}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SOURCES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {SOURCE_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </Field>
              <Field label="Tindak lanjut berikutnya" error={errors.nextActionDate?.message}>
                {(p) => <Input {...p} type="date" {...register('nextActionDate')} />}
              </Field>
            </div>

            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="flex items-center gap-1 self-start rounded text-sm font-medium text-primary hover:underline"
            >
              <ChevronDown className={cn('size-4 transition-transform', showMore && 'rotate-180')} aria-hidden />
              {showMore ? 'Sembunyikan detail tambahan' : 'Detail tambahan (opsional)'}
            </button>

            {showMore && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Catatan tindak lanjut" error={errors.nextActionNote?.message} className="sm:col-span-2">
                  {(p) => <Input {...p} {...register('nextActionNote')} placeholder="mis. Interview user jam 10.00" />}
                </Field>
                <Field label="Lokasi" error={errors.location?.message}>
                  {(p) => <Input {...p} {...register('location')} placeholder="mis. Jakarta" />}
                </Field>
                <Field label="Tipe kerja" error={errors.workType?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="workType"
                      render={({ field }) => (
                        <Select
                          value={field.value || NONE}
                          onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                        >
                          <SelectTrigger {...p}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Tidak diisi</SelectItem>
                            {WORK_TYPES.map((w) => (
                              <SelectItem key={w} value={w}>
                                {WORK_TYPE_LABELS[w]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </Field>
                <Field label="Gaji min (Rp)" error={errors.salaryMin?.message}>
                  {(p) => <Input {...p} inputMode="numeric" placeholder="8.000.000" {...salaryField('salaryMin')} />}
                </Field>
                <Field label="Gaji maks (Rp)" error={errors.salaryMax?.message}>
                  {(p) => <Input {...p} inputMode="numeric" placeholder="12.000.000" {...salaryField('salaryMax')} />}
                </Field>
                <Field label="URL lowongan" error={errors.jobUrl?.message} className="sm:col-span-2">
                  {(p) => <Input {...p} type="url" placeholder="https://" {...register('jobUrl')} />}
                </Field>
                <Field label="Nama kontak HR" error={errors.contactName?.message}>
                  {(p) => <Input {...p} {...register('contactName')} />}
                </Field>
                <Field label="Email kontak HR" error={errors.contactEmail?.message}>
                  {(p) => <Input {...p} type="email" {...register('contactEmail')} />}
                </Field>
                <Field label="Catatan" error={errors.notes?.message} className="sm:col-span-2">
                  {(p) => <Textarea {...p} rows={4} {...register('notes')} />}
                </Field>
                <Field
                  label="Deskripsi lowongan"
                  error={errors.jobDescription?.message}
                  className="sm:col-span-2"
                >
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={6}
                      placeholder="Tempel deskripsi & kualifikasi dari iklan lowongan — dipakai AI Career Assistant."
                      {...register('jobDescription')}
                    />
                  )}
                </Field>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={requestClose}>
                Batal
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {isSubmitting ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Buang perubahan?"
        description="Perubahan yang belum disimpan akan hilang."
        confirmLabel="Buang"
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {' '}
            *
          </span>
        )}
      </Label>
      {children({
        id,
        'aria-invalid': !!error,
        'aria-describedby': error ? errorId : undefined,
        'aria-required': required || undefined,
      })}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
