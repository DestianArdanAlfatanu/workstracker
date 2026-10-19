import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Query } from '@tanstack/react-query';
import type { User } from '@wt/shared';

/**
 * Mode offline dasar (baca saja): data terakhir disimpan di perangkat ini sehingga daftar
 * lamaran, dashboard, dan tugas tetap bisa dibuka tanpa internet. Dihapus saat keluar.
 */
const CACHE_KEY = 'wt-query-cache-v1';
const USER_KEY = 'wt-last-user-v1';
export const OFFLINE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Hanya data pribadi yang perlu dibaca offline; admin, AI, dll. tidak disimpan. */
const PERSISTED_ROOTS = new Set(['applications', 'stats', 'tasks', 'calendar', 'cvs', 'insights']);

const storage = (() => {
  try {
    const s = window.localStorage;
    s.setItem('wt-probe', '1');
    s.removeItem('wt-probe');
    return s;
  } catch {
    return undefined; // mode privat / penyimpanan diblokir: offline tidak tersedia
  }
})();

export const queryPersister = createSyncStoragePersister({ storage, key: CACHE_KEY, throttleTime: 1500 });

export const shouldPersistQuery = (q: Query) =>
  q.state.status === 'success' && PERSISTED_ROOTS.has(String(q.queryKey[0])) && q.queryKey[1] !== 'lookup';

export function rememberUser(user: User) {
  try {
    storage?.setItem(USER_KEY, JSON.stringify({ user, savedAt: Date.now() }));
  } catch {
    /* penuh / diblokir */
  }
}

export function lastUser(): User | null {
  try {
    const raw = storage?.getItem(USER_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { user?: User; savedAt?: number };
    // Data lama tanpa waktu simpan, atau lebih tua dari batas offline: jangan dipakai lagi di perangkat ini.
    if (!saved.user || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > OFFLINE_MAX_AGE) {
      forgetOfflineData();
      return null;
    }
    return saved.user;
  } catch {
    return null;
  }
}

/** Hapus semua data offline (dipanggil saat keluar atau sesi berakhir). */
export function forgetOfflineData() {
  try {
    storage?.removeItem(USER_KEY);
    storage?.removeItem(CACHE_KEY);
  } catch {
    /* abaikan */
  }
}
