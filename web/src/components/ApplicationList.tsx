import type { Application } from '@wt/shared';
import { CalendarClock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { formatDate, formatSalaryRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApplicationUI } from './application-ui';
import { DueBadge, SourceBadge, StatusSelect } from './status';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Skeleton } from './ui/skeleton';

function RowActions({ app }: { app: Application }) {
  const ui = useApplicationUI();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
          <span className="sr-only">Aksi untuk lamaran {app.company}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => ui.openEdit(app)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => ui.requestDelete(app)}>
          <Trash2 />
          Hapus
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface Selection {
  selected: Set<number>;
  toggle: (id: number) => void;
  setMany: (ids: number[], checked: boolean) => void;
}

/** Tabel untuk layar ≥ md. */
export function ApplicationTable({ items, selection }: { items: Application[]; selection?: Selection }) {
  const ui = useApplicationUI();
  const ids = items.map((a) => a.id);
  const selectedHere = selection ? ids.filter((id) => selection.selected.has(id)).length : 0;
  const allState = selectedHere === 0 ? false : selectedHere === ids.length ? true : 'indeterminate';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {selection && (
              <th scope="col" className="w-10 py-3 pl-4">
                <Checkbox
                  checked={allState}
                  onCheckedChange={(v) => selection.setMany(ids, v === true)}
                  aria-label="Pilih semua lamaran di halaman ini"
                />
              </th>
            )}
            <th scope="col" className="px-4 py-3 font-medium">Perusahaan & posisi</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium">Sumber</th>
            <th scope="col" className="px-4 py-3 font-medium">Tanggal lamar</th>
            <th scope="col" className="px-4 py-3 font-medium">Tindak lanjut</th>
            <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((app) => (
            <tr
              key={app.id}
              className={cn('cursor-pointer hover:bg-muted/40', selection?.selected.has(app.id) && 'bg-accent/60')}
              onClick={() => ui.openDetail(app.id)}
            >
              {selection && (
                <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selection.selected.has(app.id)}
                    onCheckedChange={() => selection.toggle(app.id)}
                    aria-label={`Pilih lamaran ${app.company}`}
                  />
                </td>
              )}
              <td className="max-w-[18rem] px-4 py-3">
                <button
                  type="button"
                  className="block max-w-full text-left focus-visible:rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    ui.openDetail(app.id);
                  }}
                >
                  <span className="block truncate font-medium">{app.company}</span>
                  <span className="block truncate text-muted-foreground">{app.position}</span>
                </button>
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <StatusSelect
                  value={app.status}
                  label={`Ubah status lamaran ${app.company}`}
                  disabled={ui.pendingStatusId === app.id}
                  onChange={(s) => ui.changeStatus(app, s)}
                />
              </td>
              <td className="px-4 py-3">
                <SourceBadge source={app.source} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(app.appliedAt)}</td>
              <td className="px-4 py-3">
                {app.nextActionDate ? (
                  <div className="flex flex-col items-start gap-1">
                    <span className="whitespace-nowrap tabular-nums">{formatDate(app.nextActionDate)}</span>
                    <DueBadge date={app.nextActionDate} status={app.status} />
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                <RowActions app={app} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Kartu untuk layar kecil. */
export function ApplicationCard({ app, selection }: { app: Application; selection?: Selection }) {
  const ui = useApplicationUI();
  const salary = formatSalaryRange(app.salaryMin, app.salaryMax);
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        {selection && (
          <Checkbox
            className="mt-0.5"
            checked={selection.selected.has(app.id)}
            onCheckedChange={() => selection.toggle(app.id)}
            aria-label={`Pilih lamaran ${app.company}`}
          />
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => ui.openDetail(app.id)}>
          <span className="block truncate font-medium">{app.company}</span>
          <span className="block truncate text-sm text-muted-foreground">{app.position}</span>
        </button>
        <RowActions app={app} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusSelect
          value={app.status}
          label={`Ubah status lamaran ${app.company}`}
          disabled={ui.pendingStatusId === app.id}
          onChange={(s) => ui.changeStatus(app, s)}
        />
        <SourceBadge source={app.source} />
        <DueBadge date={app.nextActionDate} status={app.status} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Dilamar {formatDate(app.appliedAt)}</span>
        {app.nextActionDate && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3" aria-hidden />
            {formatDate(app.nextActionDate)}
          </span>
        )}
        {salary !== '—' && <span>{salary}</span>}
      </div>
    </li>
  );
}

export function ApplicationListSkeleton() {
  return (
    <div className="flex flex-col divide-y" aria-busy="true" aria-label="Memuat lamaran">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="hidden h-4 w-20 md:block" />
        </div>
      ))}
    </div>
  );
}
