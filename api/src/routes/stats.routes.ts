import { Router } from 'express';
import { insightsQuerySchema, type Insights } from '@wt/shared';
import * as ctrl from '../controllers/stats.controller';
import { asyncHandler } from '../lib/http';
import { currentUserId, requireAuth, requireFeature } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { insights } from '../services/insights.service';

export function statsRoutes() {
  const router = Router();
  router.get('/stats/summary', requireAuth, asyncHandler(ctrl.summary));
  router.get(
    '/stats/insights',
    requireAuth,
    requireFeature('insight'),
    validate(insightsQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const { period } = req.query as unknown as { period: Insights['period'] };
      res.json({ data: await insights(currentUserId(req), period) });
    }),
  );
  return router;
}
