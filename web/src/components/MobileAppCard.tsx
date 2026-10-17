import { BellRing, Download, Share2, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { currentPushSubscription, pushSupported, subscribePush, useInstall } from '@/lib/pwa';
import { useDeletePushSubscription, usePushInfo, useSavePushSubscription, useTestPush } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { errorMessage } from './application-ui';
import { PlanBadge, usePlan, useUpgradePrompt } from './plan';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';

const DISMISS_KEY = 'wt-install-dismissed';
const DISMISS_DAYS = 30;

const dismissedRecently = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
};

/** Ajakan pasang di dashboard (HP saja, bisa ditutup selama 30 hari). */
export function InstallBanner() {
  const install = useInstall();
  const [hidden, setHidden] = useState(dismissedRecently);
  const mobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;
  if (hidden || install.installed || !mobile || !(install.canPrompt || install.ios)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* abaikan */
    }
    setHidden(true);
  };

  return (
    <div role="region" aria-label="Pasang aplikasi" className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
      <img src="/icon-192.png" alt="" className="size-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Pasang WorksTracker di HP</p>
        <p className="text-xs text-muted-foreground">
          {install.ios ? 'Tekan Bagikan di Safari, lalu Tambah ke Layar Utama.' : 'Buka lebih cepat dan simpan loker lewat menu Bagikan.'}
        </p>
      </div>
      {install.canPrompt && (
        <Button size="sm" onClick={() => void install.install().then((ok) => ok && toast.success('WorksTracker dipasang'))}>
          Pasang
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Tutup ajakan pasang aplikasi">
        Nanti
      </Button>
    </div>
  );
}

/** Pengaturan "Aplikasi di HP": pasang PWA, Share Target, dan notifikasi push di perangkat ini. */
export function MobileAppCard() {
  const install = useInstall();
  const { has } = usePlan();
  const [upgradeDialog, promptUpgrade] = useUpgradePrompt();

  const onInstall = async () => {
    if (await install.install()) toast.success('WorksTracker dipasang di perangkat ini');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-5 text-primary" aria-hidden />
          Aplikasi di HP
        </CardTitle>
        <CardDescription>Pasang WorksTracker di layar utama agar bisa dibuka seperti aplikasi dan menerima loker yang dibagikan.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {upgradeDialog}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Pasang aplikasi</p>
          {install.installed ? (
            <p className="text-sm text-muted-foreground">Anda sedang membuka WorksTracker sebagai aplikasi.</p>
          ) : install.canPrompt ? (
            <Button className="self-start" onClick={() => void onInstall()}>
              <Download />
              Pasang di perangkat ini
            </Button>
          ) : install.ios ? (
            <p className="text-sm text-muted-foreground">
              Di Safari, tekan tombol Bagikan lalu pilih <strong className="text-foreground">Tambah ke Layar Utama</strong>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Buka menu browser (titik tiga) lalu pilih <strong className="text-foreground">Instal aplikasi</strong> atau{' '}
              <strong className="text-foreground">Tambahkan ke layar utama</strong>.
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 border-t pt-5">
          <Share2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="text-sm">
            <p className="flex items-center gap-2 font-medium">
              Simpan loker dari aplikasi lain
              {!has('mobile_share') && <PlanBadge plan="standard" />}
            </p>
            <p className="mt-1 text-muted-foreground">
              Setelah terpasang (Android), tekan <strong className="text-foreground">Bagikan</strong> di LinkedIn, Instagram,
              Jobstreet, atau browser, lalu pilih WorksTracker. Link, teks, atau screenshot poster langsung menjadi lamaran baru.
            </p>
            {!has('mobile_share') && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => promptUpgrade('mobile_share')}>
                Lihat paket Standar
              </Button>
            )}
          </div>
        </div>

        <PushSetting onLocked={() => promptUpgrade('reminders')} />
      </CardContent>
    </Card>
  );
}

function PushSetting({ onLocked }: { onLocked: () => void }) {
  const { state } = useAuth();
  const { has } = usePlan();
  const allowed = has('reminders') && !state.user?.isDemo;
  const info = usePushInfo(allowed);
  const save = useSavePushSubscription();
  const remove = useDeletePushSubscription();
  const test = useTestPush();
  const supported = pushSupported();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const blocked = supported && Notification.permission === 'denied';

  useEffect(() => {
    if (!supported) return setSubscribed(false);
    void currentPushSubscription().then((s) => setSubscribed(!!s));
  }, [supported]);

  const toggle = async () => {
    if (!allowed) return onLocked();
    setBusy(true);
    try {
      if (subscribed) {
        const sub = await currentPushSubscription();
        if (sub) {
          await remove.mutateAsync(sub.endpoint);
          await sub.unsubscribe();
        }
        setSubscribed(false);
        toast.success('Notifikasi di perangkat ini dimatikan');
      } else {
        if (!info.data?.publicKey) throw new Error('Notifikasi belum diaktifkan oleh admin.');
        const sub = await subscribePush(info.data.publicKey);
        if (!sub) {
          toast.error('Izin notifikasi ditolak. Aktifkan izin notifikasi untuk WorksTracker di pengaturan browser.');
          return;
        }
        await save.mutateAsync(sub.toJSON());
        setSubscribed(true);
        toast.success('Notifikasi aktif di perangkat ini');
      }
    } catch (e) {
      toast.error(e instanceof Error && !('status' in e) ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: () => toast.success('Notifikasi uji dikirim. Cek bilah notifikasi perangkat Anda.'),
      onError: (e) => toast.error(errorMessage(e)),
    });

  const unavailable = !supported
    ? 'Browser ini belum mendukung notifikasi. Di iPhone, pasang dulu WorksTracker ke Layar Utama (iOS 16.4 ke atas).'
    : blocked
      ? 'Izin notifikasi untuk situs ini diblokir. Buka pengaturan situs di browser lalu izinkan notifikasi.'
      : allowed && info.data && !info.data.configured
        ? 'Notifikasi push belum diaktifkan oleh admin.'
        : state.user?.isDemo
          ? 'Notifikasi tidak tersedia di mode demo.'
          : null;
  const on = !!subscribed && allowed;

  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="push-reminders" className="flex items-center gap-2">
            <BellRing className="size-4 text-primary" aria-hidden />
            Notifikasi di perangkat ini
            {!has('reminders') && <PlanBadge plan="standard" />}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Setiap pagi (±07.00 WIB) muncul notifikasi jadwal interview, follow-up, dan tugas yang jatuh tempo. Melengkapi
            pengingat email.
          </p>
          {unavailable && <p className="mt-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">{unavailable}</p>}
        </div>
        <button
          id="push-reminders"
          type="button"
          role="switch"
          aria-checked={on}
          disabled={busy || subscribed === null || (!!unavailable && has('reminders'))}
          onClick={() => void toggle()}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60',
            on ? 'bg-primary' : 'bg-[#cbd5e1]',
          )}
        >
          <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
          <span className="sr-only">{on ? 'Aktif' : 'Nonaktif'}</span>
        </button>
      </div>
      {on && (
        <Button variant="outline" size="sm" className="self-start" loading={test.isPending} onClick={sendTest}>
          Kirim notifikasi uji
        </Button>
      )}
    </div>
  );
}
