/// <reference lib="webworker" />
/**
 * Service worker WorksTracker:
 *  - Menyimpan app shell agar aplikasi tetap terbuka saat offline (data dari cache React Query).
 *  - Share Target: menerima loker yang dibagikan dari aplikasi lain (Android) lalu membuka /bagikan.
 *  - Push notification pengingat jadwal & tugas.
 * Request /api tidak pernah di-cache di sini.
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

/** Cache sementara untuk gambar yang dibagikan (dibaca halaman /bagikan lalu dihapus). */
export const SHARE_CACHE = 'wt-share';

// Harus terdaftar sebelum router Workbox agar POST Share Target ditangani di sini.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(event.request));
  }
});

async function receiveShare(request: Request) {
  const params = new URLSearchParams();
  try {
    const form = await request.formData();
    for (const key of ['title', 'text', 'url'] as const) {
      const v = form.get(key);
      if (typeof v === 'string' && v.trim()) params.set(key, v.trim().slice(0, 5000));
    }
    const files = form.getAll('images').filter((f): f is File => f instanceof File && f.type.startsWith('image/')).slice(0, 4);
    await caches.delete(SHARE_CACHE);
    if (files.length) {
      const cache = await caches.open(SHARE_CACHE);
      await Promise.all(
        files.map((f, i) =>
          cache.put(`/shared/${i}`, new Response(f, { headers: { 'Content-Type': f.type, 'X-File-Name': encodeURIComponent(f.name || `poster-${i + 1}`) } })),
        ),
      );
      params.set('img', String(files.length));
    }
  } catch {
    params.set('error', '1');
  }
  return Response.redirect(`/bagikan?${params.toString()}`, 303);
}

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'WorksTracker', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: data.tag ?? 'wt-reminder',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | null)?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        await existing.navigate(target).catch(() => undefined);
      } else await self.clients.openWindow(target);
    })(),
  );
});

// Versi baru langsung aktif (registerType autoUpdate).
self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
cleanupOutdatedCaches();
clientsClaim();
// Navigasi offline → app shell (hanya di build produksi; saat dev manifest kosong).
if (manifest.some((e) => /^\/?index\.html$/.test(typeof e === 'string' ? e : e.url))) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//, /^\/share-target/] }));
}
