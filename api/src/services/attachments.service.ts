import { ATTACHMENT_MAX_PER_APPLICATION } from '@wt/shared';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, notFound } from '../lib/http';
import { prisma } from '../lib/prisma';
import { ensureUserDir, randomStoredName, removeStoredFiles, storedPath } from '../lib/storage';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

async function findOwnedApplication(userId: bigint, applicationId: bigint) {
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId, deletedAt: null } });
  if (!app) throw notFound('Lamaran tidak ditemukan');
  return app;
}

/** Nama asli dibersihkan dari path & karakter kontrol; hanya untuk ditampilkan/diunduh. */
function cleanName(name: string) {
  // Multer membaca nama sebagai latin1; ubah ke UTF-8 agar nama berhuruf non-ASCII benar.
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return path.basename(utf8).replace(/[\u0000-\u001f"\\]/g, '').slice(0, 255) || 'lampiran';
}

const MAGIC: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47],
  jpg: [0xff, 0xd8, 0xff],
  doc: [0xd0, 0xcf, 0x11, 0xe0], // OLE2
  docx: [0x50, 0x4b, 0x03, 0x04], // ZIP
};

/** Pastikan isi file sesuai ekstensinya (MIME dari browser bisa dipalsukan). */
function matchesSignature(buffer: Buffer, ext: string) {
  const sig = MAGIC[ext];
  return !!sig && sig.every((byte, i) => buffer[i] === byte);
}

export async function upload(userId: bigint, applicationId: bigint, file: UploadedFile, ext: string) {
  await findOwnedApplication(userId, applicationId);
  if (!matchesSignature(file.buffer, ext)) {
    throw new AppError('VALIDATION_ERROR', 'Isi file tidak sesuai dengan formatnya. Pastikan file tidak rusak.');
  }
  const count = await prisma.attachment.count({ where: { applicationId } });
  if (count >= ATTACHMENT_MAX_PER_APPLICATION) {
    throw new AppError('VALIDATION_ERROR', `Maksimal ${ATTACHMENT_MAX_PER_APPLICATION} lampiran per lamaran`);
  }
  await ensureUserDir(userId);
  const storedName = randomStoredName(ext);
  await writeFile(storedPath(userId, storedName), file.buffer);
  try {
    return await prisma.attachment.create({
      data: {
        userId,
        applicationId,
        originalName: cleanName(file.originalname),
        storedName,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
  } catch (e) {
    await removeStoredFiles([{ userId, storedName }]);
    throw e;
  }
}

export async function findOwned(userId: bigint, id: bigint) {
  const att = await prisma.attachment.findFirst({
    where: { id, userId, application: { deletedAt: null } },
  });
  if (!att) throw notFound('Lampiran tidak ditemukan');
  return att;
}

export async function remove(userId: bigint, id: bigint) {
  const att = await findOwned(userId, id);
  await prisma.attachment.delete({ where: { id: att.id } });
  await removeStoredFiles([att]);
}
