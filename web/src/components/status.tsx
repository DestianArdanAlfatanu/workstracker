import { SOURCE_LABELS, STATUS_LABELS, STATUSES, type Source, type Status } from '@wt/shared';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Gift,
  MessagesSquare,
  ScanSearch,
  Send,
  Star,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { dueState } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';

export const STATUS_STYLE: Record<Status, { badge: string; bar: string; icon: LucideIcon }> = {
  wishlist: { badge: 'bg-slate-100 text-slate-700 border-slate-200', bar: 'bg-slate-400', icon: Star },
  applied: { badge: 'bg-blue-50 text-blue-800 border-blue-200', bar: 'bg-blue-500', icon: Send },
  screening: { badge: 'bg-violet-50 text-violet-800 border-violet-200', bar: 'bg-violet-500', icon: ScanSearch },
  interview: { badge: 'bg-amber-50 text-amber-900 border-amber-300', bar: 'bg-amber-400', icon: MessagesSquare },
  offer: { badge: 'bg-lime-50 text-lime-900 border-lime-300', bar: 'bg-lime-500', icon: Gift },
  accepted: { badge: 'bg-green-100 text-green-800 border-green-300', bar: 'bg-green-600', icon: CheckCircle2 },
  rejected: { badge: 'bg-red-50 text-red-800 border-red-200', bar: 'bg-red-500', icon: XCircle },
  withdrawn: { badge: 'bg-zinc-200 text-zinc-800 border-zinc-300', bar: 'bg-zinc-600', icon: Ban },
};

const badgeBase = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { badge, icon: Icon } = STATUS_STYLE[status];
  return (
    <span className={cn(badgeBase, badge, className)}>
      <Icon className="size-3" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function SourceBadge({ source }: { source: Source }) {
  return <span className={cn(badgeBase, 'border-border bg-card text-muted-foreground')}>{SOURCE_LABELS[source]}</span>;
}

/** Badge "Hari ini" / "Terlewat" untuk tanggal tindak lanjut. */
export function DueBadge({ date, status }: { date: string | null; status?: Status }) {
  const state = dueState(date);
  if (!state || state === 'upcoming') return null;
  if (status && ['accepted', 'rejected', 'withdrawn'].includes(status)) return null;
  return state === 'today' ? (
    <span className={cn(badgeBase, 'border-amber-300 bg-amber-100 text-amber-900')}>
      <CalendarClock className="size-3" aria-hidden />
      Hari ini
    </span>
  ) : (
    <span className={cn(badgeBase, 'border-red-300 bg-red-100 text-red-800')}>
      <TriangleAlert className="size-3" aria-hidden />
      Terlewat
    </span>
  );
}

interface StatusSelectProps {
  value: Status;
  onChange: (status: Status) => void;
  disabled?: boolean;
  label: string;
}

/** Dropdown ubah status cepat; trigger tampil seperti badge status. */
export function StatusSelect({ value, onChange, disabled, label }: StatusSelectProps) {
  const { badge, icon: Icon } = STATUS_STYLE[value];
  return (
    <Select value={value} onValueChange={(v) => v !== value && onChange(v as Status)} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        className={cn('h-8 w-auto min-w-[8.5rem] gap-1.5 rounded-full px-2.5 text-xs font-medium', badge)}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex items-center gap-1">
          <Icon className="size-3.5" aria-hidden />
          {STATUS_LABELS[value]}
        </span>
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {STATUSES.map((s) => {
          const ItemIcon = STATUS_STYLE[s].icon;
          return (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-2">
                <ItemIcon className="size-3.5" aria-hidden />
                {STATUS_LABELS[s]}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
