import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middlewares/error';
import { adminRoutes } from './routes/admin.routes';
import { aiRoutes } from './routes/ai.routes';
import { announcementRoutes } from './routes/announcements.routes';
import { calendarRoutes } from './routes/calendar.routes';
import { cvRoutes } from './routes/cv.routes';
import { demoRoutes } from './routes/demo.routes';
import { applicationRoutes } from './routes/applications.routes';
import { authRoutes } from './routes/auth.routes';
import { paymentRoutes } from './routes/payments.routes';
import { pushRoutes } from './routes/push.routes';
import { statsRoutes } from './routes/stats.routes';
import { taskRoutes } from './routes/tasks.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Di production API berada di belakang reverse proxy (HTTPS); perlu agar rate limit memakai IP asli.
  if (env.isProd) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  // Impor lamaran mengirim hingga 200 baris (dengan deskripsi lowongan) per permintaan.
  app.use('/api/v1/applications/import', express.json({ limit: '4mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: !env.isTest }));

  app.get('/health', (_req, res) => {
    res.json({ data: { ok: true } });
  });

  const v1 = express.Router();
  v1.use(authRoutes());
  v1.use(demoRoutes());
  v1.use(applicationRoutes());
  v1.use(cvRoutes());
  v1.use(statsRoutes());
  v1.use(taskRoutes());
  v1.use(calendarRoutes());
  v1.use(announcementRoutes());
  v1.use(aiRoutes());
  v1.use(pushRoutes());
  v1.use(paymentRoutes());
  v1.use(adminRoutes());
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
