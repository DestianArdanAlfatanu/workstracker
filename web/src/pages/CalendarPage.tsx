import { addDaysISO, todayISO, weekStartISO, type CalendarEvent, type CalendarEventType } from '@wt/shared';
import { CalendarClock, ChevronLeft, ChevronRight, ListTodo, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApplicationUI } from '@/components/application-ui';
import { StatusBadge } from '@/components/status';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCalendar } from '@/lib/queries';
import { cn } from '@/lib/utils';

const TYPE_META: Record<CalendarEventType, { label: string; dot: string; chip: string; icon: typeof Send }> = {
  next_action: {
    label: 'Jadwal / tindak lanjut',
    dot: 'bg-primary',
    chip: 'bg-accent text-accent-foreground',
    icon: CalendarClock,
  },
  task: { label: 'Tugas', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-800', icon: ListTodo },
  applied: { label: 'Tanggal lamar', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700', icon: Send },
};

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const monthTitle = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayTitle = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function CalendarPage() {
  const ui = useApplicationUI();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);

  // Grid 6 minggu (Senin–Minggu) yang memuat seluruh bulan.
  const gridStart = weekStartISO(`${month}-01`);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDaysISO(gridStart, i)), [gridStart]);
  const { data, isError } = useCalendar(days[0], days[41]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of data ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [data]);

  const selectedEvents = byDay.get(selected) ?? [];
  const goTo = (ym: string) => {
    setMonth(ym);
    setSelected(ym === today.slice(0, 7) ? today : `${ym}-01`);
  };

  const openEvent = (e: CalendarEvent) => {
    if (e.applicationId) ui.openDetail(e.applicationId);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold capitalize tracking-tight" aria-live="polite">
            {monthTitle.format(asDate(`${month}-01`))}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => goTo(today.slice(0, 7))}>
              Hari ini
            </Button>
            <Button variant="outline" size="icon" className="size-9" onClick={() => goTo(shiftMonth(month, -1))}>
              <ChevronLeft />
              <span className="sr-only">Bulan sebelumnya</span>
            </Button>
            <Button variant="outline" size="icon" className="size-9" onClick={() => goTo(shiftMonth(month, 1))}>
              <ChevronRight />
              <span className="sr-only">Bulan berikutnya</span>
            </Button>
          </div>
        </div>

        {isError && <Alert variant="destructive">Gagal memuat kalender.</Alert>}

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Kalender aktivitas">
          {days.map((d) => {
            const events = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            const isToday = d === today;
            const isSelected = d === selected;
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${dayTitle.format(asDate(d))}, ${events.length} aktivitas`}
                onClick={() => setSelected(d)}
                className={cn(
                  'flex min-h-14 flex-col items-stretch gap-1 rounded-xl border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5',
                  inMonth ? 'bg-card' : 'bg-muted/50 text-muted-foreground',
                  isSelected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-border',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center self-start rounded-full text-xs font-semibold tabular-nums',
                    isToday && 'bg-primary text-primary-foreground',
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {/* Layar kecil: titik saja */}
                <span className="flex flex-wrap gap-0.5 px-0.5 sm:hidden" aria-hidden>
                  {events.slice(0, 4).map((e, i) => (
                    <span key={i} className={cn('size-1.5 rounded-full', TYPE_META[e.type].dot)} />
                  ))}
                </span>
                {/* Layar lebar: chip judul */}
                <span className="hidden flex-col gap-0.5 sm:flex" aria-hidden>
                  {events.slice(0, 3).map((e, i) => (
                    <span
                      key={i}
                      className={cn(
                        'truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-medium',
                        TYPE_META[e.type].chip,
                        e.done && 'line-through opacity-70',
                      )}
                    >
                      {e.title}
                    </span>
                  ))}
                  {events.length > 3 && (
                    <span className="px-1 text-[10.5px] text-muted-foreground">+{events.length - 3} lainnya</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full', meta.dot)} aria-hidden />
              {meta.label}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3 p-4 sm:p-5 xl:sticky xl:top-4 xl:self-start">
        <h2 className="text-base font-bold capitalize tracking-tight">{dayTitle.format(asDate(selected))}</h2>
        {selectedEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada aktivitas di tanggal ini.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedEvents.map((e, i) => {
              const meta = TYPE_META[e.type];
              const Icon = meta.icon;
              const clickable = !!e.applicationId;
              return (
                <li key={`${e.type}-${e.applicationId ?? e.taskId}-${i}`}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => openEvent(e)}
                    className="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors enabled:hover:bg-accent/50 disabled:cursor-default"
                  >
                    <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', meta.chip)}>
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {meta.label}
                      </span>
                      <span className={cn('block truncate text-sm font-semibold', e.done && 'line-through')}>
                        {e.title}
                      </span>
                      {e.subtitle && <span className="block truncate text-xs text-muted-foreground">{e.subtitle}</span>}
                    </span>
                    {e.status && <StatusBadge status={e.status} className="shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
