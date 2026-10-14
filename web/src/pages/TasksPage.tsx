import { todayISO, type Task } from '@wt/shared';
import { CheckCheck, ListTodo } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/common';
import { QuickAddTask, TaskItem } from '@/components/tasks';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTasks } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Tab = 'open' | 'done';

function groupOpen(tasks: Task[]) {
  const today = todayISO();
  const groups: Array<{ key: string; label: string; items: Task[]; tone?: string }> = [
    { key: 'overdue', label: 'Terlewat', items: [], tone: 'text-[#a32020]' },
    { key: 'today', label: 'Hari ini', items: [], tone: 'text-amber-800' },
    { key: 'upcoming', label: 'Mendatang', items: [] },
    { key: 'none', label: 'Tanpa tenggat', items: [] },
  ];
  for (const t of tasks) {
    const g = !t.dueDate ? 3 : t.dueDate < today ? 0 : t.dueDate === today ? 1 : 2;
    groups[g].items.push(t);
  }
  return groups.filter((g) => g.items.length > 0);
}

export function TasksPage() {
  const [tab, setTab] = useState<Tab>('open');
  const { data, isPending, isError } = useTasks({ status: tab });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-bold tracking-tight">Tambah tugas</h2>
          <p className="text-xs text-muted-foreground">
            Catat hal yang perlu dikerjakan, mis. memperbarui CV atau latihan interview. Tugas untuk lamaran tertentu bisa
            ditambahkan dari detail lamaran.
          </p>
        </div>
        <QuickAddTask autoFocus />
      </Card>

      <Card className="flex flex-col gap-2 p-4 sm:p-5">
        <div className="inline-flex self-start rounded-xl bg-muted p-1" role="tablist" aria-label="Filter tugas">
          {(
            [
              { key: 'open', label: 'Belum selesai' },
              { key: 'done', label: 'Selesai' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground',
                tab === t.key && 'bg-card text-foreground shadow-sm',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isError && <Alert variant="destructive">Gagal memuat tugas.</Alert>}
        {isPending ? (
          <div className="flex flex-col gap-3 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.length ? (
          tab === 'open' ? (
            <EmptyState icon={CheckCheck} title="Semua tugas beres!" description="Tidak ada tugas yang belum selesai." />
          ) : (
            <EmptyState icon={ListTodo} title="Belum ada tugas selesai" />
          )
        ) : tab === 'open' ? (
          groupOpen(data).map((g) => (
            <section key={g.key} className="pt-2">
              <h3 className={cn('text-xs font-semibold uppercase tracking-wide text-muted-foreground', g.tone)}>
                {g.label} <span className="font-normal">({g.items.length})</span>
              </h3>
              <ul className="divide-y">
                {g.items.map((t) => (
                  <TaskItem key={t.id} task={t} />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <ul className="divide-y pt-1">
            {data.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
