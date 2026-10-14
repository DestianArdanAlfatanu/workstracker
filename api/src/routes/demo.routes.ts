import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sendSession } from '../controllers/auth.controller';
import { asyncHandler, sendError } from '../lib/http';
import { startDemo } from '../services/demo/demo.service';

export function demoRoutes() {
  const router = Router();
  // Maks. 5 demo per jam per IP (bisa dinaikkan untuk E2E lewat DEMO_RATE_LIMIT_MAX).
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.DEMO_RATE_LIMIT_MAX ?? 5),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Terlalu banyak demo dibuka dari perangkat ini. Coba lagi nanti.'),
  });

  router.post(
    '/demo/start',
    limiter,
    asyncHandler(async (_req, res) => {
      sendSession(res, await startDemo(), 201);
    }),
  );
  return router;
}
