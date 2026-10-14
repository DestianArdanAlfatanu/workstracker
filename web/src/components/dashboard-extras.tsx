import type { Announcement, AnnouncementLevel, WeeklyProgress } from '@wt/shared';
import { Megaphone, PartyPopper, Sparkles, Target, X, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useAnnouncements, useMarkAnnouncementRead, useUpdatePreferences } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from './application-ui';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';

/* ------------------------------------------------------------------ */
/* Target mingguan                                                     */
/* ------------------------------------------------------------------ */

const shortDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const short = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));

export function WeeklyGoalCard({ weekly }: { weekly: WeeklyProgress }) {
  const { setUser } = useAuth();
  const prefs = useUpdatePreferences();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(weekly.goal ?? 10));
  const { goal, count } = weekly;
  const pct = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;
  const reached = !!goal && count >= goal;
  const maxBar = Math.max(goal ?? 0, ...weekly.history.map((h) => h.count), 1);

  const save = (e: FormEvent) => {
    e.preventDefault();
    prefs.mutate(
      { weeklyGoal: value === '' ? null : Number(value) },
      {
        onSuccess: (user) => {
          setUser(user);
          setEditing(false);
          toast.success(user.weeklyGoal ? `Target diatur: ${user.weeklyGoal} lamaran/minggu` : 'Target dihapus');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-bold tracking-tight">
            <Target className="size-4 text-primary" aria-hidden />
            Target Mingguan
          </h2>
          <p className="text-xs text-muted-foreground">
            {short(weekly.weekStart)} – {formatDate(weekly.weekEnd)}
          </p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditing(true)}>
            {goal ? 'Ubah' : 'Atur target'}
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2">
          <label htmlFor="weekly-goal" className="text-sm font-medium">
            Berapa lamaran yang ingin dikirim per minggu?
          </label>
          <div className="flex gap-2">
            <Input
              id="weekly-goal"
              type="number"
              min={1}
              max={200}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28"
              autoFocus
            />
            <Button type="submit" loading={prefs.isPending}>
              Simpan
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Batal
            </Button>
          </div>
        </form>
      ) : goal ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight">{count}</span>
            <span className="text-sm text-muted-foreground">/ {goal} lamaran minggu ini</span>
          </p>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-[var(--chart-track)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={count}
            aria-label="Progres target mingguan"
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-700', reached ? 'bg-[#1baf7a]' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {reached ? (
              <span className="inline-flex items-center gap-1 font-semibold text-[#0f6b3a]">
                <PartyPopper className="size-3.5" aria-hidden />
                Target tercapai! Pertahankan ritmenya.
              </span>
            ) : (
              `Kurang ${goal - count} lamaran lagi untuk mencapai target.`
            )}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tetapkan target agar konsisten melamar. Minggu ini Anda sudah mengirim{' '}
          <span className="font-semibold text-foreground">{count}</span> lamaran.
        </p>
      )}

      {/* 8 minggu terakhir */}
      <div>
        <div className="relative flex h-14 items-end gap-1.5" aria-hidden>
          {goal ? (
            <div
              className="absolute inset-x-0 border-t border-dashed border-[#9aa3bb]"
              style={{ bottom: `${(goal / maxBar) * 100}%` }}
            />
          ) : null}
          {weekly.history.map((h, i) => (
            <div
              key={h.weekStart}
              title={`Minggu ${short(h.weekStart)}: ${h.count} lamaran`}
              className={cn(
                'flex-1 rounded-t-[4px]',
                i === weekly.history.length - 1 ? 'bg-primary' : 'bg-[var(--chart-applied)]',
              )}
              style={{ height: `${(h.count / maxBar) * 100}%`, minHeight: h.count ? 3 : 1 }}
            />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">8 minggu terakhir{goal ? ' · garis putus = target' : ''}</p>
        <table className="sr-only">
          <caption>Jumlah lamaran per minggu</caption>
          <tbody>
            {weekly.history.map((h) => (
              <tr key={h.weekStart}>
                <th scope="row">Minggu mulai {short(h.weekStart)}</th>
                <td>{h.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Pengumuman                                                          */
/* ------------------------------------------------------------------ */

export const LEVEL_META: Record<AnnouncementLevel, { label: string; icon: LucideIcon; tone: string; badge: string }> = {
  info: { label: 'Info', icon: Megaphone, tone: 'from-[#eef1fe] to-white', badge: 'bg-accent text-accent-foreground' },
  update: { label: 'Fitur baru', icon: Sparkles, tone: 'from-violet-50 to-white', badge: 'bg-violet-100 text-violet-800' },
  promo: { label: 'Promo', icon: PartyPopper, tone: 'from-amber-50 to-white', badge: 'bg-amber-100 text-amber-900' },
};

/** Banner pengumuman terbaru yang belum ditutup. */
export function AnnouncementBanner() {
  const { data } = useAnnouncements();
  const markRead = useMarkAnnouncementRead();
  const latest = data?.find((a) => !a.read);
  if (!latest) return null;
  return <AnnouncementCard a={latest} onDismiss={() => markRead.mutate(latest.id)} />;
}

export function AnnouncementCard({ a, onDismiss }: { a: Announcement; onDismiss?: () => void }) {
  const meta = LEVEL_META[a.level];
  const Icon = meta.icon;
  return (
    <Card className={cn('relative flex gap-3 bg-gradient-to-r p-4 pr-12', meta.tone)} role="status">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', meta.badge)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', meta.badge)}>{meta.label}</span>
          <span className="font-semibold">{a.title}</span>
        </p>
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">Tutup pengumuman</span>
        </button>
      )}
    </Card>
  );
}
