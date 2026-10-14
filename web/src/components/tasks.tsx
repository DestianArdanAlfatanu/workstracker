import { todayISO, type Task } from '@wt/shared';
import { Briefcase, CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { dueState, formatDate } from '@/lib/format';
import { useCreateTask, useDeleteTask, useUpdateTask } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage, useApplicationUI } from './application-ui';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';

export function TaskItem({ task, showApplication = true }: { task: Task; showApplication?: boolean }) {
  const ui = useApplicationUI();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const due = task.done ? null : dueState(task.dueDate);

  const toggle = (done: boolean) =>
    update.mutate(
      { id: task.id, input: { done } },
      {
        onSuccess: () => done && toast.success(`Tugas selesai: ${task.title}`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <li className="group flex items-start gap-3 py-2.5">
      <Checkbox
        className="mt-0.5"
        checked={task.done}
        disabled={update.isPending}
        onCheckedChange={(v) => toggle(v === true)}
        aria-label={`Tandai "${task.title}" ${task.done ? 'belum selesai' : 'selesai'}`}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', task.done && 'text-muted-foreground line-through')}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.dueDate && (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                due === 'overdue' && 'font-semibold text-[#a32020]',
                due === 'today' && 'font-semibold text-amber-800',
              )}
            >
              <CalendarClock className="size-3" aria-hidden />
              {due === 'overdue' ? 'Terlewat · ' : due === 'today' ? 'Hari ini · ' : ''}
              {formatDate(task.dueDate)}
            </span>
          )}
          {showApplication && task.application && (
            <button
              type="button"
              onClick={() => ui.openDetail(task.application!.id)}
              className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
            >
              <Briefcase className="size-3" aria-hidden />
              {task.application.company}
            </button>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        onClick={() =>
          remove.mutate(task.id, {
            onSuccess: () => toast.success('Tugas dihapus'),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      >
        <Trash2 />
        <span className="sr-only">Hapus tugas {task.title}</span>
      </Button>
    </li>
  );
}

/** Input cepat: judul + tenggat opsional. */
export function QuickAddTask({
  applicationId,
  autoFocus,
  stacked = false,
}: {
  applicationId?: number;
  autoFocus?: boolean;
  /** Selalu bertumpuk (untuk panel sempit seperti detail lamaran). */
  stacked?: boolean;
}) {
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title, dueDate: dueDate || null, applicationId: applicationId ?? null },
      {
        onSuccess: () => {
          setTitle('');
          setDueDate('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-2', !stacked && 'sm:flex-row')}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tambah tugas, mis. Kirim portofolio"
        aria-label="Judul tugas baru"
        maxLength={200}
        autoFocus={autoFocus}
        className={cn(!stacked && 'sm:flex-1')}
      />
      <div className="flex gap-2">
        <Input
          type="date"
          value={dueDate}
          min={todayISO()}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Tenggat tugas (opsional)"
          className={cn('w-auto flex-1', !stacked && 'sm:w-40 sm:flex-none')}
        />
        <Button type="submit" loading={create.isPending} disabled={!title.trim()} aria-label="Tambah tugas">
          {!create.isPending && <Plus />}
          Tambah
        </Button>
      </div>
    </form>
  );
}
