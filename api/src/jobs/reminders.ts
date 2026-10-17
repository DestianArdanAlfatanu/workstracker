import { logger } from '../lib/logger';
import { runDailyPush } from '../services/push.service';
import { runDailyReminders } from '../services/reminder.service';

const INTERVAL_MS = 15 * 60 * 1000;

async function tick() {
  try {
    const sent = await runDailyReminders();
    if (sent > 0) logger.info({ sent }, 'Pengingat email harian terkirim');
  } catch (err) {
    logger.error({ err }, 'Job pengingat email gagal');
  }
  try {
    const pushed = await runDailyPush();
    if (pushed > 0) logger.info({ pushed }, 'Pengingat push harian terkirim');
  } catch (err) {
    logger.error({ err }, 'Job pengingat push gagal');
  }
}

/** Cek tiap 15 menit; tiap pengguna hanya menerima satu email per hari. */
export function startReminderJob() {
  void tick();
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
