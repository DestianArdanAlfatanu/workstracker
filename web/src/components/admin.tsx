import { zodResolver } from '@hookform/resolvers/zod';
import {
  adminCreateUserSchema,
  PLAN_KEYS,
  PLANS,
  planRank,
  TOPUPS,
  todayISO,
  upgradePrice,
  type AdminCreateUserInput,
  type AdminCredentials,
  type AdminUser,
  type Plan,
} from '@wt/shared';
import { ArrowUpCircle, Check, Coins, Copy, KeyRound, MessageCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { formatDate, formatRupiah, formatThousands } from '@/lib/format';
import { useAddBuyerCredits, useBuyerPurchases, useCreateBuyer, useSetBuyerPlan, useUpdateBuyer } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from './application-ui';
import { PlanBadge } from './plan';
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
  plan: Plan;
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
    plan: u?.plan ?? 'standard',
    whatsapp: u?.license?.whatsapp ?? '',
    purchasedAt: u?.license?.purchasedAt ?? todayISO(),
    price: u?.license?.price != null ? formatThousands(String(u.license.price)) : u ? '' : formatThousands(String(PLANS.standard.price)),
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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BuyerFormValues>({ resolver, defaultValues: toFormValues(null) });
  const plan = watch('plan');

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
          {!isEdit && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Paket</legend>
              <PlanPicker
                value={plan}
                onChange={(p) => {
                  setValue('plan', p, { shouldDirty: true });
                  setValue('price', formatThousands(String(PLANS[p].price)), { shouldDirty: true });
                }}
              />
              {plan === 'premium' && (
                <p className="text-xs text-muted-foreground">Termasuk {PLANS.premium.credits} kredit AI.</p>
              )}
            </fieldset>
          )}
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
                  placeholder="24.999"
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
    `Halo ${first}! ${isReset ? 'Password akun WorksTracker kamu sudah di-reset.' : 'Akun WorksTracker kamu sudah aktif.'}`,
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
/* Paket & kredit AI per pembeli                                       */
/* ------------------------------------------------------------------ */

function PlanPicker({ value, onChange, current }: { value: Plan; onChange: (p: Plan) => void; current?: Plan }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Paket">
      {PLAN_KEYS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          disabled={current === p}
          onClick={() => onChange(p)}
          className={cn(
            'flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === p ? 'border-primary bg-accent ring-1 ring-primary' : 'hover:bg-muted',
          )}
        >
          <span className="text-sm font-semibold">{PLANS[p].name}</span>
          <span className="text-xs text-muted-foreground">{formatRupiah(PLANS[p].price)}</span>
          {current === p && <span className="text-[10px] font-semibold text-muted-foreground">Paket sekarang</span>}
        </button>
      ))}
    </div>
  );
}

const toNumber = (v: string) => Number(v.replace(/\D/g, '')) || 0;

function PurchaseHistory({ buyerId }: { buyerId: number }) {
  const { data } = useBuyerPurchases(buyerId);
  if (!data?.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Riwayat upgrade & isi ulang</p>
      <ul className="max-h-32 divide-y overflow-y-auto rounded-xl border text-xs">
        {data.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span>
              {formatDate(p.paidAt)} ·{' '}
              {p.kind === 'upgrade' ? `Paket ${p.plan ? PLANS[p.plan].name : ''}` : `Isi ulang ${p.credits} kredit`}
            </span>
            <span className="font-medium tabular-nums">{formatRupiah(p.price)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanDialog({ buyer, onOpenChange }: { buyer: AdminUser | null; onOpenChange: (open: boolean) => void }) {
  const setPlan = useSetBuyerPlan();
  const [plan, setPlanValue] = useState<Plan>('premium');
  const [price, setPrice] = useState('');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const ids = { price: useId(), date: useId(), notes: useId() };

  useEffect(() => {
    if (!buyer) return;
    const next = PLAN_KEYS.find((p) => planRank(p) > planRank(buyer.plan)) ?? 'basic';
    setPlanValue(next);
    setPrice(formatThousands(String(upgradePrice(buyer.plan, next))));
    setPaidAt(todayISO());
    setNotes('');
  }, [buyer]);

  const choose = (p: Plan) => {
    setPlanValue(p);
    if (buyer) setPrice(formatThousands(String(upgradePrice(buyer.plan, p))));
  };

  const save = () => {
    if (!buyer) return;
    setPlan.mutate(
      { id: buyer.id, input: { plan, price: toNumber(price), paidAt, notes } },
      {
        onSuccess: (u) => {
          toast.success(`${u.name} sekarang paket ${PLANS[u.plan].name}`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const upgrade = buyer ? planRank(plan) > planRank(buyer.plan) : false;
  const grant = buyer && upgrade ? Math.max(0, PLANS[plan].credits - PLANS[buyer.plan].credits) : 0;

  return (
    <Dialog open={buyer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="size-5 text-primary" aria-hidden />
            Ubah paket
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            {buyer?.name} · sekarang {buyer && <PlanBadge plan={buyer.plan} />}
          </DialogDescription>
        </DialogHeader>
        {buyer && (
          <div className="flex flex-col gap-4">
            <PlanPicker value={plan} onChange={choose} current={buyer.plan} />
            {grant > 0 && <p className="text-xs text-muted-foreground">Upgrade ini menambah {grant} kredit AI.</p>}
            {!upgrade && (
              <p className="text-xs text-muted-foreground">Turun paket: fitur di atas paket baru terkunci; sisa kredit tetap tersimpan.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.price}>Dibayar (Rp)</Label>
                <Input id={ids.price} inputMode="numeric" value={price} onChange={(e) => setPrice(formatThousands(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.date}>Tanggal bayar</Label>
                <Input id={ids.date} type="date" max={todayISO()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.notes}>Catatan</Label>
              <Input id={ids.notes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. Transfer BCA" />
            </div>
            <PurchaseHistory buyerId={buyer.id} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button loading={setPlan.isPending} onClick={save}>
            Simpan paket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreditsDialog({ buyer, onOpenChange }: { buyer: AdminUser | null; onOpenChange: (open: boolean) => void }) {
  const addCredits = useAddBuyerCredits();
  const [credits, setCredits] = useState('');
  const [price, setPrice] = useState('');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const ids = { credits: useId(), price: useId(), date: useId(), notes: useId() };

  useEffect(() => {
    if (!buyer) return;
    const pack = TOPUPS[TOPUPS.length - 1];
    setCredits(String(pack.credits));
    setPrice(formatThousands(String(pack.price)));
    setPaidAt(todayISO());
    setNotes('');
  }, [buyer]);

  const amount = Number(credits) || 0;
  const save = () => {
    if (!buyer) return;
    addCredits.mutate(
      { id: buyer.id, input: { credits: amount, price: amount > 0 ? toNumber(price) : 0, paidAt, notes } },
      {
        onSuccess: (u) => {
          toast.success(`Saldo kredit ${u.name}: ${u.aiCredits}`);
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
            <Coins className="size-5 text-primary" aria-hidden />
            Kredit AI
          </DialogTitle>
          <DialogDescription>
            {buyer?.name} · saldo {buyer?.aiCredits ?? 0} kredit · terpakai bulan ini {buyer?.aiCreditsUsedThisMonth ?? 0}
          </DialogDescription>
        </DialogHeader>
        {buyer && (
          <div className="flex flex-col gap-4">
            {buyer.plan !== 'premium' && (
              <Alert variant="warning">
                <TriangleAlert aria-hidden />
                Pembeli ini belum Premium, jadi kredit belum bisa dipakai. Ubah paket ke Premium terlebih dahulu.
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {TOPUPS.map((t) => (
                <Button
                  key={t.credits}
                  type="button"
                  size="sm"
                  variant={amount === t.credits ? 'default' : 'outline'}
                  onClick={() => {
                    setCredits(String(t.credits));
                    setPrice(formatThousands(String(t.price)));
                  }}
                >
                  {t.credits} kredit · {formatRupiah(t.price)}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.credits}>Jumlah kredit</Label>
                <Input id={ids.credits} type="number" min={-1000} max={1000} value={credits} onChange={(e) => setCredits(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Negatif = koreksi (tanpa pembayaran)</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.price}>Dibayar (Rp)</Label>
                <Input
                  id={ids.price}
                  inputMode="numeric"
                  disabled={amount <= 0}
                  value={amount > 0 ? price : '0'}
                  onChange={(e) => setPrice(formatThousands(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.date}>Tanggal bayar</Label>
                <Input id={ids.date} type="date" max={todayISO()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.notes}>Catatan</Label>
                <Input id={ids.notes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. Bonus / Transfer" />
              </div>
            </div>
            <PurchaseHistory buyerId={buyer.id} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button loading={addCredits.isPending} disabled={amount === 0} onClick={save}>
            {amount < 0 ? 'Kurangi kredit' : 'Tambah kredit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}