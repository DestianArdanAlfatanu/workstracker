import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { STATUS_LABELS, STATUSES, type Application, type Status } from '@wt/shared';
import { CalendarClock, GripVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApplicationUI } from './application-ui';
import { DueBadge, SourceBadge, STATUS_STYLE, StatusBadge } from './status';

/**
 * Board per status. Kartu bisa digeser (mouse, sentuh, atau keyboard: Spasi untuk
 * mengangkat, panah untuk pindah, Spasi untuk menaruh) untuk mengubah status.
 */
export function KanbanBoard({ items }: { items: Application[] }) {
  const ui = useApplicationUI();
  // Status sementara sampai data baru dari server masuk (optimistis).
  const [overrides, setOverrides] = useState<Record<number, Status>>({});
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, [] as Application[]])) as Record<Status, Application[]>;
    for (const app of items) {
      const status = overrides[app.id] ?? app.status;
      map[status].push(status === app.status ? app : { ...app, status });
    }
    return map;
  }, [items, overrides]);

  const byId = useMemo(() => new Map(items.map((a) => [a.id, a])), [items]);
  const active = activeId != null ? byId.get(activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(Number(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const app = byId.get(Number(e.active.id));
    const target = e.over?.id as Status | undefined;
    if (!app || !target) return;
    const current = overrides[app.id] ?? app.status;
    if (target === current) return;
    setOverrides((o) => ({ ...o, [app.id]: target }));
    ui.changeStatus(app, target, () =>
      setOverrides((o) => {
        const { [app.id]: _removed, ...rest } = o;
        return rest;
      }),
    );
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Tekan Spasi atau Enter untuk mengangkat kartu, gunakan tombol panah untuk memindahkan ke kolom status lain, lalu Spasi untuk menaruh. Esc untuk batal.',
        },
        announcements: {
          onDragStart: ({ active: a }) => `Mengangkat ${byId.get(Number(a.id))?.company ?? 'kartu'}.`,
          onDragOver: ({ over }) => (over ? `Di atas kolom ${STATUS_LABELS[over.id as Status]}.` : 'Tidak di atas kolom.'),
          onDragEnd: ({ active: a, over }) =>
            over
              ? `${byId.get(Number(a.id))?.company ?? 'Kartu'} dipindah ke ${STATUS_LABELS[over.id as Status]}.`
              : 'Dibatalkan.',
          onDragCancel: () => 'Pemindahan dibatalkan.',
        },
      }}
    >
      <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-3 sm:-mx-0 sm:px-0">
        {STATUSES.map((status) => (
          <Column key={status} status={status} items={columns[status]} onOpen={ui.openDetail} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <CardBody app={{ ...active, status: overrides[active.id] ?? active.status }} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ status, items, onOpen }: { status: Status; items: Application[]; onOpen: (id: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Kolom ${STATUS_LABELS[status]}, ${items.length} lamaran`}
      className={cn(
        'flex w-[17rem] shrink-0 snap-start flex-col rounded-2xl bg-[#e4e7f0] p-2 transition-colors',
        isOver && 'bg-accent ring-2 ring-primary/40',
      )}
    >
      <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <StatusBadge status={status} />
        <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </header>
      <div className="flex max-h-[calc(100dvh-19rem)] min-h-24 flex-col gap-2 overflow-y-auto">
        {items.map((app) => (
          <DraggableCard key={app.id} app={app} onOpen={onOpen} />
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#c5cad9] px-3 py-6 text-center text-xs text-muted-foreground">
            Seret kartu ke sini
          </p>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ app, onOpen }: { app: Application; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="kartu lamaran"
      aria-label={`${app.company}, ${app.position}, status ${STATUS_LABELS[app.status]}`}
      onClick={() => onOpen(app.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'Enter' && !e.defaultPrevented) onOpen(app.id);
      }}
      className={cn('cursor-grab touch-manipulation rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isDragging && 'opacity-40')}
    >
      <CardBody app={app} />
    </div>
  );
}

function CardBody({ app, dragging }: { app: Application; dragging?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl bg-card p-3 shadow-[0_1px_2px_rgba(17,20,45,0.06)]',
        dragging && 'rotate-2 cursor-grabbing shadow-xl',
      )}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{app.company}</p>
          <p className="truncate text-xs text-muted-foreground">{app.position}</p>
        </div>
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SourceBadge source={app.source} />
        <DueBadge date={app.nextActionDate} status={app.status} />
      </div>
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Dilamar {formatDate(app.appliedAt)}</span>
        {app.nextActionDate && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3" aria-hidden />
            {formatDate(app.nextActionDate)}
          </span>
        )}
      </p>
      <span className={cn('h-1 w-10 rounded-full', STATUS_STYLE[app.status].bar)} aria-hidden />
    </div>
  );
}
