import { PAYMENT_STATUS_LABELS, paymentItemName, PLANS, type PaymentStatus } from '@wt/shared';
import { Coins, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { useMyPayments, usePaymentConfig } from '@/lib/payments';
import { cn } from '@/lib/utils';
import { TopupDialog, usePlan } from './plan';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-amber-50 text-amber-900',
  paid: 'bg-[#e7f7ef] text-[#147a52]',
  expired: 'bg-muted text-muted-foreground',
  failed: 'bg-[#fde4e4] text-[#a32020]',
};

/** Riwayat pembayaran otomatis milik pengguna (upgrade & isi ulang kredit) di halaman Pengaturan. */
export function PaymentHistoryCard() {
  const config = usePaymentConfig();
  const { user, has } = usePlan();
  const enabled = !!config.data?.enabled && user?.role === 'user' && !user.isDemo;
  const payments = useMyPayments();
  const [topup, setTopup] = useState(false);
  if (!enabled && !payments.data?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="size-5 text-primary" aria-hidden />
          Pembayaran
        </CardTitle>
        <CardDescription>Riwayat pembelian, upgrade, dan isi ulang kredit. Bukti pembayaran juga dikirim ke email Anda.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {enabled && has('ai') && (
          <>
            <Button variant="outline" className="self-start" onClick={() => setTopup(true)}>
              <Coins />
              Isi ulang kredit AI
            </Button>
            <TopupDialog open={topup} onOpenChange={setTopup} />
          </>
        )}
        {payments.data?.length ? (
          <ul className="divide-y rounded-xl border" aria-label="Riwayat pembayaran">
            {payments.data.map((o) => (
              <li key={o.id}>
                <Link to={`/pembayaran/${o.orderId}`} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{paymentItemName(o, (p) => PLANS[p].name)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{formatRupiah(o.amount)}</span>
                    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', PAYMENT_STATUS_STYLE[o.status])}>
                      {PAYMENT_STATUS_LABELS[o.status]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada pembayaran dari aplikasi.</p>
        )}
      </CardContent>
    </Card>
  );
}
