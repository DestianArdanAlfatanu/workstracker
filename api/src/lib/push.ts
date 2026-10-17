import webpush from 'web-push';

/**
 * Pengirim Web Push (kunci VAPID dari api/.env). Bisa diganti di tes lewat `setPushSender`,
 * mengikuti pola `setAiProvider`.
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  → buat dengan: npm run push:keys -w api
 *   VAPID_SUBJECT                        → mailto:email-admin atau URL situs
 */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSender {
  /** Kirim satu notifikasi. Melempar error dengan `statusCode` bila gagal (404/410 = langganan mati). */
  send(target: PushTarget, payload: PushPayload): Promise<void>;
}

export class PushError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY?.trim() || null;

class WebPushSender implements PushSender {
  constructor() {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@workstracker.local',
      process.env.VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim(),
    );
  }

  async send(target: PushTarget, payload: PushPayload) {
    try {
      await webpush.sendNotification(target, JSON.stringify(payload), { TTL: 12 * 60 * 60, urgency: 'normal' });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 0;
      throw new PushError(err instanceof Error ? err.message : 'Push gagal', status);
    }
  }
}

/** Pengirim palsu untuk tes: menyimpan notifikasi; endpoint berisi "gone" dianggap sudah tidak aktif. */
export class FakePushSender implements PushSender {
  sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  async send(target: PushTarget, payload: PushPayload) {
    if (target.endpoint.includes('gone')) throw new PushError('Gone', 410);
    this.sent.push({ endpoint: target.endpoint, payload });
  }
}

let override: PushSender | null = null;
let cached: PushSender | null = null;

export function setPushSender(sender: PushSender | null) {
  override = sender;
}

/** Null bila kunci VAPID belum diisi (push nonaktif, email tetap jalan). */
export function getPushSender(): PushSender | null {
  if (override) return override;
  if (!vapidPublicKey() || !process.env.VAPID_PRIVATE_KEY?.trim()) return null;
  cached ??= new WebPushSender();
  return cached;
}

export const pushConfigured = () => getPushSender() !== null;
