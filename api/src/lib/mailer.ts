import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailAttachment } from './email-layout';
import { logger } from './logger';

/**
 * Pengirim email via SMTP (Gmail, Brevo, Mailgun, dll). Isi variabel SMTP_* di api/.env.
 * Selama SMTP_HOST kosong, email tidak dikirim: isinya disimpan sebagai file HTML di
 * storage/mail-preview agar tetap bisa dicek saat development.
 */
const smtpHost = process.env.SMTP_HOST?.trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER?.trim();
export const MAIL_PREVIEW_DIR = path.resolve(process.env.MAIL_PREVIEW_DIR ?? 'storage/mail-preview');
const smtpPass = process.env.SMTP_PASS?.replace(/\s+/g, '');
/**
 * Preview selama SMTP belum lengkap (host kosong, atau user ada tapi password belum diisi).
 * MAIL_PREVIEW=1 memaksa mode preview (dipakai tes E2E agar tidak mengirim email sungguhan).
 */
export const mailPreviewMode = process.env.MAIL_PREVIEW === '1' || !smtpHost || (!!smtpUser && !smtpPass);
/** Gmail mewajibkan alamat pengirim sama dengan akun SMTP; default ke SMTP_USER. */
export const MAIL_FROM =
  process.env.MAIL_FROM?.trim() || (smtpUser ? `WorksTracker <${smtpUser}>` : 'WorksTracker <no-reply@workstracker.local>');

export function mailStatus() {
  return {
    configured: !mailPreviewMode,
    host: smtpHost ?? null,
    port: smtpPort,
    from: MAIL_FROM,
    missingPassword: !!smtpHost && !!smtpUser && !smtpPass,
  };
}

let transporter: Transporter | null = null;
function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    // Port 465 = SSL langsung; 587 = STARTTLS (otomatis).
    secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
    // App Password Gmail sering disalin dengan spasi ("abcd efgh ..."); spasi dibuang.
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
  });
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Gambar inline (mis. logo) yang dirujuk lewat cid: di HTML. */
  attachments?: EmailAttachment[];
}

/** Untuk file preview: ganti cid: dengan data URI agar logo tetap tampil saat dibuka di browser. */
async function inlineForPreview(html: string, attachments: EmailAttachment[] = []) {
  let out = html;
  for (const a of attachments) {
    const data = (await readFile(a.path)).toString('base64');
    out = out.split(`cid:${a.cid}`).join(`data:image/png;base64,${data}`);
  }
  return out;
}

export async function sendMail(mail: Mail): Promise<{ preview: string | null }> {
  if (mailPreviewMode) {
    await mkdir(MAIL_PREVIEW_DIR, { recursive: true });
    const file = path.join(
      MAIL_PREVIEW_DIR,
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${mail.to.replace(/[^a-z0-9@._-]/gi, '_')}.html`,
    );
    const html = await inlineForPreview(mail.html, mail.attachments);
    await writeFile(file, `<!-- To: ${mail.to} | Subject: ${mail.subject} -->\n${html}`, 'utf8');
    logger.info({ to: mail.to, subject: mail.subject, file }, 'SMTP belum diatur, email disimpan sebagai preview');
    return { preview: file };
  }
  const info = await getTransporter().sendMail({ from: MAIL_FROM, ...mail });
  // Catat hasil dari server SMTP (bukan isi email) untuk melacak email yang tidak sampai.
  logger.info(
    { to: mail.to, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response },
    'Email terkirim ke server SMTP',
  );
  return { preview: null };
}

/** Pesan ramah untuk error SMTP yang umum. */
export function describeMailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e?.code === 'EAUTH' || e?.responseCode === 535) {
    return 'Login SMTP gagal. Periksa SMTP_USER dan SMTP_PASS (untuk Gmail pakai App Password, bukan password biasa).';
  }
  if (e?.code === 'ESOCKET' || e?.code === 'ECONNECTION' || e?.code === 'ETIMEDOUT' || e?.code === 'EDNS') {
    return 'Tidak dapat terhubung ke server SMTP. Periksa SMTP_HOST, SMTP_PORT, dan koneksi internet.';
  }
  return `Gagal mengirim email: ${e?.message ?? 'kesalahan tidak diketahui'}`;
}
