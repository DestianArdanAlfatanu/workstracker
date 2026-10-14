import {
  MAX_ACTIVE_APPLICATIONS,
  PAGE_SIZE,
  SOURCE_LABELS,
  SOURCES,
  STATUS_LABELS,
  STATUSES,
  type Source,
  type Status,
} from '@wt/shared';
import {
  Columns3,
  Download,
  FileSearch,
  FileSpreadsheet,
  FileStack,
  FileText,
  Plus,
  Rows3,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ApplicationCard,
  ApplicationListSkeleton,
  ApplicationTable,
  type Selection,
} from '@/components/ApplicationList';
import { errorMessage, useApplicationUI } from '@/components/application-ui';
import { ConfirmDialog, EmptyState, Pagination, SearchInput } from '@/components/common';
import { KanbanBoard } from '@/components/KanbanBoard';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { exportApplications, useApplications, useBulkAction } from '@/lib/queries';
import { cn } from '@/lib/utils';

const ALL = 'all';
const SORT_OPTIONS = [
  { value: 'applied_at:desc', label: 'Tanggal lamar (terbaru)' },
  { value: 'applied_at:asc', label: 'Tanggal lamar (terlama)' },
  { value: 'next_action_date:asc', label: 'Tindak lanjut terdekat' },
  { value: 'created_at:desc', label: 'Baru ditambahkan' },
  { value: 'company:asc', label: 'Perusahaan (A–Z)' },
];
const DEFAULT_SORT = SORT_OPTIONS[0].value;

export function ApplicationsPage() {
  const ui = useApplicationUI();
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  const view = params.get('view') === 'board' ? 'board' : 'table';
  const q = params.get('q') ?? '';
  const status = (params.get('status') || undefined) as Status | undefined;
  const source = (params.get('source') || undefined) as Source | undefined;
  const sort = SORT_OPTIONS.some((o) => o.value === params.get('sort')) ? params.get('sort')! : DEFAULT_SORT;
  const page = Math.max(1, Number(params.get('page')) || 1);

  /** Ubah satu parameter URL; filter baru selalu kembali ke halaman 1. */
  const update = (key: string, value: string | null) => {
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
  };

  const filters = {
    q: q || undefined,
    // Di board, status menjadi kolom sehingga filter status tidak dipakai.
    status: status && view === 'table' ? [status] : undefined,
    source: source ? [source] : undefined,
    sort,
  };
  const { data, isPending, isError, isPlaceholderData } = useApplications(
    view === 'board' ? { ...filters, page: 1, limit: MAX_ACTIVE_APPLICATIONS } : { ...filters, page, limit: PAGE_SIZE },
  );

  const items = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const hasFilter = !!(q || (status && view === 'table') || source);
  const resetFilters = () => setParams(view === 'board' ? { view: 'board' } : {}, { replace: true });

  /* ---------------- Pilihan & aksi massal ---------------- */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bulk = useBulkAction();

  // Pilihan dikosongkan saat filter/halaman/tampilan berubah.
  useEffect(() => setSelected(new Set()), [q, status, source, sort, page, view]);

  const selection: Selection = {
    selected,
    toggle: (id) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setMany: (ids, checked) =>
      setSelected((s) => {
        const next = new Set(s);
        for (const id of ids) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
  };
  const selectedIds = [...selected];

  const bulkStatus = (to: Status) =>
    bulk.mutate(
      { action: 'status', ids: selectedIds, status: to },
      {
        onSuccess: ({ count }) => {
          toast.success(`${count} lamaran diubah ke ${STATUS_LABELS[to]}`);
          setSelected(new Set());
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const bulkDelete = () => {
    setConfirmDelete(false);
    const ids = selectedIds;
    bulk.mutate(
      { action: 'delete', ids },
      {
        onSuccess: ({ count }) => {
          setSelected(new Set());
          toast(`${count} lamaran dihapus`, {
            duration: 5000,
            action: {
              label: 'Undo',
              onClick: () =>
                bulk.mutate(
                  { action: 'restore', ids },
                  {
                    onSuccess: (r) => toast.success(`${r.count} lamaran dipulihkan`),
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                ),
            },
          });
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const runExport = async (format: 'csv' | 'xlsx', onlySelected = false) => {
    const t = toast.loading('Menyiapkan file…');
    try {
      await exportApplications({ ...filters, status: status ? [status] : undefined, format, ids: onlySelected ? selectedIds : undefined });
      toast.success('File berhasil diunduh', { id: t });
    } catch (e) {
      toast.error(errorMessage(e), { id: t });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-card p-1 shadow-[0_1px_3px_rgba(17,20,45,0.05)]" role="group" aria-label="Tampilan">
            {(
              [
                { key: 'table', label: 'Tabel', icon: Rows3 },
                { key: 'board', label: 'Board', icon: Columns3 },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => update('view', key === 'board' ? 'board' : null)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors',
                  view === key && 'bg-primary text-primary-foreground shadow-sm',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {data ? (
              <>
                <span className="font-semibold text-foreground">{total}</span> lamaran{hasFilter ? ' sesuai filter' : ''}
              </>
            ) : (
              'Memuat…'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download />
                Ekspor
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onSelect={() => void runExport('xlsx')}>
                <FileSpreadsheet />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void runExport('csv')}>
                <FileText />
                CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={ui.openCreate} className="max-md:hidden">
            <Plus />
            Tambah lamaran
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center" role="search">
        <div className="lg:max-w-xs lg:flex-1">
          <SearchInput
            autoFocus={!!(location.state as { focusSearch?: boolean } | null)?.focusSearch}
            value={q}
            onChange={(v) => update('q', v.trim() || null)}
            placeholder="Cari perusahaan atau posisi"
            label="Cari lamaran"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-1">
          {view === 'table' && (
            <Select value={status ?? ALL} onValueChange={(v) => update('status', v === ALL ? null : v)}>
              <SelectTrigger aria-label="Filter status" className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua status</SelectItem>
                <SelectSeparator />
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={source ?? ALL} onValueChange={(v) => update('source', v === ALL ? null : v)}>
            <SelectTrigger aria-label="Filter sumber" className="lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua sumber</SelectItem>
              <SelectSeparator />
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => update('sort', v === DEFAULT_SORT ? null : v)}>
            <SelectTrigger aria-label="Urutkan" className="col-span-2 sm:col-span-1 lg:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilter && (
            <Button variant="ghost" onClick={resetFilters} className="col-span-2 sm:col-span-3 lg:col-span-1">
              <X />
              Reset filter
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert variant="destructive">Gagal memuat daftar lamaran. Coba muat ulang halaman.</Alert>}

      {view === 'board' ? (
        isPending ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-[17rem] shrink-0 rounded-2xl bg-card" />
            ))}
          </div>
        ) : (
          <KanbanBoard items={items} />
        )
      ) : (
        <>
          {selected.size > 0 && (
            <div
              className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-[#14162b] px-4 py-2.5 text-sm text-white shadow-lg"
              role="region"
              aria-label="Aksi massal"
            >
              <span className="font-semibold">{selected.size} dipilih</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Select onValueChange={(v) => bulkStatus(v as Status)} value="">
                  <SelectTrigger
                    aria-label="Ubah status lamaran terpilih"
                    className="h-9 w-auto gap-2 border-white/20 bg-white/10 text-white data-[placeholder]:text-white"
                  >
                    <SelectValue placeholder="Ubah status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="secondary" onClick={() => void runExport('xlsx', true)}>
                  <Download />
                  Ekspor
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Hapus
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setSelected(new Set())}
                >
                  Batal
                </Button>
              </div>
            </div>
          )}

          <Card className="overflow-hidden">
            {isPending ? (
              <ApplicationListSkeleton />
            ) : items.length === 0 ? (
              hasFilter ? (
                <EmptyState
                  icon={FileSearch}
                  title="Tidak ada lamaran yang cocok"
                  description="Coba ubah kata kunci atau filter."
                  action={
                    <Button variant="outline" onClick={resetFilters}>
                      Reset filter
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={FileStack}
                  title="Belum ada lamaran"
                  description="Mulai catat lamaran kerja Anda. Hanya butuh kurang dari satu menit."
                  action={
                    <Button onClick={ui.openCreate}>
                      <Plus />
                      Tambah lamaran
                    </Button>
                  }
                />
              )
            ) : (
              <div
                className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
                aria-busy={isPlaceholderData}
              >
                <div className="hidden md:block">
                  <ApplicationTable items={items} selection={selection} />
                </div>
                <ul className="divide-y md:hidden">
                  {items.map((app) => (
                    <ApplicationCard key={app.id} app={app} selection={selection} />
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={total}
            onPageChange={(p) => {
              update('page', p > 1 ? String(p) : null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Hapus ${selected.size} lamaran?`}
        description="Lamaran terpilih akan dihapus. Anda masih bisa membatalkannya beberapa detik setelahnya."
        confirmLabel="Hapus"
        destructive
        onConfirm={bulkDelete}
      />
    </div>
  );
}
