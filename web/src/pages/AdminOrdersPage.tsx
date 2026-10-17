import { PAYMENT_STATUS_LABELS, PAYMENT_STATUSES, paymentItemName, PLANS, type PaymentOrderItem, type PaymentStatus } from '@wt/shared';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CreditCard, Receipt } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, Pagination, SearchInput, StatCard } from '@/components/common';
import { PAYMENT_STATUS_STYLE } from '@/components/PaymentHistoryCard';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { usePaymentConfig } from '@/lib/payments';
import { cn } from '@/lib/utils';

const ALL = 'all';
const LIMIT = 20;
const KIND_LABEL = { new_account: 'Akun baru', upgrade: 'Upgrade', topup: 'Isi ulang' } as const;

/** Admin: pesanan pembayaran otomatis (Midtrans). Akun & upgrade dibuat otomatis setelah lunas. */
export function AdminOrdersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PaymentStatus | undefined>();
  const [page, setPage] = useState(1);
  const config = usePaymentConfig();
  const { data, isPending, isError } = useQuery({
    queryKey: ['admin', 'payments', { q, status, page }],
    queryFn: async () => {
      const res = await api<PaymentOrderItem[]>('/admin/payments', { query: { q: q || undefined, status, page, limit: LIMIT } });
      return res as unknown as { data: PaymentOrderItem[]; meta: { total: number; paidCount: number; paidAmount: number } };
    },
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      {config.data && !config.data.enabled && (
        <Alert variant="info">
          Pembayaran otomatis belum aktif. Isi MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di api/.env lalu restart API. Selama belum
          aktif, tombol beli di landing tetap mengarah ke WhatsApp.
        </Alert>
      )}
      {config.data?.fake && <Alert variant="warning">Mode simulasi pembayaran aktif (PAYMENT_FAKE=1). Jangan dipakai di production.</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Pesanan lunas" value={data?.meta.paidCount ?? '-'} icon={Receipt} />
        <StatCard label="Total dibayar otomatis" value={data ? formatRupiah(data.meta.paidAmount) : '-'} icon={CreditCard} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row" role="search">
        <div className="sm:max-w-xs sm:flex-1">
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
            placeholder="Cari nomor pesanan, nama, email"
            label="Cari pesanan"
          />
        </div>
        <Select
          value={status ?? ALL}
          onValueChange={(v) => {
            setStatus(v === ALL ? undefined : (v as PaymentStatus));
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter status pesanan" className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua status</SelectItem>
            {PAYMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PAYMENT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && <Alert variant="destructive">Gagal memuat pesanan.</Alert>}
      <Card className="overflow-hidden">
        {isPending ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <EmptyState icon={Receipt} title="Belum ada pesanan" description="Pesanan dari tombol beli dan upgrade di aplikasi akan muncul di sini." />
        ) : (
          <ul className="divide-y" aria-label="Daftar pesanan">
            {data.data.map((o) => (
              <li key={o.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.buyerName} <span className="font-normal text-muted-foreground">· {o.buyerEmail}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{o.orderId}</span> · {KIND_LABEL[o.kind]}: {paymentItemName(o, (p) => PLANS[p].name)}
                    {o.buyerWhatsapp ? ` · WA ${o.buyerWhatsapp}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:text-right">
                  <span className="text-xs text-muted-foreground">{formatDateTime(o.paidAt ?? o.createdAt)}</span>
                  <span className="font-semibold tabular-nums">{formatRupiah(o.amount)}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', PAYMENT_STATUS_STYLE[o.status])}>
                    {PAYMENT_STATUS_LABELS[o.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data && <Pagination page={page} limit={LIMIT} total={data.meta.total} onPageChange={setPage} />}
    </div>
  );
}
