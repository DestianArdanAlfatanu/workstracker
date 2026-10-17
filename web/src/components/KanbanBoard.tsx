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
import { ArrowRightLeft, CalendarClock, Check, GripVertical } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApplicationUI } from './application-ui';
import { DueBadge, SourceBadge, STATUS_STYLE, StatusBadge } from './status';
import { BottomSheetContent, Sheet, SheetDescription, SheetTitle } from './ui/sheet';

const CHIP = 'chip:';
/** Target drop: kolom (id = status) atau chip status di strip HP (id = "chip:status"). */
const statusOf = (id: unknown) => String(id).replace(CHIP, '') as Status;

function useIsMobile() {
  const query = '(max-width: 767px)';
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

/**
 * Board per status. Kartu bisa digeser (mouse, sentuh, atau keyboard: Spasi untuk
 * mengangkat, panah untuk pindah, Spasi untuk menaruh) untuk mengubah status.
 */
export function KanbanBoard({ items }: { items: Application[] }) {
  const ui = useApplicationUI();
  // Status sementara sampai data baru dari server masuk (optimistis).
  const [overrides, setOverrides] = useState<Record<number, Status>>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [moving, setMoving] = useState<Application | null>(null);
  const mobile = useIsMobile();
  const columnRefs = useRef<Partial<Record<Status, HTMLElement | null>>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Tekan-tahan 250 ms untuk mengangkat kartu; geser biasa tetap menggulir board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(Number(e.active.id));
    navigator.vibrate?.(15);
  };
  const moveTo = (app: Application, target: Status) => {
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
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const app = byId.get(Number(e.active.id));
    if (app && e.over) moveTo(app, statusOf(e.over.id));
  };
  const jumpTo = (status: Status) => columnRefs.current[status]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });

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
          onDragOver: ({ over }) => (over ? `Di atas kolom ${STATUS_LABELS[statusOf(over.id)]}.` : 'Tidak di atas kolom.'),
          onDragEnd: ({ active: a, over }) =>
            over
              ? `${byId.get(Number(a.id))?.company ?? 'Kartu'} dipindah ke ${STATUS_LABELS[statusOf(over.id)]}.`
              : 'Dibatalkan.',
          onDragCancel: () => 'Pemindahan dibatalkan.',
        },
      }}
    >
      {mobile && <StatusStrip counts={columns} dragging={activeId !== null} onJump={jumpTo} />}
      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-3 sm:-mx-0 sm:snap-none sm:px-0">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            items={columns[status]}
            onOpen={ui.openDetail}
            onMove={mobile ? setMoving : undefined}
            sectionRef={(el) => (columnRefs.current[status] = el)}
          />
        ))}
      </div>
      <MoveSheet
        app={moving}
        current={moving ? (overrides[moving.id] ?? moving.status) : null}
        onClose={() => setMoving(null)}
        onPick={(status) => {
          if (moving) moveTo(moving, status);
          setMoving(null);
        }}
      />
      <DragOverlay dropAnimation={null}>
        {active ? <CardBody app={{ ...active, status: overrides[active.id] ?? active.status }} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Strip status lengket di HP: ketuk untuk melompat ke kolom; saat kartu diangkat, lepaskan di chip tujuan. */
function StatusStrip({ counts, dragging, onJump }: { counts: Record<Status, Application[]>; dragging: boolean; onJump: (s: Status) => void }) {
  return (
    <div
      className={cn('sticky top-0 z-10 -mx-3 mb-2 bg-background/95 px-3 py-2 backdrop-blur transition-shadow', dragging && 'shadow-md')}
      aria-label="Status lamaran"
      role="group"
    >
      {dragging && <p className="mb-1.5 text-xs font-semibold text-primary">Lepaskan di status tujuan</p>}
      <div className={cn('flex gap-1.5 overflow-x-auto pb-0.5', dragging && 'flex-wrap')}>
        {STATUSES.map((status) => (
          <StatusChip key={status} status={status} count={counts[status].length} dragging={dragging} onJump={onJump} />
        ))}
      </div>
    </div>
  );
}

function StatusChip({ status, count, dragging, onJump }: { status: Status; count: number; dragging: boolean; onJump: (s: Status) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${CHIP}${status}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onJump(status)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition-colors',
        dragging && 'border-dashed border-primary/50 py-2.5',
        isOver && 'border-solid border-primary bg-accent text-primary ring-2 ring-primary/40',
      )}
    >
      <span className={cn('size-2 rounded-full', STATUS_STYLE[status].bar)} aria-hidden />
      {STATUS_LABELS[status]}
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

/** Pilih status tujuan tanpa menyeret (HP). */
function MoveSheet({ app, current, onClose, onPick }: { app: Application | null; current: Status | null; onClose: () => void; onPick: (s: Status) => void }) {
  return (
    <Sheet open={app !== null} onOpenChange={(o) => !o && onClose()}>
      <BottomSheetContent>
        <SheetTitle className="px-1 text-base font-bold">Pindah ke status</SheetTitle>
        <SheetDescription className="px-1 pb-2 text-sm text-muted-foreground">
          {app?.company} · {app?.position}
        </SheetDescription>
        <ul className="flex flex-col gap-1" aria-label="Pilih status">
          {STATUSES.map((status) => (
            <li key={status}>
              <button
                type="button"
                onClick={() => onPick(status)}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted', status === current && 'bg-accent font-semibold text-primary')}
              >
                <span className={cn('size-2.5 rounded-full', STATUS_STYLE[status].bar)} aria-hidden />
                <span className="flex-1">{STATUS_LABELS[status]}</span>
                {status === current && <Check className="size-4" aria-label="status sekarang" />}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheetContent>
    </Sheet>
  );
}

function Column({
  status,
  items,
  onOpen,
  onMove,
  sectionRef,
}: {
  status: Status;
  items: Application[];
  onOpen: (id: number) => void;
  onMove?: (app: Application) => void;
  sectionRef: (el: HTMLElement | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={(el) => {
        setNodeRef(el);
        sectionRef(el);
      }}
      aria-label={`Kolom ${STATUS_LABELS[status]}, ${items.length} lamaran`}
      className={cn(
        'flex w-[85vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-2xl bg-[#e2e8f0] p-2 transition-colors sm:w-[17rem]',
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
          <DraggableCard key={app.id} app={app} onOpen={onOpen} onMove={onMove} />
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#cbd5e1] px-3 py-6 text-center text-xs text-muted-foreground">
            Seret kartu ke sini
          </p>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ app, onOpen, onMove }: { app: Application; onOpen: (id: number) => void; onMove?: (app: Application) => void }) {
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
      <CardBody
        app={app}
        action={
          onMove && (
            <button
              type="button"
              aria-label={`Pindahkan ${app.company} ke status lain`}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMove(app);
              }}
              className="-m-1.5 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <ArrowRightLeft className="size-4" aria-hidden />
            </button>
          )
        }
      />
    </div>
  );
}

function CardBody({ app, dragging, action }: { app: Application; dragging?: boolean; action?: ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
        dragging && 'rotate-2 cursor-grabbing shadow-xl',
      )}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{app.company}</p>
          <p className="truncate text-xs text-muted-foreground">{app.position}</p>
        </div>
        {action ?? <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />}
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
