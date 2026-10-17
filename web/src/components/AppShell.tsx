import {
  Bell,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  FileText,
  Megaphone,
  ChevronDown,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Download,
  MoreHorizontal,
  Lock,
  LogOut,
  Plus,
  PlugZap,
  Receipt,
  Search,
  Settings,
  Sparkles,
  UsersRound,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { PLANS, requiredPlan, type Feature, type Plan } from '@wt/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useInstall } from '@/lib/pwa';
import { dueState, formatDate } from '@/lib/format';
import { useAiUsage, useAnnouncements, useMarkAnnouncementRead, useUpcoming } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ApplicationUIProvider, useApplicationUI } from './application-ui';
import { Logo } from './brand';
import { ConfirmDialog } from './common';
import { DemoBanner } from './demo';
import { PlanBadge, usePlan } from './plan';
import { DueBadge } from './status';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { BottomSheetContent, Sheet, SheetDescription, SheetTitle } from './ui/sheet';
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
  /** Fitur paket; menu tetap tampil dengan gembok bila belum termasuk paket. */
  feature?: Feature;
}

const MENU: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/applications', label: 'Lamaran', icon: ListChecks, end: false },
  { to: '/calendar', label: 'Kalender', icon: CalendarDays, end: false, feature: 'calendar' },
  { to: '/tasks', label: 'Tugas', icon: CheckSquare, end: false, feature: 'tasks' },
  { to: '/insight', label: 'Insight', icon: Lightbulb, end: false, feature: 'insight' },
];
const ACCOUNT: NavItem[] = [
  { to: '/cv', label: 'CV Saya', icon: FileText, end: false, feature: 'attachments' },
  { to: '/profil-karier', label: 'Profil Karier', icon: Sparkles, end: false, feature: 'ai' },
  { to: '/settings', label: 'Pengaturan', icon: Settings, end: false },
];
const ADMIN: NavItem[] = [
  { to: '/admin', label: 'Pembeli', icon: UsersRound, end: true },
  { to: '/admin/orders', label: 'Pesanan', icon: Receipt, end: false },
  { to: '/admin/announcements', label: 'Pengumuman', icon: Megaphone, end: false },
  { to: '/admin/integrations', label: 'Integrasi', icon: PlugZap, end: false },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/applications': 'Lamaran Saya',
  '/settings': 'Pengaturan Profil',
  '/profil-karier': 'Profil Karier',
  '/cv': 'CV Saya',
  '/bagikan': 'Simpan loker',
  '/admin': 'Kelola Pembeli',
  '/admin/orders': 'Pesanan & Pembayaran',
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
  const { plan } = usePlan();
  const keyboardOpen = useKeyboardOpen();

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
        className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] flex-col gap-5 self-start overflow-y-auto rounded-2xl border border-border bg-card p-5 md:flex"
        aria-label="Navigasi utama"
      >
        <div className="flex shrink-0 flex-col items-start gap-2 px-1 pt-1">
          <Logo />
          {!isAdmin && !state.user?.isDemo && <PlanBadge plan={plan} />}
        </div>
        <Button onClick={ui.openCreate} className="w-full shrink-0">
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
              roleLabel={isAdmin ? 'Admin' : state.user?.isDemo ? 'Mode demo' : `Paket ${PLANS[plan].name}`}
              plan={isAdmin || state.user?.isDemo ? null : plan}
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
          {(!online || (state.status === 'authenticated' && state.offline)) && (
            <Alert variant="warning" className="mb-4">
              <WifiOff aria-hidden />
              Anda sedang offline. Data yang tampil adalah data terakhir di perangkat ini; perubahan baru bisa disimpan setelah koneksi kembali.
            </Alert>
          )}
          <Outlet />
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav
        aria-label="Navigasi utama"
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden',
          // Disembunyikan saat keyboard HP terbuka agar tidak menutupi isian.
          keyboardOpen && 'hidden',
        )}
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
        <MobileNavLink {...MENU.find((m) => m.to === '/tasks')!} />
        <MoreMenu isAdmin={isAdmin} onLogout={() => setConfirmLogout(true)} />
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
  const { has } = usePlan();
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {items.map(({ to, label: text, icon: Icon, end, feature }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="size-[18px]" aria-hidden />
              <span className="flex-1">{text}</span>
              {feature && !has(feature) && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                  )}
                  title={`Tersedia di paket ${PLANS[requiredPlan(feature)].name}`}
                >
                  <Lock className="size-3" aria-hidden />
                  {PLANS[requiredPlan(feature)].name}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
      {children}
    </div>
  );
}

const iconButton =
  'relative flex size-10 items-center justify-center rounded-full bg-card text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors hover:bg-accent';

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
  plan,
  onLogout,
}: {
  name?: string;
  email?: string;
  roleLabel: string;
  plan: Plan | null;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const { has } = usePlan();
  const usage = useAiUsage(!!plan && has('ai'));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-card sm:pr-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
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
          {plan && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <PlanBadge plan={plan} />
              {has('ai') && usage.data && <span>{usage.data.balance} kredit AI</span>}
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/insight')} className="rounded-lg md:hidden">
          <Lightbulb />
          Insight
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/cv')} className="rounded-lg">
          <FileText />
          CV Saya
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

/** Keyboard virtual terbuka (tinggi viewport visual jauh lebih kecil dari layar). */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const typing = document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, [contenteditable="true"]');
      setOpen(typing && window.innerHeight - vv.height > 150);
    };
    vv.addEventListener('resize', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    return () => {
      vv.removeEventListener('resize', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
    };
  }, []);
  return open;
}

const MORE_ITEMS: NavItem[] = [
  ...MENU.filter((m) => ['/calendar', '/insight'].includes(m.to)),
  ...ACCOUNT,
];

/** Menu "Lainnya" di bottom nav HP: halaman yang tidak muat di 5 slot, pasang aplikasi, keluar. */
function MoreMenu({ isAdmin, onLogout }: { isAdmin: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { has } = usePlan();
  const install = useInstall();
  const items = isAdmin ? [...MORE_ITEMS, ...ADMIN] : MORE_ITEMS;
  const active = items.some((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn('flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-muted-foreground', active && 'text-primary')}
      >
        <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', active && 'bg-accent')}>
          <MoreHorizontal className="size-4" aria-hidden />
        </span>
        Lainnya
      </button>
      <BottomSheetContent aria-describedby={undefined}>
        <SheetTitle className="px-1 pb-2 text-base font-bold">Menu lainnya</SheetTitle>
        <SheetDescription className="sr-only">Halaman lain di WorksTracker</SheetDescription>
        <ul className="grid grid-cols-3 gap-2" aria-label="Menu lainnya">
          {items.map(({ to, label, icon: Icon, feature }) => {
            const locked = feature && !has(feature);
            const current = location.pathname === to;
            return (
              <li key={to}>
                <button
                  type="button"
                  onClick={() => navigate(to)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex w-full flex-col items-center gap-1.5 rounded-2xl bg-muted px-2 py-3 text-xs font-medium',
                    current && 'bg-accent text-primary',
                  )}
                >
                  <span className="relative">
                    <Icon className="size-5" aria-hidden />
                    {locked && <Lock className="absolute -right-2.5 -top-1.5 size-3 rounded-full bg-card p-px text-muted-foreground" aria-label="terkunci" />}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-col gap-1 border-t pt-3">
          {install.canPrompt && !install.installed && (
            <Button variant="ghost" className="justify-start" onClick={() => void install.install()}>
              <Download />
              Pasang aplikasi di HP
            </Button>
          )}
          <Button
            variant="ghost"
            className="justify-start text-destructive hover:text-destructive"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut />
            Keluar
          </Button>
        </div>
      </BottomSheetContent>
    </Sheet>
  );
}

function MobileNavLink({ to, label, icon: Icon, end, feature }: NavItem) {
  const { has } = usePlan();
  const locked = feature && !has(feature);
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
          <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-accent')}>
            <Icon className="size-4" aria-hidden />
            {locked && (
              <Lock className="absolute right-1.5 top-0 size-3 rounded-full bg-card p-px text-muted-foreground" aria-label="terkunci" />
            )}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
