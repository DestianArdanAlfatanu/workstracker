import { randomUUID } from 'node:crypto';
import { mkdir, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger';

/** Folder penyimpanan file CV ("CV Saya"); per user di subfolder sesuai id. */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? 'storage/uploads');

export const userUploadDir = (userId: bigint) => path.join(UPLOAD_DIR, userId.toString());

export async function ensureUserDir(userId: bigint) {
  const dir = userUploadDir(userId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Nama file acak (tanpa nama asli) agar aman dari path traversal & tebakan. */
export const randomStoredName = (ext: string) => `${randomUUID()}.${ext}`;

export const storedPath = (userId: bigint, storedName: string) => path.join(userUploadDir(userId), storedName);

export async function removeStoredFiles(files: Array<{ userId: bigint; storedName: string }>) {
  await Promise.all(
    files.map(({ userId, storedName }) =>
      unlink(storedPath(userId, storedName)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') logger.warn({ err, storedName }, 'Gagal menghapus file CV');
      }),
    ),
  );
}

export async function removeUserFiles(userId: bigint) {
  await rm(userUploadDir(userId), { recursive: true, force: true });
}
