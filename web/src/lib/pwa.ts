import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** Cache sementara gambar yang dibagikan ke aplikasi (diisi service worker, lihat src/sw.ts). */
export const SHARE_CACHE = 'wt-share';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Daftarkan service worker sekali saat aplikasi dimuat. */
export function setupPwa() {
  if (!('serviceWorker' in navigator)) return;
  registerSW({ immediate: true });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    emit();
  });
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Status pemasangan: `canPrompt` (Chrome/Edge Android & desktop menyediakan dialog pasang),
 * `ios` (perlu petunjuk manual), `installed` (sudah dibuka sebagai aplikasi).
 */
export function useInstall() {
  const canPrompt = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => installEvent !== null,
  );
  return {
    canPrompt,
    ios: isIos(),
    installed: isStandalone(),
    install: async () => {
      if (!installEvent) return false;
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      installEvent = null;
      emit();
      return outcome === 'accepted';
    },
  };
}

/* --------------------------- Push notification --------------------------- */

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function base64UrlToBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Minta izin & berlangganan push di perangkat ini. Null bila izin ditolak. */
export async function subscribePush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
}
