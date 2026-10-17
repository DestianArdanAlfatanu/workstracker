import { CV_MAX_ACTIVE, CV_TYPES } from '@wt/shared';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractCvText, matchesCvSignature } from '../lib/cv-text';
import { AppError, notFound } from '../lib/http';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { ensureUserDir, randomStoredName, removeStoredFiles, storedPath } from '../lib/storage';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Jumlah lamaran (belum dihapus) yang memakai CV — ditampilkan di kartu CV. */
const usage = { _count: { select: { applications: { where: { deletedAt: null } } } } } as const;

/** Nama asli dibersihkan dari path & karakter kontrol; hanya untuk ditampilkan/diunduh. */
function cleanName(name: string) {
  // Multer membaca nama sebagai latin1; ubah ke UTF-8 agar nama berhuruf non-ASCII benar.
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return path.basename(utf8).replace(/[\u0000-\u001f"\\]/g, '').slice(0, 255) || 'cv';
}

/** Simpan file ke disk + baca teksnya sekali (dibaca AI). */
async function storeFile(userId: bigint, file: UploadedFile) {
  const ext = CV_TYPES[file.mimetype];
  if (!ext || !matchesCvSignature(file.buffer, file.mimetype)) {
    throw new AppError('VALIDATION_ERROR', 'Isi file tidak sesuai formatnya. Gunakan CV PDF, DOC, atau DOCX yang tidak rusak.');
  }
  await ensureUserDir(userId);
  const storedName = randomStoredName(ext);
  await writeFile(storedPath(userId, storedName), file.buffer);
  const { text, pageCount } = await extractCvText(file.buffer, file.mimetype);
  return {
    storedName,
    originalName: cleanName(file.originalname),
    mimeType: file.mimetype,
    size: file.size,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    textContent: text,
    pageCount,
  };
}

async function findOwned(userId: bigint, id: bigint) {
  const cv = await prisma.cvDocument.findFirst({ where: { id, userId }, include: usage });
  if (!cv) throw notFound('CV tidak ditemukan');
  return cv;
}

/** Jadikan CV aktif terbaru sebagai utama bila belum ada CV utama. */
async function ensureDefault(userId: bigint) {
  const hasDefault = await prisma.cvDocument.count({ where: { userId, archivedAt: null, isDefault: true } });
  if (hasDefault) return;
  const latest = await prisma.cvDocument.findFirst({ where: { userId, archivedAt: null }, orderBy: { createdAt: 'desc' } });
  if (latest) await prisma.cvDocument.update({ where: { id: latest.id }, data: { isDefault: true } });
}

/** CV aktif, ditambah CV arsip yang masih dipakai lamaran (bisa dibuka dari lamarannya). */
export async function list(userId: bigint) {
  const [active, archived] = await Promise.all([
    prisma.cvDocument.findMany({
      where: { userId, archivedAt: null },
      include: usage,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.cvDocument.findMany({
      where: { userId, archivedAt: { not: null }, applications: { some: { deletedAt: null } } },
      include: usage,
      orderBy: { archivedAt: 'desc' },
    }),
  ]);
  return [...active, ...archived];
}

export async function create(userId: bigint, file: UploadedFile, label: string) {
  const active = await prisma.cvDocument.count({ where: { userId, archivedAt: null } });
  if (active >= CV_MAX_ACTIVE) {
    throw new AppError('VALIDATION_ERROR', `Maksimal ${CV_MAX_ACTIVE} CV. Hapus atau ganti salah satu CV terlebih dahulu.`);
  }
  const data = await storeFile(userId, file);
  const cv = await prisma.cvDocument.create({ data: { ...data, userId, label, isDefault: active === 0 }, include: usage });
  return cv;
}

export async function update(userId: bigint, id: bigint, input: { label?: string; isDefault?: true }) {
  const cv = await findOwned(userId, id);
  if (cv.archivedAt) throw new AppError('VALIDATION_ERROR', 'CV arsip tidak bisa diubah.');
  await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.cvDocument.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    await tx.cvDocument.update({
      where: { id: cv.id },
      data: { ...(input.label !== undefined ? { label: input.label } : {}), ...(input.isDefault ? { isDefault: true } : {}) },
    });
  });
  return findOwned(userId, id);
}

/**
 * Ganti file CV. Bila CV lama sudah dipakai lamaran → diarsipkan (lamaran lama tetap menunjuk
 * versi yang benar-benar dikirim) dan dibuat CV baru dengan nama & status utama yang sama.
 */
export async function replace(userId: bigint, id: bigint, file: UploadedFile) {
  const cv = await findOwned(userId, id);
  if (cv.archivedAt) throw new AppError('VALIDATION_ERROR', 'CV arsip tidak bisa diganti.');
  const used = await prisma.application.count({ where: { cvId: cv.id } });
  const data = await storeFile(userId, file);
  if (used > 0) {
    return prisma.$transaction(async (tx) => {
      await tx.cvDocument.update({ where: { id: cv.id }, data: { archivedAt: new Date(), isDefault: false } });
      return tx.cvDocument.create({
        data: { ...data, userId, label: cv.label, isDefault: cv.isDefault },
        include: usage,
      });
    });
  }
  const updated = await prisma.cvDocument.update({ where: { id: cv.id }, data, include: usage });
  await removeStoredFiles([{ userId, storedName: cv.storedName }]);
  return updated;
}

/** Hapus CV. Bila masih dipakai lamaran → diarsipkan saja (file tetap ada untuk lamaran itu). */
export async function remove(userId: bigint, id: bigint) {
  const cv = await findOwned(userId, id);
  const used = await prisma.application.count({ where: { cvId: cv.id } });
  if (used > 0) {
    if (!cv.archivedAt) {
      await prisma.cvDocument.update({ where: { id: cv.id }, data: { archivedAt: new Date(), isDefault: false } });
    }
  } else {
    await prisma.cvDocument.delete({ where: { id: cv.id } });
    await removeStoredFiles([{ userId, storedName: cv.storedName }]);
  }
  await ensureDefault(userId);
  return { archived: used > 0 };
}

/** Untuk unduh (termasuk CV arsip), khusus pemilik. */
export async function forDownload(userId: bigint, id: bigint) {
  return findOwned(userId, id);
}

/** Bersihkan CV arsip yang sudah tidak dipakai lamaran mana pun (mis. setelah lamaran dihapus permanen). */
export async function purgeOrphanArchived() {
  const orphans = await prisma.cvDocument.findMany({
    where: { archivedAt: { not: null }, applications: { none: {} } },
    select: { id: true, userId: true, storedName: true },
  });
  if (orphans.length === 0) return 0;
  await prisma.cvDocument.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  await removeStoredFiles(orphans);
  logger.info({ count: orphans.length }, 'CV arsip yang tidak dipakai dihapus');
  return orphans.length;
}
