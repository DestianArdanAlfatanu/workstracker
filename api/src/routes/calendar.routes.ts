import { Router } from 'express';
import { calendarQuerySchema, type CalendarQuery } from '@wt/shared';
import { asyncHandler } from '../lib/http';
import { currentUserId, requireAuth, requireFeature } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as calendar from '../services/calendar.service';

export function calendarRoutes() {
  const router = Router();
  router.get(
    '/calendar',
    requireAuth,
    requireFeature('calendar'),
    validate(calendarQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      res.json({ data: await calendar.events(currentUserId(req), req.query as unknown as CalendarQuery) });
    }),
  );
  return router;
}
