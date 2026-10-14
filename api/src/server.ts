import { createApp } from './app';
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

function shutdown() {
  stopPurge();
  stopReminders();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
