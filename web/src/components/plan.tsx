import {
  FEATURE_LABELS,
  hasFeature,
  PLANS,
  PREMIUM_CREDITS,
  requiredPlan,
  upgradePrice,
  type Feature,
  TOPUPS,
  type Plan,
} from '@wt/shared';
import { Check, Coins, CreditCard, Lock, MessageCircle, Sparkles } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openPayment, useMeCheckout, usePaymentConfig } from '@/lib/payments';
import { topupMessage, upgradeMessage, whatsappLink } from '@/lib/config';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

/** Paket & hak akses pengguna yang sedang login (admin selalu penuh). */
export function usePlan() {
  const { state } = useAuth();
  const user = state.user;
  const plan: Plan = user?.plan ?? 'basic';
  const role = user?.role ?? 'user';
  return {
    user,
    plan,
    isAdmin: role === 'admin',
    has: (feature: Feature) => hasFeature(plan, role, feature),
  };
}

const BADGE: Record<Plan, string> = {
  basic: 'bg-muted text-muted-foreground',
  standard: 'bg-accent text-accent-foreground',
  premium: 'bg-[#0f172a] text-white',
};

export function PlanBadge({ plan, className }: { plan: Plan; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4',
        BADGE[plan],
        className,
      )}
    >
      {plan === 'premium' && <Sparkles className="size-3" aria-hidden />}
      {PLANS[plan].name}
    </span>
  );
}

/** Daftar isi paket (dipakai kartu upgrade & landing). */
export function planHighlights(plan: Plan): string[] {
  const base = ['Dashboard & statistik', 'Catat lamaran tanpa batas', 'Board Kanban, filter & aksi massal', 'Impor & ekspor Excel/CSV', 'Aplikasi di HP'];
  if (plan === 'basic') return base;
  const standard = [
    'Semua fitur Basic',
    'Kalender & tugas',
    'Insight + kartu progres',
    'CV Saya: simpan hingga 5 CV, pilih per lamaran',
    'Pengingat harian lewat email & notifikasi HP',
    'Simpan loker dari menu Bagikan di HP',
    'Chrome Extension (LinkedIn, Jobstreet, Glints, Dealls, dll.)',
  ];
  if (plan === 'standard') return standard;
  return [
    'Semua fitur Standar',
    'AI isi otomatis dari poster & teks loker',
    'AI cover letter, persiapan interview, Cek CV',
    'AI isi Profil Karier dari CV',
    `${PREMIUM_CREDITS} kredit AI (tidak hangus)`,
  ];
}

export function UpgradeContent({ feature, compact }: { feature: Feature; compact?: boolean }) {
  const { plan, user } = usePlan();
  const target = requiredPlan(feature);
  const price = upgradePrice(plan, target);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Paket Anda:</span>
        <PlanBadge plan={plan} />
        <span className="text-sm text-muted-foreground">→</span>
        <PlanBadge plan={target} />
      </div>
      <ul className={cn('grid gap-2 text-sm', !compact && 'sm:grid-cols-2')}>
        {planHighlights(target).map((h) => (
          <li key={h} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {h}
          </li>
        ))}
      </ul>
      <div className="rounded-xl bg-muted p-3 text-sm">
        Upgrade cukup bayar selisih: <strong className="text-foreground">{formatRupiah(price)}</strong>
        <span className="text-muted-foreground"> · sekali bayar, berlaku seumur hidup</span>
      </div>
      {user?.isDemo ? (
        <p className="text-sm text-muted-foreground">Akun demo sudah membuka semua fitur.</p>
      ) : (
        <UpgradeActions from={plan} to={target} email={user?.email} price={price} />
      )}
    </div>
  );
}

/** Bayar upgrade langsung (Midtrans) bila aktif; WhatsApp tetap tersedia sebagai bantuan. */
function UpgradeActions({ from, to, email, price }: { from: Plan; to: Plan; email?: string; price: number }) {
  const payments = usePaymentConfig();
  const checkout = useMeCheckout();
  const navigate = useNavigate();
  const wa = whatsappLink(upgradeMessage(from, to, email));
  if (!payments.data?.enabled) {
    return (
      <Button asChild>
        <a href={wa} target="_blank" rel="noopener noreferrer">
          <MessageCircle />
          Upgrade ke {PLANS[to].name} via WhatsApp
        </a>
      </Button>
    );
  }
  const pay = () =>
    checkout.mutate(
      { kind: 'upgrade', plan: to },
      {
        onSuccess: (session) => void openPayment(payments.data!, session, navigate),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Pembayaran belum bisa diproses'),
      },
    );
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={pay} loading={checkout.isPending}>
        {!checkout.isPending && <CreditCard />}
        Upgrade ke {PLANS[to].name}, bayar {formatRupiah(price)}
      </Button>
      <a href={wa} target="_blank" rel="noopener noreferrer" className="text-center text-xs font-medium text-muted-foreground hover:text-foreground">
        Butuh bantuan? Hubungi admin via WhatsApp
      </a>
    </div>
  );
}

/** Pilih paket isi ulang kredit lalu bayar (Midtrans). */
export function TopupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const payments = usePaymentConfig();
  const checkout = useMeCheckout();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<number | null>(null);
  const pay = (credits: number) => {
    setPicked(credits);
    checkout.mutate(
      { kind: 'topup', credits },
      {
        onSuccess: (session) => {
          onOpenChange(false);
          void openPayment(payments.data!, session, navigate);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Pembayaran belum bisa diproses'),
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="size-4 text-primary" aria-hidden />
            Isi ulang kredit AI
          </DialogTitle>
          <DialogDescription>Kredit tidak hangus dan langsung masuk setelah pembayaran diterima.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {TOPUPS.map((t) => (
            <li key={t.credits}>
              <Button
                variant="outline"
                className="h-auto w-full justify-between py-3"
                onClick={() => pay(t.credits)}
                loading={checkout.isPending && picked === t.credits}
                disabled={checkout.isPending}
              >
                <span className="font-semibold">{t.credits} kredit</span>
                <span className="tabular-nums">{formatRupiah(t.price)}</span>
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function UpgradeDialog({
  feature,
  open,
  onOpenChange,
}: {
  feature: Feature | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!feature) return null;
  const target = requiredPlan(feature);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" aria-hidden />
            {FEATURE_LABELS[feature]} ada di paket {PLANS[target].name}
          </DialogTitle>
          <DialogDescription>{PLANS[target].tagline}.</DialogDescription>
        </DialogHeader>
        <UpgradeContent feature={feature} compact />
      </DialogContent>
    </Dialog>
  );
}

/** `[dialog, prompt]`: panggil `prompt('attachments')` untuk menampilkan ajakan upgrade. */
export function useUpgradePrompt() {
  const [feature, setFeature] = useState<Feature | null>(null);
  const prompt = useCallback((f: Feature) => setFeature(f), []);
  const dialog = <UpgradeDialog feature={feature} open={feature !== null} onOpenChange={(o) => !o && setFeature(null)} />;
  return [dialog, prompt] as const;
}

/** Halaman yang tidak termasuk paket: tampilkan ajakan upgrade (bukan redirect). */
export function RequireFeature({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { has } = usePlan();
  if (has(feature)) return children;
  const target = requiredPlan(feature);
  return (
    <Card className="mx-auto mt-2 flex max-w-2xl flex-col gap-5 p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary">
          <Lock className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            {FEATURE_LABELS[feature]} tersedia di paket {PLANS[target].name}
          </h2>
          <p className="text-sm text-muted-foreground">{PLANS[target].tagline}.</p>
        </div>
      </div>
      <UpgradeContent feature={feature} />
    </Card>
  );
}

/** Saldo kredit AI + biaya aksi; tombol isi ulang saat kurang. */
export function CreditInfo({ balance, cost, unlimited, className }: { balance: number; cost?: number; unlimited?: boolean; className?: string }) {
  const { user } = usePlan();
  const short = !unlimited && cost != null && balance < cost;
  const payments = usePaymentConfig();
  const [topup, setTopup] = useState(false);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold',
          short ? 'bg-[#fde4e4] text-[#a32020]' : 'bg-accent text-accent-foreground',
        )}
      >
        <Coins className="size-3.5" aria-hidden />
        {unlimited ? 'Kredit tanpa batas (admin)' : `Sisa ${balance} kredit`}
        {cost != null && !unlimited && <span className="font-normal opacity-80">· aksi ini {cost} kredit</span>}
      </span>
      {short && !user?.isDemo && payments.data?.enabled && user?.role === 'user' && (
        <>
          <button type="button" onClick={() => setTopup(true)} className="font-semibold text-primary hover:underline">
            Isi ulang kredit
          </button>
          <TopupDialog open={topup} onOpenChange={setTopup} />
        </>
      )}
      {short && !user?.isDemo && !payments.data?.enabled && (
        <a
          href={whatsappLink(topupMessage(user?.email))}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary hover:underline"
        >
          Isi ulang kredit via WhatsApp
        </a>
      )}
    </div>
  );
}
