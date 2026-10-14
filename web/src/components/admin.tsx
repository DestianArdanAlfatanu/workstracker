import { zodResolver } from '@hookform/resolvers/zod';
import {
  adminCreateUserSchema,
  todayISO,
  type AdminCreateUserInput,
  type AdminCredentials,
  type AdminUser,
} from '@wt/shared';
import { Check, Copy, KeyRound, MessageCircle, Sparkles, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { formatThousands } from '@/lib/format';
import { useCreateBuyer, useSetBuyerAi, useUpdateBuyer } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from './application-ui';
import { Alert } from './ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Textarea } from './ui/input';
import { Label } from './ui/label';

/* ------------------------------------------------------------------ */
/* Form tambah / edit pembeli                                          */
/* ------------------------------------------------------------------ */

type BuyerFormValues = {
  name: string;
  email: string;
  whatsapp: string;
  purchasedAt: string;
  price: string;
  notes: string;
};

const resolver = zodResolver(adminCreateUserSchema) as unknown as Resolver<BuyerFormValues>;

function toFormValues(u: AdminUser | null): BuyerFormValues {
  return {
    name: u?.name ?? '',
    email: u?.email ?? '',
    whatsapp: u?.license?.whatsapp ?? '',
    purchasedAt: u?.license?.purchasedAt ?? todayISO(),
    price: u?.license?.price != null ? formatThousands(String(u.license.price)) : '',
    notes: u?.license?.notes ?? '',
  };
}

export function BuyerFormDialog({
  open,
  buyer,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  buyer: AdminUser | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (creds: AdminCredentials) => void;
}) {
  const isEdit = buyer !== null;
  const createMutation = useCreateBuyer();
  const updateMutation = useUpdateBuyer();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BuyerFormValues>({ resolver, defaultValues: toFormValues(null) });

  useEffect(() => {
    if (!open) return;
    reset(toFormValues(buyer));
    setFormError(null);
  }, [open, buyer, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const input = values as unknown as AdminCreateUserInput;
    setFormError(null);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: buyer.id, input });
        toast.success(`Data ${input.name} diperbarui`);
        onOpenChange(false);
      } else {
        const creds = await createMutation.mutateAsync(input);
        onOpenChange(false);
        onCreated(creds);
      }
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [field, message] of Object.entries(e.fields)) {
          if (field in values) setError(field as keyof BuyerFormValues, { message });
        }
      }
      setFormError(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit data pembeli' : 'Tambah pembeli'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Ubah data akun dan penjualan.'
              : 'Akun dibuat dengan password default yang wajib diganti pembeli saat login pertama.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama" required error={errors.name?.message}>
              {(p) => <Input {...p} autoFocus placeholder="mis. Rina Kartika" {...register('name')} />}
            </Field>
            <Field label="Email (untuk login)" required error={errors.email?.message}>
              {(p) => <Input {...p} type="email" placeholder="rina@email.com" {...register('email')} />}
            </Field>
            <Field label="No. WhatsApp" error={errors.whatsapp?.message}>
              {(p) => <Input {...p} type="tel" inputMode="tel" placeholder="0812xxxxxxxx" {...register('whatsapp')} />}
            </Field>
            <Field label="Tanggal beli" required error={errors.purchasedAt?.message}>
              {(p) => <Input {...p} type="date" max={todayISO()} {...register('purchasedAt')} />}
            </Field>
            <Field label="Harga (Rp)" error={errors.price?.message}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  placeholder="49.000"
                  {...register('price', {
                    onChange: (e) => setValue('price', formatThousands(e.target.value), { shouldDirty: true }),
                  })}
                />
              )}
            </Field>
            <Field label="Catatan admin" error={errors.notes?.message} className="sm:col-span-2">
              {(p) => <Textarea {...p} rows={3} placeholder="mis. Transfer BCA, dari Instagram" {...register('notes')} />}
            </Field>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Menyimpan…' : isEdit ? 'Simpan' : 'Buat akun'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
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
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined })}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kredensial (ditampilkan sekali)                                     */
/* ------------------------------------------------------------------ */

export function credentialsMessage(creds: AdminCredentials, loginUrl: string, isReset: boolean) {
  const first = creds.user.name.split(' ')[0];
  return [
    `Halo ${first}! ${isReset ? 'Password akun WorksTracker kamu sudah di-reset.' : 'Akun WorksTracker kamu sudah aktif 🎉'}`,
    '',
    `Login: ${loginUrl}`,
    `Email: ${creds.user.email}`,
    `Password: ${creds.tempPassword}`,
    '',
    'Saat login nanti kamu akan diminta membuat password baru. Semangat mencari kerja!',
  ].join('\n');
}

export function CredentialsDialog({
  creds,
  isReset,
  onClose,
}: {
  creds: AdminCredentials | null;
  isReset: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'password' | 'message' | null>(null);
  const loginUrl = `${window.location.origin}/login`;
  const message = creds ? credentialsMessage(creds, loginUrl, isReset) : '';
  const whatsapp = creds?.user.license?.whatsapp;

  const copy = async (text: string, what: 'password' | 'message') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Gagal menyalin, silakan salin manual');
    }
  };

  return (
    <Dialog open={creds !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-accent text-primary">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <DialogTitle>{isReset ? 'Password berhasil di-reset' : 'Akun pembeli dibuat'}</DialogTitle>
          <DialogDescription>Kirim kredensial ini ke {creds?.user.name}.</DialogDescription>
        </DialogHeader>

        {creds && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-[5.5rem_1fr] gap-y-2 rounded-xl bg-muted p-4 text-sm">
              <dt className="text-muted-foreground">Login</dt>
              <dd className="break-all">{loginUrl}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all font-medium">{creds.user.email}</dd>
              <dt className="self-center text-muted-foreground">Password</dt>
              <dd className="flex items-center gap-2">
                <code className="rounded-lg bg-card px-2.5 py-1 font-mono text-base font-semibold tracking-wide">
                  {creds.tempPassword}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => copy(creds.tempPassword, 'password')}
                >
                  {copied === 'password' ? <Check /> : <Copy />}
                  <span className="sr-only">Salin password</span>
                </Button>
              </dd>
            </dl>
            <Alert variant="warning">
              <TriangleAlert aria-hidden />
              Password ini hanya ditampilkan sekali. Pembeli wajib menggantinya saat login pertama.
            </Alert>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => copy(message, 'message')}>
            {copied === 'message' ? <Check /> : <Copy />}
            {copied === 'message' ? 'Tersalin' : 'Salin pesan'}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {whatsapp && (
              <Button asChild className="bg-[#128c4a] hover:bg-[#128c4a]/90">
                <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  Kirim via WhatsApp
                </a>
              </Button>
            )}
            <Button type="button" variant={whatsapp ? 'outline' : 'default'} onClick={onClose}>
              Selesai
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Hapus permanen (ketik email untuk konfirmasi)                       */
/* ------------------------------------------------------------------ */

export function DeleteBuyerDialog({
  buyer,
  onOpenChange,
  onConfirm,
}: {
  buyer: AdminUser | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (buyer: AdminUser) => void;
}) {
  const [typed, setTyped] = useState('');
  const id = useId();
  useEffect(() => setTyped(''), [buyer]);
  const matches = !!buyer && typed.trim().toLowerCase() === buyer.email;

  return (
    <AlertDialog open={buyer !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>Hapus akun permanen?</AlertDialogTitle>
          <AlertDialogDescription>
            Akun <strong className="text-foreground">{buyer?.name}</strong> beserta {buyer?.applicationCount ?? 0}{' '}
            lamarannya akan dihapus permanen dan tidak bisa dikembalikan. Untuk menonaktifkan sementara, gunakan
            &ldquo;Nonaktifkan&rdquo;.
          </AlertDialogDescription>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>
            Ketik <span className="font-mono">{buyer?.email}</span> untuk konfirmasi
          </Label>
          <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <Button variant="destructive" disabled={!matches} onClick={() => buyer && onConfirm(buyer)}>
            Hapus permanen
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Pengaturan add-on AI per pembeli                                    */
/* ------------------------------------------------------------------ */

export function AiSettingsDialog({ buyer, onOpenChange }: { buyer: AdminUser | null; onOpenChange: (open: boolean) => void }) {
  const setAi = useSetBuyerAi();
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState('30');
  const id = useId();

  useEffect(() => {
    if (buyer) {
      setEnabled(buyer.aiEnabled);
      setLimit(String(buyer.aiMonthlyLimit));
    }
  }, [buyer]);

  const save = () => {
    if (!buyer) return;
    setAi.mutate(
      { id: buyer.id, input: { aiEnabled: enabled, aiMonthlyLimit: Number(limit) || 0 } },
      {
        onSuccess: (u) => {
          toast.success(u.aiEnabled ? `AI aktif untuk ${u.name} (${u.aiMonthlyLimit}/bulan)` : `AI dinonaktifkan untuk ${u.name}`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={buyer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />
            Add-on AI Career Assistant
          </DialogTitle>
          <DialogDescription>
            {buyer?.name} · terpakai bulan ini: {buyer?.aiUsedThisMonth ?? 0} generate
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          Aktifkan AI untuk pembeli ini
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Batas generate per bulan</Label>
          <Input id={id} type="number" min={0} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} className="w-32" disabled={!enabled} />
          <p className="text-xs text-muted-foreground">
            Estimasi biaya API ±Rp 1.000 per cover letter dan ±Rp 1.800 per persiapan interview (Claude Opus 5.5).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button loading={setAi.isPending} onClick={save}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
