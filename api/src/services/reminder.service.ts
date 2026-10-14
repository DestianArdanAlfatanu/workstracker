import type { User } from '@prisma/client';
import { APP_TIME_ZONE, FINAL_STATUSES, todayISO } from '@wt/shared';
import { APP_URL, BRAND, button, escapeHtml, paragraph, renderLayout, sectionLabel } from '../lib/email-layout';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';
import { prisma } from '../lib/prisma';
import { fromISODate, toISODate } from '../lib/serialize';

/** Jam pengiriman pengingat harian (WIB). */
export const REMINDER_HOUR = Number(process.env.REMINDER_HOUR ?? 7);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const shortDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

interface DigestItem {
  kind: 'schedule' | 'task';
  title: string;
  detail: string;
  date: string;
  daysLate: number;
}

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000);

/** Jadwal lamaran & tugas yang jatuh hari ini atau sudah terlewat. */
export async function buildDigest(userId: bigint, today = todayISO()) {
  const until = fromISODate(today);
  const [apps, tasks] = await Promise.all([
    prisma.application.findMany({
      where: { userId, deletedAt: null, nextActionDate: { lte: until }, status: { notIn: [...FINAL_STATUSES] } },
      orderBy: { nextActionDate: 'asc' },
      take: 50,
    }),
    prisma.task.findMany({
      where: {
        userId,
        doneAt: null,
        dueDate: { lte: until },
        OR: [{ applicationId: null }, { application: { deletedAt: null } }],
      },
      include: { application: { select: { company: true } } },
      orderBy: { dueDate: 'asc' },
      take: 50,
    }),
  ]);
  const items: DigestItem[] = [
    ...apps.map((a) => {
      const date = toISODate(a.nextActionDate!);
      return {
        kind: 'schedule' as const,
        title: a.company,
        detail: a.nextActionNote ? `${a.nextActionNote} · ${a.position}` : a.position,
        date,
        daysLate: daysBetween(date, today),
      };
    }),
    ...tasks.map((t) => {
      const date = toISODate(t.dueDate!);
      return { kind: 'task' as const, title: t.title, detail: t.application?.company ?? '', date, daysLate: daysBetween(date, today) };
    }),
  ];
  return {
    today,
    dueToday: items.filter((i) => i.daysLate <= 0),
    overdue: items.filter((i) => i.daysLate > 0).sort((a, b) => b.daysLate - a.daysLate),
  };
}

type Digest = Awaited<ReturnType<typeof buildDigest>>;

function greeting(now = new Date()) {
  const h = jakartaHour(now);
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function itemRows(items: DigestItem[]) {
  return items
    .map((i) => {
      const kind = i.kind === 'schedule' ? 'Jadwal lamaran' : 'Tugas';
      const when =
        i.daysLate > 0
          ? `<span style="color:#B91C1C;font-weight:600">Lewat ${i.daysLate} hari</span><br><span style="color:${BRAND.muted}">${shortDate.format(new Date(`${i.date}T00:00:00Z`))}</span>`
          : `<span style="color:${BRAND.navy};font-weight:600">Hari ini</span>`;
      return `<tr><td style="padding:14px 0;border-top:1px solid ${BRAND.border}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" style="font-family:${FONT}">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:2px">${kind}</div>
      <div style="font-size:15px;font-weight:600;color:${BRAND.navy};line-height:1.4">${escapeHtml(i.title)}</div>
      ${i.detail ? `<div style="font-size:14px;color:${BRAND.text};line-height:1.5">${escapeHtml(i.detail)}</div>` : ''}
    </td>
    <td valign="top" align="right" style="padding-left:16px;white-space:nowrap;font-family:${FONT};font-size:13px;line-height:1.5">${when}</td>
  </tr></table>
</td></tr>`;
    })
    .join('');
}

const itemTable = (items: DigestItem[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid ${BRAND.border}">${itemRows(items)}</table>`;

function subjectFor(d: Digest) {
  const today = d.dueToday.length;
  const late = d.overdue.length;
  const day = shortDate.format(new Date(`${d.today}T00:00:00Z`));
  if (today && late) return `Agenda lamaran ${day}: ${today} hari ini, ${late} terlewat`;
  if (today) return `Agenda lamaran Anda hari ini, ${day}`;
  if (late) return `${late} tindak lanjut lamaran sudah lewat tanggalnya`;
  return `Ringkasan WorksTracker ${day}: tidak ada agenda`;
}

export function renderDigestEmail(user: Pick<User, 'name' | 'email'>, digest: Digest, now = new Date()) {
  const total = digest.dueToday.length + digest.overdue.length;
  const first = user.name.split(' ')[0];
  const dateText = longDate.format(new Date(`${digest.today}T00:00:00Z`));
  const subject = subjectFor(digest);
  const listUrl = `${APP_URL}/applications?sort=next_action_date:asc`;

  const all = [...digest.overdue, ...digest.dueToday];
  const preheader =
    total === 0
      ? 'Tidak ada jadwal atau tugas yang jatuh tempo hari ini.'
      : `${all[0].title}${all[0].detail ? ` — ${all[0].detail}` : ''}${total > 1 ? `, dan ${total - 1} agenda lainnya` : ''}.`;

  let body = paragraph(`${greeting(now)}, ${escapeHtml(first)}.`);
  if (total === 0) {
    body += paragraph(`Tidak ada jadwal lamaran atau tugas yang jatuh tempo pada ${dateText}.`);
    body += paragraph('Anda bisa memakai waktu ini untuk mengirim lamaran baru atau menindaklanjuti lamaran yang belum ada kabarnya.');
  } else {
    body += paragraph(`Berikut agenda lamaran kerja Anda untuk ${dateText}.`);
    if (digest.overdue.length) {
      body += sectionLabel(`Terlewat (${digest.overdue.length})`);
      body += itemTable(digest.overdue);
    }
    if (digest.dueToday.length) {
      body += sectionLabel(`Hari ini (${digest.dueToday.length})`);
      body += itemTable(digest.dueToday);
    }
    body += `<div style="height:24px;line-height:24px">&nbsp;</div>`;
    body += paragraph(
      'Setelah ditindaklanjuti, perbarui status atau tanggal tindak lanjutnya di WorksTracker agar pengingat berikutnya tetap akurat.',
    );
  }
  body += button('Buka daftar lamaran', listUrl);
  body += paragraph(
    `<a href="${APP_URL}/tasks" style="color:${BRAND.blue};text-decoration:underline">Lihat semua tugas</a>`,
    'margin:12px 0 0;font-size:14px',
  );

  const { html, attachments } = renderLayout({
    preheader,
    title: total === 0 ? 'Tidak ada agenda hari ini' : 'Agenda lamaran hari ini',
    bodyHtml: body,
    footerNote: `Anda menerima email ini karena pengingat harian aktif di akun WorksTracker (${escapeHtml(user.email)}). <a href="${APP_URL}/settings" style="color:${BRAND.muted};text-decoration:underline">Ubah pengaturan pengingat</a>.`,
  });

  const line = (i: DigestItem) =>
    `- ${i.kind === 'schedule' ? 'Jadwal' : 'Tugas'}: ${i.title}${i.detail ? ` — ${i.detail}` : ''} (${i.daysLate > 0 ? `lewat ${i.daysLate} hari` : 'hari ini'})`;
  const text = [
    `${greeting(now)}, ${first}.`,
    '',
    total === 0 ? `Tidak ada jadwal lamaran atau tugas yang jatuh tempo pada ${dateText}.` : `Agenda lamaran kerja Anda untuk ${dateText}:`,
    ...(digest.overdue.length ? ['', `TERLEWAT (${digest.overdue.length})`, ...digest.overdue.map(line)] : []),
    ...(digest.dueToday.length ? ['', `HARI INI (${digest.dueToday.length})`, ...digest.dueToday.map(line)] : []),
    '',
    `Buka daftar lamaran: ${listUrl}`,
    '',
    '—',
    'WorksTracker · Catat lamaran, pantau tiap tahapnya.',
    `Ubah pengaturan pengingat: ${APP_URL}/settings`,
  ].join('\n');

  return { subject, html, text, attachments, total };
}

export async function sendDigest(user: Pick<User, 'id' | 'name' | 'email'>, { force = false } = {}) {
  const digest = await buildDigest(user.id);
  const mail = renderDigestEmail(user, digest);
  if (mail.total === 0 && !force) return { sent: false, preview: null, total: 0 };
  const { preview } = await sendMail({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: mail.attachments,
  });
  return { sent: true, preview, total: mail.total };
}

/**
 * Alamat yang pasti tidak bisa menerima email (domain contoh/uji/lokal). Mengirim ke sana
 * menghasilkan bounce yang bisa membuat akun Gmail pengirim ditandai spam.
 */
const UNDELIVERABLE = /@(.+\.)?(local|localhost|test|invalid|example|example\.(com|org|net)|contoh\.id)$/i;
export const isDeliverable = (email: string) => !UNDELIVERABLE.test(email.trim());

const jakartaHour = (now: Date) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: APP_TIME_ZONE }).format(now));

/**
 * Kirim pengingat harian ke semua pengguna yang mengaktifkannya, sekali per hari
 * setelah jam REMINDER_HOUR WIB. Aman dipanggil berulang (dicatat di last_reminder_on).
 */
export async function runDailyReminders(now = new Date()) {
  if (jakartaHour(now) < REMINDER_HOUR) return 0;
  const today = todayISO(now);
  const users = await prisma.user.findMany({
    where: {
      emailReminders: true,
      status: 'active',
      isDemo: false,
      OR: [{ lastReminderOn: null }, { lastReminderOn: { lt: fromISODate(today) } }],
    },
    select: { id: true, name: true, email: true },
    take: 500,
  });
  let sent = 0;
  for (const user of users) {
    if (!isDeliverable(user.email)) {
      await prisma.user.update({ where: { id: user.id }, data: { lastReminderOn: fromISODate(today) } });
      continue;
    }
    try {
      const result = await sendDigest(user);
      if (result.sent) sent += 1;
      await prisma.user.update({ where: { id: user.id }, data: { lastReminderOn: fromISODate(today) } });
    } catch (err) {
      logger.error({ err, userId: user.id.toString() }, 'Gagal mengirim pengingat email');
    }
  }
  return sent;
}
