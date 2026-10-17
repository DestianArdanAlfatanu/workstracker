import { logger } from '../lib/logger';
import { reconcilePending } from '../services/payments.service';

const INTERVAL_MS = 10 * 60 * 1000;

async function tick() {
  try {
    const changed = await reconcilePending();
    if (changed > 0) logger.info({ changed }, 'Status pembayaran diperbarui dari Midtrans');
  } catch (err) {
    logger.error({ err }, 'Job rekonsiliasi pembayaran gagal');
  }
}

/** Tiap 10 menit: cek pesanan yang masih menunggu (menutup webhook yang terlewat) & tandai kedaluwarsa. */
export function startPaymentJob() {
  void tick();
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
