import type { User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { APP_URL, BRAND, button, escapeHtml, paragraph, renderLayout } from '../lib/email-layout';
import { AppError } from '../lib/http';
import { hashToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';
import { hashPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { revokeAllSessions } from './auth.service';
import { isDeliverable } from './reminder.service';

export const RESET_TTL_MINUTES = 30;
const MAX_REQUESTS_PER_HOUR = 3;

const invalidLink = () =>
  new AppError('VALIDATION_ERROR', 'Link reset tidak valid atau sudah kedaluwarsa. Silakan minta link baru.', {
    token: 'Link reset tidak valid atau sudah kedaluwarsa',
  });

const dateTime = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

/* ------------------------------- Email ------------------------------- */

function resetEmail(user: Pick<User, 'name' | 'email'>, link: string) {
  const first = escapeHtml(user.name.split(' ')[0]);
  const { html, attachments } = renderLayout({
    preheader: `Link untuk mengatur ulang password akun WorksTracker Anda. Berlaku ${RESET_TTL_MINUTES} menit.`,
    title: 'Atur ulang password',
    bodyHtml:
      paragraph(`Halo ${first},`) +
      paragraph(
        `Kami menerima permintaan untuk mengatur ulang password akun WorksTracker yang terdaftar dengan email <strong>${escapeHtml(user.email)}</strong>.`,
      ) +
      paragraph('Klik tombol di bawah ini untuk membuat password baru.') +
      button('Atur ulang password', link) +
      paragraph(
        `Link ini berlaku selama ${RESET_TTL_MINUTES} menit dan hanya dapat digunakan satu kali.`,
        'margin-top:16px;font-size:14px',
      ) +
      paragraph(
        'Jika Anda tidak meminta pengaturan ulang password, abaikan email ini. Password Anda tidak akan berubah.',
        'font-size:14px',
      ) +
      paragraph(
        `Jika tombol tidak berfungsi, salin link berikut ke browser Anda:<br><a href="${link}" style="color:${BRAND.blue};word-break:break-all">${escapeHtml(link)}</a>`,
        `font-size:13px;color:${BRAND.muted}`,
      ),
    footerNote: 'Email ini dikirim karena ada permintaan atur ulang password untuk akun Anda.',
  });
  const text = [
    `Halo ${user.name.split(' ')[0]},`,
    '',
    `Kami menerima permintaan untuk mengatur ulang password akun WorksTracker (${user.email}).`,
    'Buka link berikut untuk membuat password baru:',
    link,
    '',
    `Link ini berlaku ${RESET_TTL_MINUTES} menit dan hanya dapat digunakan satu kali.`,
    'Jika Anda tidak meminta ini, abaikan email ini. Password Anda tidak akan berubah.',
    '',
    '--',
    'WorksTracker · Catat lamaran, pantau tiap tahapnya.',
  ].join('\n');
  return { subject: 'Atur ulang password WorksTracker', html, text, attachments };
}

function changedEmail(user: Pick<User, 'name' | 'email'>, at: Date) {
  const first = escapeHtml(user.name.split(' ')[0]);
  const when = dateTime.format(at);
  const { html, attachments } = renderLayout({
    preheader: 'Password akun WorksTracker Anda baru saja diubah.',
    title: 'Password Anda telah diubah',
    bodyHtml:
      paragraph(`Halo ${first},`) +
      paragraph(`Password akun WorksTracker Anda (<strong>${escapeHtml(user.email)}</strong>) berhasil diubah pada ${when} WIB.`) +
      paragraph('Demi keamanan, semua sesi login di perangkat lain telah dikeluarkan.') +
      paragraph(
        'Jika Anda tidak melakukan perubahan ini, segera hubungi admin WorksTracker agar akun Anda dapat diamankan.',
        'font-size:14px',
      ) +
      button('Masuk ke WorksTracker', `${APP_URL}/login`),
    footerNote: 'Email pemberitahuan keamanan ini dikirim setiap kali password akun Anda diubah.',
  });
  const text = [
    `Halo ${user.name.split(' ')[0]},`,
    '',
    `Password akun WorksTracker Anda (${user.email}) berhasil diubah pada ${when} WIB.`,
    'Semua sesi login di perangkat lain telah dikeluarkan.',
    'Jika Anda tidak melakukan perubahan ini, segera hubungi admin WorksTracker.',
    '',
    `${APP_URL}/login`,
  ].join('\n');
  return { subject: 'Password WorksTracker Anda telah diubah', html, text, attachments };
}

/* ------------------------------ Alur reset ------------------------------ */

/** Buat token sekali pakai (hanya token terbaru yang berlaku) dan kembalikan link halaman reset. */
async function issueToken(userId: bigint, ttlMs: number, ip?: string, query = '') {
  const token = randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs), requestedIp: ip?.slice(0, 45) ?? null },
    }),
  ]);
  return `${APP_URL}/reset-password?token=${encodeURIComponent(token)}${query}`;
}

/** Masa berlaku link "buat password" untuk akun yang dibeli otomatis. */
export const SETUP_TTL_HOURS = 72;

/** Link membuat password pertama untuk akun baru hasil pembayaran otomatis. */
export const createSetupLink = (userId: bigint) => issueToken(userId, SETUP_TTL_HOURS * 3_600_000, undefined, '&baru=1');

/**
 * Minta link reset. Respons ke klien selalu sama (tidak membocorkan apakah email terdaftar);
 * keputusan kirim/tidak hanya tercatat di log server.
 */
export async function requestReset(email: string, ip: string | undefined) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.isDemo || user.status !== 'active' || !isDeliverable(user.email)) {
    logger.info({ reason: !user ? 'unknown' : 'not-eligible' }, 'Permintaan reset password diabaikan');
    return;
  }

  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) {
    logger.warn({ userId: user.id.toString() }, 'Batas permintaan reset password per jam tercapai');
    return;
  }

  const link = await issueToken(user.id, RESET_TTL_MINUTES * 60_000, ip);
  try {
    await sendMail({ to: user.email, ...resetEmail(user, link) });
  } catch (err) {
    logger.error({ err, userId: user.id.toString() }, 'Gagal mengirim email reset password');
  }
}

async function findValid(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  if (record.user.status !== 'active' || record.user.isDemo) return null;
  return record;
}

export async function checkToken(token: string) {
  return (await findValid(token)) !== null;
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await findValid(token);
  if (!record) throw invalidLink();

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Tandai terpakai lebih dulu; jika sudah dipakai permintaan lain, batalkan.
    const used = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (used.count === 0) throw invalidLink();
    await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, mustChangePassword: false } });
    await revokeAllSessions(record.userId, tx);
  });

  try {
    await sendMail({ to: record.user.email, ...changedEmail(record.user, now) });
  } catch (err) {
    logger.error({ err, userId: record.userId.toString() }, 'Gagal mengirim email konfirmasi perubahan password');
  }
}
