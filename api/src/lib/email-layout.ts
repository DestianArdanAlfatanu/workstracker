import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Kerangka email WorksTracker: layout tabel 600px dengan gaya inline (aman untuk Gmail,
 * Outlook, Apple Mail). Logo dilampirkan sebagai gambar inline (CID) sehingga tampil
 * tanpa perlu hosting.
 */

export const BRAND = {
  blue: '#1D4ED8',
  navy: '#0F172A',
  text: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  canvas: '#F1F5F9',
  header: '#F8FAFC',
};

export const APP_URL = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const LOGO_CID = 'logo@workstracker';
// PNG hasil render dari assets/workstracker-logo.svg (klien email tidak mendukung SVG).
const LOGO_PATH = path.resolve(process.env.EMAIL_ASSETS_DIR ?? 'assets/email', 'logo.png');

export interface EmailAttachment {
  filename: string;
  path: string;
  cid: string;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Tombol "bulletproof" (tetap berbentuk tombol di Outlook). */
export function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
  <tr><td bgcolor="${BRAND.blue}" style="border-radius:8px">
    <a href="${href}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

export const paragraph = (html: string, style = '') =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.text};${style}">${html}</p>`;

export const sectionLabel = (text: string) =>
  `<p style="margin:24px 0 8px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted}">${escapeHtml(text)}</p>`;

interface LayoutInput {
  /** Teks pratinjau di daftar inbox (tidak terlihat di badan email). */
  preheader: string;
  title: string;
  bodyHtml: string;
  /** Catatan kecil di footer, mis. alasan menerima email. */
  footerNote: string;
}

export function renderLayout({ preheader, title, bodyHtml, footerNote }: LayoutInput) {
  const hasLogo = existsSync(LOGO_PATH);
  const logo = hasLogo
    ? `<img src="cid:${LOGO_CID}" width="200" height="37" alt="WorksTracker" style="display:block;border:0;outline:none;width:200px;height:auto">`
    : `<span style="font-family:${FONT};font-size:22px;font-weight:700;color:${BRAND.navy}">WorksTracker</span>`;

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.canvas}">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden">
      <tr><td bgcolor="${BRAND.header}" style="padding:22px 32px;border-bottom:1px solid ${BRAND.border}">${logo}</td></tr>
      <tr><td style="padding:32px 32px 28px">
        <h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:1.35;font-weight:700;color:${BRAND.navy}">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border}">
        <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted}">${footerNote}</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted}">WorksTracker · Catat lamaran, pantau tiap tahapnya.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const attachments: EmailAttachment[] = hasLogo ? [{ filename: 'workstracker.png', path: LOGO_PATH, cid: LOGO_CID }] : [];
  return { html, attachments };
}
