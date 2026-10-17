import { createApp } from './app';
import { startPaymentJob } from './jobs/payments';
import { startPurgeJob } from './jobs/purge';
import { startReminderJob } from './jobs/reminders';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const server = createApp().listen(env.port, () => {
  logger.info(`WorksTracker API berjalan di http://localhost:${env.port}`);
});
const stopPurge = startPurgeJob();
const stopReminders = startReminderJob();
const stopPayments = startPaymentJob();

function shutdown() {
  stopPurge();
  stopReminders();
  stopPayments();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
