import { SOFT_DELETE_RETENTION_DAYS } from '../lib/env';
import { logger } from '../lib/logger';
import { purgeDeleted } from '../services/applications.service';
import { purgeOrphanArchived } from '../services/cv.service';
import { purgeExpiredDemos } from '../services/demo/demo.service';

const HOUR_MS = 60 * 60 * 1000;

async function runOnce() {
  try {
    const count = await purgeDeleted(SOFT_DELETE_RETENTION_DAYS);
    if (count > 0) logger.info({ count }, 'Lamaran terhapus dibersihkan permanen');
  } catch (err) {
    logger.error({ err }, 'Gagal membersihkan lamaran terhapus');
  }
  try {
    await purgeOrphanArchived();
  } catch (err) {
    logger.error({ err }, 'Gagal membersihkan CV arsip');
  }
  try {
    const demos = await purgeExpiredDemos();
    if (demos > 0) logger.info({ demos }, 'Akun demo kedaluwarsa dihapus');
  } catch (err) {
    logger.error({ err }, 'Gagal menghapus akun demo kedaluwarsa');
  }
}

/** Jalankan saat start lalu tiap jam (akun demo berumur 24 jam). */
export function startPurgeJob() {
  void runOnce();
  const timer = setInterval(runOnce, HOUR_MS);
  timer.unref();
  return () => clearInterval(timer);
}
