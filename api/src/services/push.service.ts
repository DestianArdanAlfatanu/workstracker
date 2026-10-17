import { todayISO } from '@wt/shared';
import { createHash } from 'node:crypto';
import { AppError } from '../lib/http';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getPushSender, PushError, type PushPayload } from '../lib/push';
import { fromISODate } from '../lib/serialize';
import { buildDigest, REMINDER_HOUR } from './reminder.service';

const hash = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Simpan langganan perangkat ini. Endpoint yang sama dipindah ke akun yang sedang login. */
export async function subscribe(userId: bigint, input: SubscriptionInput, userAgent?: string) {
  const endpointHash = hash(input.endpoint);
  const data = {
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 255) ?? null,
  };
  await prisma.pushSubscription.upsert({ where: { endpointHash }, create: { ...data, endpointHash }, update: data });
  return prisma.pushSubscription.count({ where: { userId } });
}

export async function unsubscribe(userId: bigint, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpointHash: hash(endpoint) } });
}

export const countDevices = (userId: bigint) => prisma.pushSubscription.count({ where: { userId } });

/** Kirim ke semua perangkat pengguna. Langganan yang sudah tidak aktif (404/410) dihapus. */
export async function sendToUser(userId: bigint, payload: PushPayload) {
  const sender = getPushSender();
  if (!sender) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  for (const s of subs) {
    try {
      await sender.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      delivered++;
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSentAt: new Date() } });
    } catch (err) {
      if (err instanceof PushError && (err.statusCode === 404 || err.statusCode === 410)) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      } else logger.warn({ err: err instanceof Error ? err.message : err, userId: userId.toString() }, 'Push gagal dikirim');
    }
  }
  return delivered;
}

export async function sendTest(userId: bigint) {
  if (!getPushSender()) throw new AppError('SERVICE_UNAVAILABLE', 'Notifikasi push belum diaktifkan oleh admin.');
  const delivered = await sendToUser(userId, {
    title: 'Notifikasi WorksTracker aktif',
    body: 'Pengingat jadwal dan tugas akan muncul di perangkat ini setiap pagi.',
    url: '/',
    tag: 'wt-test',
  });
  if (!delivered) throw new AppError('VALIDATION_ERROR', 'Perangkat ini belum berlangganan notifikasi. Aktifkan dulu di Pengaturan.');
  return delivered;
}

/** Ringkasan pendek untuk notifikasi (judul + isi satu-dua baris). */
export function digestNotification(d: Awaited<ReturnType<typeof buildDigest>>): PushPayload | null {
  // Agenda hari ini lebih penting di notifikasi, baru yang terlewat.
  const all = [...d.dueToday, ...d.overdue];
  if (!all.length) return null;
  const today = d.dueToday.length;
  const late = d.overdue.length;
  const title = today && late ? `${today} agenda hari ini, ${late} terlewat` : today ? `${today} agenda lamaran hari ini` : `${late} tindak lanjut terlewat`;
  const first = all[0]!;
  const body = `${first.title}${first.detail ? `: ${first.detail}` : ''}${all.length > 1 ? `, dan ${all.length - 1} lainnya` : ''}`;
  return { title, body, url: d.dueToday.some((i) => i.kind === 'task') && !d.dueToday.some((i) => i.kind === 'schedule') ? '/tasks' : '/', tag: 'wt-daily' };
}

const jakartaHour = (now: Date) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(now));

/**
 * Pengingat harian lewat push: sekali per hari setelah REMINDER_HOUR WIB, untuk pengguna
 * Standar ke atas yang punya perangkat berlangganan. Tercatat terpisah dari email (last_push_on).
 */
export async function runDailyPush(now = new Date()) {
  if (!getPushSender() || jakartaHour(now) < REMINDER_HOUR) return 0;
  const today = todayISO(now);
  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      isDemo: false,
      pushSubscriptions: { some: {} },
      AND: [
        { OR: [{ plan: { in: ['standard', 'premium'] } }, { role: 'admin' }] },
        { OR: [{ lastPushOn: null }, { lastPushOn: { lt: fromISODate(today) } }] },
      ],
    },
    select: { id: true },
    take: 500,
  });
  let sent = 0;
  for (const user of users) {
    try {
      const payload = digestNotification(await buildDigest(user.id, today));
      if (payload && (await sendToUser(user.id, payload))) sent++;
      await prisma.user.update({ where: { id: user.id }, data: { lastPushOn: fromISODate(today) } });
    } catch (err) {
      logger.error({ err, userId: user.id.toString() }, 'Gagal mengirim pengingat push');
    }
  }
  return sent;
}
