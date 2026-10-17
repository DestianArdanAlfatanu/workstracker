/**
 * Pindahkan lampiran lama (tabel legacy_attachments) ke "CV Saya".
 *   npm run migrate:cv -w api  (scripts/migrate-attachments-to-cv.ts)
 * - Per pengguna, file dengan isi identik (hash SHA-256) digabung menjadi SATU CV (file tidak disalin;
 *   salinan duplikat dihapus dari disk).
 * - Maks. 5 CV aktif (yang terbaru; terbaru = CV utama), sisanya diarsipkan.
 * - Lamaran yang punya lampiran dihubungkan ke CV-nya (bila belum punya CV).
 * - Lampiran gambar (PNG/JPG) ikut menjadi dokumen arsip agar filenya tidak hilang.
 * Aman dijalankan ulang: CV dengan hash yang sama dipakai ulang, lamaran yang sudah punya CV dilewati.
 */
import { CV_MAX_ACTIVE } from '@wt/shared';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extractCvText } from '../lib/cv-text';
import { prisma } from '../lib/prisma';
import { removeStoredFiles, storedPath } from '../lib/storage';

interface LegacyRow {
  id: bigint;
  user_id: bigint;
  application_id: bigint;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size: number;
  created_at: Date;
}

const DOC_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

async function legacyTable() {
  const rows = await prisma.$queryRaw<Array<{ t: string }>>`
    SELECT TABLE_NAME AS t FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('legacy_attachments', 'attachments')`;
  const names = rows.map((r) => r.t);
  return names.includes('legacy_attachments') ? 'legacy_attachments' : names.includes('attachments') ? 'attachments' : null;
}

const labelOf = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 100) || 'CV';

export async function migrateLegacyAttachments() {
  const table = await legacyTable();
  if (!table) {
    return null;
  }
  const rows = await prisma.$queryRawUnsafe<LegacyRow[]>(
    `SELECT id, user_id, application_id, original_name, stored_name, mime_type, size, created_at FROM \`${table}\` ORDER BY created_at DESC, id DESC`,
  );
  const byUser = new Map<bigint, LegacyRow[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  let created = 0;
  let linked = 0;
  let removedDuplicates = 0;
  for (const [userId, list] of byUser) {
    // hash → CV (dipakai ulang), urut dari lampiran terbaru
    const cvByHash = new Map<string, bigint>();
    /** stored_name lampiran lama → CV tujuannya (termasuk salinan duplikat). */
    const cvOfStored = new Map<string, bigint>();
    const duplicates: Array<{ userId: bigint; storedName: string }> = [];
    let active = await prisma.cvDocument.count({ where: { userId, archivedAt: null } });

    for (const r of list) {
      const file = storedPath(userId, r.stored_name);
      if (!existsSync(file)) continue;
      const buffer = await readFile(file);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const known = cvByHash.get(sha256);
      if (known) {
        cvOfStored.set(r.stored_name, known);
        // Salinan identik: pakai CV yang sama; file duplikat dihapus kecuali dipakai CV lain.
        const usedByCv = await prisma.cvDocument.count({ where: { storedName: r.stored_name } });
        if (!usedByCv) duplicates.push({ userId, storedName: r.stored_name });
        continue;
      }
      const existing = await prisma.cvDocument.findFirst({ where: { userId, sha256 } });
      if (existing) {
        cvByHash.set(sha256, existing.id);
        cvOfStored.set(r.stored_name, existing.id);
        continue;
      }
      const isDoc = DOC_TYPES.has(r.mime_type);
      const makeActive = isDoc && active < CV_MAX_ACTIVE;
      const { text, pageCount } = isDoc ? await extractCvText(buffer, r.mime_type) : { text: null, pageCount: null };
      const cv = await prisma.cvDocument.create({
        data: {
          userId,
          label: labelOf(r.original_name),
          originalName: r.original_name,
          storedName: r.stored_name,
          mimeType: r.mime_type,
          size: Number(r.size),
          sha256,
          textContent: text,
          pageCount,
          archivedAt: makeActive ? null : new Date(),
          createdAt: r.created_at,
        },
      });
      if (makeActive) active++;
      cvByHash.set(sha256, cv.id);
      cvOfStored.set(r.stored_name, cv.id);
      created++;
    }

    // Hubungkan lamaran ke CV (utamakan dokumen PDF/Word terbaru di lamaran itu).
    const appIds = [...new Set(list.map((r) => r.application_id))];
    for (const appId of appIds) {
      const app = await prisma.application.findUnique({ where: { id: appId }, select: { cvId: true } });
      if (!app || app.cvId) continue;
      const mine = list.filter((r) => r.application_id === appId).sort((a, b) => Number(DOC_TYPES.has(b.mime_type)) - Number(DOC_TYPES.has(a.mime_type)));
      const target = mine.map((r) => cvOfStored.get(r.stored_name)).find((id): id is bigint => id != null);
      if (target) {
        await prisma.application.update({ where: { id: appId }, data: { cvId: target } });
        linked++;
      }
    }

    // CV utama: yang aktif & terbaru bila belum ada.
    const hasDefault = await prisma.cvDocument.count({ where: { userId, archivedAt: null, isDefault: true } });
    if (!hasDefault) {
      const latest = await prisma.cvDocument.findFirst({ where: { userId, archivedAt: null }, orderBy: { createdAt: 'desc' } });
      if (latest) await prisma.cvDocument.update({ where: { id: latest.id }, data: { isDefault: true } });
    }

    await removeStoredFiles(duplicates);
    removedDuplicates += duplicates.length;
  }

  return { total: rows.length, created, linked, removedDuplicates };
}
