import {
  Bell,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Megaphone,
  ChevronDown,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  LogOut,
  Plus,
  PlugZap,
  Search,
  Settings,
  Sparkles,
  UsersRound,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { dueState, formatDate } from '@/lib/format';
import { useAnnouncements, useMarkAnnouncementRead, useUpcoming } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ApplicationUIProvider, useApplicationUI } from './application-ui';
import { Logo } from './brand';
import { ConfirmDialog } from './common';
import { DemoBanner } from './demo';
import { DueBadge } from './status';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

const MENU: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/applications', label: 'Lamaran', icon: ListChecks, end: false },
  { to: '/calendar', label: 'Kalender', icon: CalendarDays, end: false },
  { to: '/tasks', label: 'Tugas', icon: CheckSquare, end: false },
  { to: '/insight', label: 'Insight', icon: Lightbulb, end: false },
];
const ACCOUNT: NavItem[] = [
  { to: '/profil-karier', label: 'Profil Karier', icon: Sparkles, end: false },
  { to: '/settings', label: 'Pengaturan', icon: Settings, end: false },
];
const ADMIN: NavItem[] = [
  { to: '/admin', label: 'Pembeli', icon: UsersRound, end: true },
  { to: '/admin/announcements', label: 'Pengumuman', icon: Megaphone, end: false },
  { to: '/admin/integrations', label: 'Integrasi', icon: PlugZap, end: false },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/applications': 'Lamaran Saya',
  '/settings': 'Pengaturan Profil',
  '/profil-karier': 'Profil Karier',
  '/admin': 'Kelola Pembeli',
  '/admin/announcements': 'Pengumuman',
  '/admin/integrations': 'Integrasi AI & Email',
  '/calendar': 'Kalender Aktivitas',
  '/tasks': 'Tugas & To-do',
  '/insight': 'Insight',
};

const longDate = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

function initials(name: string | undefined) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AppShell() {
  return (
    <ApplicationUIProvider>
      <ShellLayout />
    </ApplicationUIProvider>
  );
}

function ShellLayout() {
  const { state, logout } = useAuth();
  const ui = useApplicationUI();
  const online = useOnline();
  const location = useLocation();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const title = PAGE_TITLES[location.pathname] ?? 'WorksTracker';
  const isAdmin = state.user?.role === 'admin';

  const doLogout = async () => {
    setConfirmLogout(false);
    await logout().catch(() => undefined);
    toast.success('Anda telah keluar');
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[17rem_1fr] md:gap-2 md:p-4 lg:gap-4">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow"
      >
        Lewati ke konten
      </a>

      {/* Sidebar desktop: kartu mengambang */}
      <aside
        className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] flex-col gap-5 self-start overflow-y-auto rounded-2xl bg-card p-5 md:flex"
        aria-label="Navigasi utama"
      >
        <div className="shrink-0 px-1 pt-1">
          <Logo />
        </div>
        <Button onClick={ui.openCreate} className="w-full shrink-0 shadow-[0_8px_20px_-10px_rgba(61,90,241,0.8)]">
          <Plus />
          Tambah lamaran
        </Button>
        <NavSection label="Menu" items={MENU} />
        {isAdmin && <NavSection label="Admin" items={ADMIN} />}
        <NavSection label="Akun" items={ACCOUNT}>
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-[18px]" aria-hidden />
            Keluar
          </button>
        </NavSection>

      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-6 md:px-4 md:pt-3 lg:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{longDate.format(new Date())}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SearchButton />
            <NotificationsButton />
            <UserMenu
              name={state.user?.name}
              email={state.user?.email}
              roleLabel={isAdmin ? 'Admin' : 'Pencari kerja'}
              onLogout={() => setConfirmLogout(true)}
            />
          </div>
        </header>

        <main id="main" className="w-full flex-1 px-3 pb-24 pt-3 sm:px-6 md:px-4 md:pb-6 lg:px-6">
          {state.user?.isDemo && (
            <DemoBanner
              expiresAt={state.user.demoExpiresAt}
              onExit={() => {
                void logout();
              }}
            />
          )}
          {!online && (
            <Alert variant="warning" className="mb-4">
              <WifiOff aria-hidden />
              Anda sedang offline. Perubahan tidak dapat disimpan sampai koneksi kembali.
            </Alert>
          )}
          <Outlet />
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MENU.slice(0, 2).map((item) => (
          <MobileNavLink key={item.to} {...item} />
        ))}
        <button
          type="button"
          onClick={ui.openCreate}
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-primary"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-4" aria-hidden />
          </span>
          Tambah
        </button>
        {MENU.slice(2, 4).map((item) => (
          <MobileNavLink key={item.to} {...item} />
        ))}
      </nav>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Keluar dari WorksTracker?"
        description="Anda perlu login kembali untuk melihat lamaran Anda."
        confirmLabel="Keluar"
        onConfirm={doLogout}
      />
    </div>
  );
}

function NavSection({ label, items, children }: { label: string; items: NavItem[]; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {items.map(({ to, label: text, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgba(61,90,241,0.6)] hover:bg-primary hover:text-primary-foreground',
            )
          }
        >
          <Icon className="size-[18px]" aria-hidden />
          {text}
        </NavLink>
      ))}
      {children}
    </div>
  );
}

const iconButton =
  'relative flex size-10 items-center justify-center rounded-full bg-card text-foreground shadow-[0_1px_3px_rgba(17,20,45,0.06)] transition-colors hover:bg-accent';

function SearchButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={iconButton}
      onClick={() => navigate('/applications', { state: { focusSearch: true } })}
    >
      <Search className="size-[18px]" aria-hidden />
      <span className="sr-only">Cari lamaran</span>
    </button>
  );
}

function NotificationsButton() {
  const ui = useApplicationUI();
  const { data } = useUpcoming(5);
  const announcements = useAnnouncements();
  const markRead = useMarkAnnouncementRead();
  const unread = (announcements.data ?? []).filter((a) => !a.read).slice(0, 3);
  const due = (data ?? []).filter((a) => {
    const s = dueState(a.nextActionDate);
    return s === 'overdue' || s === 'today';
  });
  const alertCount = due.length + unread.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={iconButton}>
        <Bell className="size-[18px]" aria-hidden />
        {alertCount > 0 && (
          <span className="absolute right-2 top-2 size-2.5 rounded-full bg-destructive ring-2 ring-card" aria-hidden />
        )}
        <span className="sr-only">
          Notifikasi{alertCount > 0 ? `, ${alertCount} belum dibaca` : ''}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-xl p-2">
        {unread.length > 0 && (
          <>
            <p className="px-2 pb-2 pt-1 text-sm font-semibold">Pengumuman</p>
            {unread.map((a) => (
              <DropdownMenuItem key={a.id} onSelect={() => markRead.mutate(a.id)} className="items-start rounded-lg">
                <Megaphone className="mt-0.5 text-primary" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{a.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{a.body}</span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <p className="px-2 pb-2 pt-1 text-sm font-semibold">Jadwal terdekat</p>
        {!data?.length ? (
          <p className="px-2 pb-2 text-sm text-muted-foreground">Belum ada jadwal tindak lanjut.</p>
        ) : (
          data.map((app) => (
            <DropdownMenuItem key={app.id} onSelect={() => ui.openDetail(app.id)} className="items-start rounded-lg">
              <CalendarClock className="mt-0.5 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{app.company}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {formatDate(app.nextActionDate)} · {app.nextActionNote || app.position}
                </span>
              </span>
              <DueBadge date={app.nextActionDate} status={app.status} />
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({
  name,
  email,
  roleLabel,
  onLogout,
}: {
  name?: string;
  email?: string;
  roleLabel: string;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-card sm:pr-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#5b74ff] to-[#2b3fd0] text-sm font-semibold text-white">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 flex-col text-left lg:flex">
          <span className="max-w-[10rem] truncate text-sm font-semibold">{name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground lg:block" aria-hidden />
        <span className="sr-only lg:hidden">Menu akun {name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/insight')} className="rounded-lg md:hidden">
          <Lightbulb />
          Insight
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/profil-karier')} className="rounded-lg">
          <Sparkles />
          Profil Karier
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')} className="rounded-lg">
          <Settings />
          Pengaturan
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLogout} className="rounded-lg text-destructive focus:text-destructive">
          <LogOut />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNavLink({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-muted-foreground',
          isActive && 'text-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-accent')}>
            <Icon className="size-4" aria-hidden />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
