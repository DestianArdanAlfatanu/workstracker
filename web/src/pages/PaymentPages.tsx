import { zodResolver } from '@hookform/resolvers/zod';
import {
  checkoutSchema,
  PAYMENT_STATUS_LABELS,
  paymentItemName,
  PLAN_KEYS,
  PLANS,
  planRank,
  type CheckoutInput,
  type Plan,
  type User,
} from '@wt/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCircle2, Clock, CreditCard, Loader2, MailCheck, MessageCircle, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/components/application-ui';
import { Logo } from '@/components/brand';
import { planHighlights } from '@/components/plan';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buyPlanMessage, whatsappLink } from '@/lib/config';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { openPayment, simulatePayment, useCheckout, useMeCheckout, usePaymentConfig, usePaymentStatus } from '@/lib/payments';
import { cn } from '@/lib/utils';

const planName = (p: Plan) => PLANS[p].name;

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link to="/" aria-label="WorksTracker, ke beranda">
          <Logo className="h-8" />
        </Link>
        <Link to="/#harga" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Lihat paket
        </Link>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16">{children}</main>
    </div>
  );
}

/** Beli akses dari landing: isi data, bayar lewat Midtrans, akun dibuat otomatis setelah lunas. */
export function CheckoutPage() {
  const { plan: raw } = useParams();
  const plan = (PLAN_KEYS as readonly string[]).includes(raw ?? '') ? (raw as Plan) : null;
  const config = usePaymentConfig();
  const { state } = useAuth();
  const navigate = useNavigate();
  const checkout = useCheckout();
  const meCheckout = useMeCheckout();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({ resolver: zodResolver(checkoutSchema), defaultValues: { plan: plan ?? 'standard', name: '', email: '', whatsapp: '' } });

  if (!plan) return <Navigate to="/#harga" replace />;
  const info = PLANS[plan];
  const user = state.status === 'authenticated' ? state.user : null;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const session = await checkout.mutateAsync({ ...values, plan });
      await openPayment(config.data!, session, navigate);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [k, v] of Object.entries(e.fields)) setFieldError(k as keyof CheckoutInput, { message: v });
      }
      setError(errorMessage(e));
    }
  });

  const upgradeInstead = async () => {
    try {
      const session = await meCheckout.mutateAsync({ kind: 'upgrade', plan });
      await openPayment(config.data!, session, navigate);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <PublicLayout>
      <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h1 className="text-xl font-bold">Beli WorksTracker paket {info.name}</h1>
            <p className="text-sm text-muted-foreground">Sekali bayar, berlaku seumur hidup. Akun aktif otomatis setelah pembayaran lunas.</p>
          </div>

          {config.isPending ? (
            <div className="flex justify-center py-8" role="status">
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : !config.data?.enabled ? (
            <div className="flex flex-col gap-3">
              <Alert variant="info">Pembelian saat ini dilayani lewat WhatsApp admin.</Alert>
              <Button asChild>
                <a href={whatsappLink(buyPlanMessage(plan))} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  Beli paket {info.name} via WhatsApp
                </a>
              </Button>
            </div>
          ) : user ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Anda masuk sebagai <strong>{user.email}</strong> (paket {planName(user.plan)}).
              </p>
              {user.role === 'user' && !user.isDemo && planRank(plan) > planRank(user.plan) ? (
                <Button onClick={() => void upgradeInstead()} loading={meCheckout.isPending}>
                  {!meCheckout.isPending && <CreditCard />}
                  Upgrade ke {info.name}, bayar selisih
                </Button>
              ) : (
                <p className="text-muted-foreground">Akun ini sudah memakai paket {planName(user.plan)} atau lebih tinggi.</p>
              )}
              <Button variant="outline" asChild>
                <Link to="/">Kembali ke aplikasi</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              {error && <Alert variant="destructive">{error}</Alert>}
              <Field id="buy-name" label="Nama lengkap" error={errors.name?.message}>
                <Input id="buy-name" autoComplete="name" {...register('name')} aria-invalid={!!errors.name} />
              </Field>
              <Field id="buy-email" label="Email" hint="Untuk login dan menerima bukti pembayaran." error={errors.email?.message}>
                <Input id="buy-email" type="email" autoComplete="email" inputMode="email" {...register('email')} aria-invalid={!!errors.email} />
              </Field>
              <Field id="buy-wa" label="No. WhatsApp (opsional)" hint="Agar admin bisa membantu bila ada kendala." error={errors.whatsapp?.message}>
                <Input id="buy-wa" type="tel" inputMode="tel" autoComplete="tel" placeholder="0812xxxxxxx" {...register('whatsapp')} aria-invalid={!!errors.whatsapp} />
              </Field>
              <Button type="submit" size="lg" loading={isSubmitting}>
                {!isSubmitting && <CreditCard />}
                {isSubmitting ? 'Menyiapkan pembayaran…' : `Bayar ${formatRupiah(info.price)}`}
              </Button>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Pembayaran diproses Midtrans: QRIS, transfer bank (virtual account), GoPay, ShopeePay, dan lainnya. Setelah lunas,
                link untuk membuat password dikirim ke email Anda.
              </p>
              <p className="text-xs text-muted-foreground">
                Sudah punya akun?{' '}
                <Link to="/login" state={{ from: `/beli/${plan}` }} className="font-medium text-primary hover:underline">
                  Masuk untuk upgrade
                </Link>
                {' · '}
                <a href={whatsappLink(buyPlanMessage(plan))} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  Butuh bantuan?
                </a>
              </p>
            </form>
          )}
        </Card>

        <Card className="flex h-fit flex-col gap-3 p-5">
          <p className="text-sm font-semibold">Paket {info.name}</p>
          <p className="text-2xl font-extrabold tabular-nums">{formatRupiah(info.price)}</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {planHighlights(plan).map((h) => (
              <li key={h} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {h}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            {PLAN_KEYS.filter((p) => p !== plan).map((p) => (
              <Link key={p} to={`/beli/${p}`} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-accent">
                {planName(p)} {formatRupiah(PLANS[p].price)}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Halaman status pesanan (tujuan setelah popup Midtrans ditutup). Memantau sampai lunas. */
export function PaymentStatusPage() {
  const { orderId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const config = usePaymentConfig();
  const status = usePaymentStatus(orderId, true);
  const { state, setUser } = useAuth();
  const qc = useQueryClient();
  const [simulating, setSimulating] = useState(false);
  const order = status.data;

  // Upgrade/isi ulang lunas → segarkan paket & saldo di aplikasi.
  const refreshed = useRef(false);
  useEffect(() => {
    if (order?.status !== 'paid' || order.kind === 'new_account' || state.status !== 'authenticated' || refreshed.current) return;
    refreshed.current = true;
    void api<User>('/me').then((r) => setUser(r.data), () => undefined);
    void qc.invalidateQueries({ queryKey: ['ai'] });
    void qc.invalidateQueries({ queryKey: ['payments', 'mine'] });
  }, [order?.status, order?.kind, state.status, setUser, qc]);

  const simulate = async () => {
    setSimulating(true);
    try {
      await simulatePayment(orderId);
      await status.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSimulating(false);
    }
  };

  if (status.isError) {
    return (
      <PublicLayout>
        <Alert variant="destructive">Pesanan tidak ditemukan. Periksa link dari email atau hubungi admin.</Alert>
      </PublicLayout>
    );
  }
  if (!order) {
    return (
      <PublicLayout>
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </PublicLayout>
    );
  }

  const item = paymentItemName(order, planName);
  const Icon = order.status === 'paid' ? CheckCircle2 : order.status === 'pending' ? Clock : order.status === 'expired' ? TriangleAlert : XCircle;
  const inApp = order.kind !== 'new_account';

  return (
    <PublicLayout>
      <Card className="flex flex-col gap-4 p-5 sm:p-6" aria-live="polite">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-full',
              order.status === 'paid' ? 'bg-[#e7f7ef] text-[#147a52]' : order.status === 'pending' ? 'bg-accent text-primary' : 'bg-[#fde4e4] text-[#a32020]',
            )}
          >
            <Icon className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold">
              {order.status === 'paid' ? 'Pembayaran berhasil' : PAYMENT_STATUS_LABELS[order.status]}
            </h1>
            <p className="text-sm text-muted-foreground">{item}</p>
          </div>
        </div>

        {order.status === 'paid' && !inApp && (
          <Alert variant="info">
            <MailCheck aria-hidden />
            <span>
              Akun Anda sudah aktif. Kami mengirim link untuk membuat password ke <strong>{order.email}</strong>. Cek juga folder
              Spam atau Promosi bila belum terlihat.
            </span>
          </Alert>
        )}
        {order.status === 'paid' && inApp && (
          <Alert variant="info">
            <CheckCircle2 aria-hidden />
            {order.kind === 'topup' ? `${order.credits} kredit AI sudah masuk ke akun Anda.` : `Paket ${planName(order.plan!)} sudah aktif di akun Anda.`}
          </Alert>
        )}
        {order.status === 'pending' && (
          <p className="text-sm text-muted-foreground">
            Selesaikan pembayaran sebelum {formatDateTime(order.expiresAt)}. Halaman ini diperbarui otomatis setelah pembayaran
            diterima.
          </p>
        )}
        {(order.status === 'expired' || order.status === 'failed') && (
          <p className="text-sm text-muted-foreground">Pesanan ini tidak dibayar atau dibatalkan. Anda bisa membuat pesanan baru.</p>
        )}

        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-muted p-3 text-sm">
          <dt className="text-muted-foreground">Nomor pesanan</dt>
          <dd className="break-all font-mono text-xs leading-5">{order.orderId}</dd>
          <dt className="text-muted-foreground">Jumlah</dt>
          <dd className="font-semibold tabular-nums">{formatRupiah(order.amount)}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{order.email}</dd>
          {order.paymentType && (
            <>
              <dt className="text-muted-foreground">Metode</dt>
              <dd className="capitalize">{order.paymentType.replace(/_/g, ' ')}</dd>
            </>
          )}
          {order.paidAt && (
            <>
              <dt className="text-muted-foreground">Dibayar</dt>
              <dd>{formatDateTime(order.paidAt)}</dd>
            </>
          )}
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row">
          {order.status === 'pending' && config.data?.fake && params.get('simulasi') && (
            <Button onClick={() => void simulate()} loading={simulating}>
              Bayar (simulasi)
            </Button>
          )}
          {order.status === 'pending' && order.token && config.data && !config.data.fake && (
            <Button onClick={() => void openPayment(config.data!, { orderId: order.orderId, token: order.token!, redirectUrl: order.redirectUrl! }, navigate)}>
              <CreditCard />
              Lanjutkan pembayaran
            </Button>
          )}
          {order.status === 'paid' && !inApp && (
            <Button asChild>
              <Link to="/login">Ke halaman masuk</Link>
            </Button>
          )}
          {inApp && (
            <Button asChild variant={order.status === 'paid' ? 'default' : 'outline'}>
              <Link to="/">Kembali ke WorksTracker</Link>
            </Button>
          )}
          {(order.status === 'expired' || order.status === 'failed') && !inApp && order.plan && (
            <Button asChild>
              <Link to={`/beli/${order.plan}`}>Buat pesanan baru</Link>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Ada kendala?{' '}
          <a href={whatsappLink(`Halo admin, saya butuh bantuan pembayaran WorksTracker. Nomor pesanan: ${order.orderId}`)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            Hubungi admin via WhatsApp
          </a>{' '}
          dengan menyebutkan nomor pesanan.
        </p>
      </Card>
    </PublicLayout>
  );
}
