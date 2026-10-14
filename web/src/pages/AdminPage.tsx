import { PAGE_SIZE, type AdminCredentials, type AdminOverview, type AdminUser } from '@wt/shared';
import {
  Ban,
  CheckCircle2,
  KeyRound,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  UsersRound,
  Wallet,
  CalendarRange,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AiSettingsDialog, BuyerFormDialog, CredentialsDialog, DeleteBuyerDialog } from '@/components/admin';
import { errorMessage } from '@/components/application-ui';
import { MonthlyBarChart, type BarSeries } from '@/components/charts';
import { ConfirmDialog, EmptyState, Pagination, SearchInput } from '@/components/common';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import {
  useAdminOverview,
  useAdminUsers,
  useDeleteBuyer,
  useResetBuyerPassword,
  useSetBuyerStatus,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

const num = new Intl.NumberFormat('id-ID');
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });

type Monthly = AdminOverview['monthly'][number];
const SALES_SERIES: BarSeries<Monthly>[] = [{ key: 'revenue', label: 'Pendapatan', color: 'var(--chart-responded)' }];

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        'flex flex-col gap-4 p-4 sm:p-5',
        highlight && 'bg-gradient-to-br from-[#5470ff] to-[#3049e6] text-white shadow-[0_12px_28px_-12px_rgba(61,90,241,0.75)]',
      )}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full',
          highlight ? 'bg-white/20' : 'border border-border bg-card',
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div>
        <p className={cn('text-sm font-medium', highlight ? 'text-white/85' : 'text-muted-foreground')}>{label}</p>
        <p className="mt-1 text-[1.6rem] font-bold leading-tight tracking-tight">{value}</p>
        {hint && <p className={cn('text-xs', highlight ? 'text-white/75' : 'text-muted-foreground')}>{hint}</p>}
      </div>
    </Card>
  );
}

function StatusPill({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {user.status === 'active' ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
          <CheckCircle2 className="size-3" aria-hidden />
          Aktif
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
          <Ban className="size-3" aria-hidden />
          Nonaktif
        </span>
      )}
      {user.mustChangePassword && user.status === 'active' && (
        <span className="text-[11px] text-muted-foreground">Belum ganti password</span>
      )}
    </div>
  );
}

function AiPill({ user }: { user: AdminUser }) {
  if (!user.aiEnabled) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-foreground">
      <Sparkles className="size-3" aria-hidden />
      {user.aiUsedThisMonth}/{user.aiMonthlyLimit}
    </span>
  );
}

function WhatsappLink({ number }: { number: string | null | undefined }) {
  if (!number) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 tabular-nums text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircle className="size-3.5" aria-hidden />+{number}
    </a>
  );
}

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('status') || undefined) as 'active' | 'suspended' | undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const overview = useAdminOverview();
  const users = useAdminUsers({ q: q || undefined, status, page, limit: PAGE_SIZE });

  const [form, setForm] = useState<{ open: boolean; buyer: AdminUser | null }>({ open: false, buyer: null });
  const [creds, setCreds] = useState<{ data: AdminCredentials; isReset: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'reset' | 'suspend'; buyer: AdminUser } | null>(null);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [aiFor, setAiFor] = useState<AdminUser | null>(null);

  const resetMutation = useResetBuyerPassword();
  const statusMutation = useSetBuyerStatus();
  const deleteMutation = useDeleteBuyer();

  const update = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: key !== 'page' },
    );

  const runConfirm = () => {
    if (!confirm) return;
    const { type, buyer } = confirm;
    setConfirm(null);
    if (type === 'reset') {
      resetMutation.mutate(buyer.id, {
        onSuccess: (data) => setCreds({ data, isReset: true }),
        onError: (e) => toast.error(errorMessage(e)),
      });
    } else {
      statusMutation.mutate(
        { id: buyer.id, action: 'suspend' },
        {
          onSuccess: () => toast.success(`Akun ${buyer.name} dinonaktifkan`),
          onError: (e) => toast.error(errorMessage(e)),
        },
      );
    }
  };

  const activate = (buyer: AdminUser) =>
    statusMutation.mutate(
      { id: buyer.id, action: 'activate' },
      {
        onSuccess: () => toast.success(`Akun ${buyer.name} diaktifkan kembali`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const remove = (buyer: AdminUser) => {
    setToDelete(null);
    deleteMutation.mutate(buyer.id, {
      onSuccess: () => toast.success(`Akun ${buyer.name} dihapus permanen`),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const actions = (u: AdminUser) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal />
          <span className="sr-only">Aksi untuk {u.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl">
        <DropdownMenuItem onSelect={() => setForm({ open: true, buyer: u })}>
          <Pencil />
          Edit data
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setAiFor(u)}>
          <Sparkles />
          Atur add-on AI
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setConfirm({ type: 'reset', buyer: u })}>
          <KeyRound />
          Reset password
        </DropdownMenuItem>
        {u.status === 'active' ? (
          <DropdownMenuItem onSelect={() => setConfirm({ type: 'suspend', buyer: u })}>
            <Ban />
            Nonaktifkan
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => activate(u)}>
            <UserCheck />
            Aktifkan kembali
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setToDelete(u)}>
          <Trash2 />
          Hapus permanen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const o = overview.data;
  const items = users.data?.data ?? [];
  const total = users.data?.meta?.total ?? 0;
  const hasFilter = !!(q || status);

  return (
    <div className="flex flex-col gap-4">
      {overview.isError && <Alert variant="destructive">Gagal memuat ringkasan penjualan.</Alert>}

      <div className="grid gap-4 xl:grid-cols-12">
        <section aria-label="Ringkasan penjualan" className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:col-span-5">
          {o ? (
            <>
              <StatTile
                label="Total pembeli"
                value={num.format(o.totalBuyers)}
                hint={`${num.format(o.salesThisMonth)} baru · ${num.format(o.demosThisMonth)} demo dibuka bulan ini`}
                icon={UsersRound}
                highlight
              />
              <StatTile
                label="Akun aktif"
                value={num.format(o.active)}
                hint={`${num.format(o.suspended)} nonaktif`}
                icon={UserCheck}
              />
              <StatTile label="Pendapatan total" value={formatRupiah(o.revenueTotal)} icon={Wallet} />
              <StatTile
                label="Pendapatan bulan ini"
                value={formatRupiah(o.revenueThisMonth)}
                hint={`Biaya AI: $${o.aiCostThisMonthUsd.toFixed(2)} (${num.format(o.aiGenerationsThisMonth)} generate)`}
                icon={CalendarRange}
              />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl bg-card" />)
          )}
        </section>

        <Card className="flex flex-col gap-4 p-5 xl:col-span-7">
          <div>
            <h2 className="text-base font-bold tracking-tight">Penjualan per Bulan</h2>
            <p className="text-xs text-muted-foreground">Pendapatan dari akses seumur hidup, 12 bulan terakhir</p>
          </div>
          {o ? (
            <MonthlyBarChart
              data={o.monthly}
              series={SALES_SERIES}
              caption="Pendapatan per bulan"
              formatValue={formatRupiah}
              formatAxis={(v) => compact.format(v)}
              tooltipExtra={(d) => <p className="mt-0.5 text-white/70">{num.format(d.sales)} pembeli baru</p>}
            />
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold tracking-tight">Daftar Pembeli</h2>
            <p className="text-xs text-muted-foreground">
              {users.data ? `${num.format(total)} pembeli${hasFilter ? ' sesuai filter' : ''}` : 'Memuat…'}
            </p>
          </div>
          <Button onClick={() => setForm({ open: true, buyer: null })}>
            <Plus />
            Tambah pembeli
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row" role="search">
          <div className="sm:max-w-sm sm:flex-1">
            <SearchInput
              value={q}
              onChange={(v) => update('q', v.trim() || null)}
              placeholder="Cari nama, email, atau WhatsApp"
              label="Cari pembeli"
            />
          </div>
          <Select value={status ?? 'all'} onValueChange={(v) => update('status', v === 'all' ? null : v)}>
            <SelectTrigger aria-label="Filter status akun" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectSeparator />
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="suspended">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
          {hasFilter && (
            <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
              <X />
              Reset filter
            </Button>
          )}
        </div>

        {users.isError && <Alert variant="destructive">Gagal memuat daftar pembeli.</Alert>}

        {users.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={hasFilter ? 'Tidak ada pembeli yang cocok' : 'Belum ada pembeli'}
            description={
              hasFilter ? 'Coba ubah kata kunci atau filter.' : 'Tambahkan pembeli pertama setelah pembayaran diterima.'
            }
          />
        ) : (
          <div className={cn(users.isPlaceholderData && 'opacity-60')}>
            {/* Tabel desktop */}
            <div className="-mx-4 hidden overflow-x-auto sm:-mx-5 md:block">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Pembeli</th>
                    <th scope="col" className="px-4 py-3 font-medium">WhatsApp</th>
                    <th scope="col" className="px-4 py-3 font-medium">Tgl beli</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Harga</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Login terakhir</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Lamaran</th>
                    <th scope="col" className="px-4 py-3 font-medium">AI</th>
                    <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/40">
                      <td className="max-w-[16rem] px-5 py-3">
                        <span className="block truncate font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                        {u.license?.notes && (
                          <span className="block truncate text-xs text-muted-foreground/80" title={u.license.notes}>
                            {u.license.notes}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <WhatsappLink number={u.license?.whatsapp} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(u.license?.purchasedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatRupiah(u.license?.price)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill user={u} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Belum pernah'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{num.format(u.applicationCount)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <AiPill user={u} />
                      </td>
                      <td className="px-2 py-3">{actions(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kartu mobile */}
            <ul className="-mx-4 divide-y border-y md:hidden">
              {items.map((u) => (
                <li key={u.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {actions(u)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <StatusPill user={u} />
                    <AiPill user={u} />
                    <WhatsappLink number={u.license?.whatsapp} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Beli {formatDate(u.license?.purchasedAt)} · {formatRupiah(u.license?.price)} ·{' '}
                    {num.format(u.applicationCount)} lamaran
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={(p) => update('page', p > 1 ? String(p) : null)} />
      </Card>

      <BuyerFormDialog
        open={form.open}
        buyer={form.buyer}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        onCreated={(data) => setCreds({ data, isReset: false })}
      />
      <CredentialsDialog creds={creds?.data ?? null} isReset={creds?.isReset ?? false} onClose={() => setCreds(null)} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.type === 'reset' ? 'Reset password?' : 'Nonaktifkan akun?'}
        description={
          confirm?.type === 'reset'
            ? `Password ${confirm.buyer.name} akan diganti dengan password default baru dan semua sesinya dikeluarkan.`
            : `${confirm?.buyer.name} tidak akan bisa login sampai akunnya diaktifkan kembali. Data lamarannya tetap aman.`
        }
        confirmLabel={confirm?.type === 'reset' ? 'Reset password' : 'Nonaktifkan'}
        destructive={confirm?.type === 'suspend'}
        onConfirm={runConfirm}
      />
      <AiSettingsDialog buyer={aiFor} onOpenChange={(open) => !open && setAiFor(null)} />
      <DeleteBuyerDialog buyer={toDelete} onOpenChange={(open) => !open && setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
