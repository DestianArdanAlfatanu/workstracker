import { Router } from 'express';
import {
  applicationCreateSchema,
  applicationUpdateSchema,
  bulkActionSchema,
  exportQuerySchema,
  listQuerySchema,
  statusUpdateSchema,
  upcomingQuerySchema,
} from '@wt/shared';
import * as ctrl from '../controllers/applications.controller';
import { asyncHandler } from '../lib/http';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

export function applicationRoutes() {
  const router = Router();
  router.use('/applications', requireAuth);

  router.get('/applications', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
  router.post('/applications', validate(applicationCreateSchema), asyncHandler(ctrl.create));
  // Harus sebelum /:id
  router.post('/applications/bulk', validate(bulkActionSchema), asyncHandler(ctrl.bulk));
  router.get('/applications/export', validate(exportQuerySchema, 'query'), asyncHandler(ctrl.exportFile));
  router.get('/applications/upcoming', validate(upcomingQuerySchema, 'query'), asyncHandler(ctrl.upcoming));

  router.get('/applications/:id', asyncHandler(ctrl.get));
  router.patch('/applications/:id', validate(applicationUpdateSchema), asyncHandler(ctrl.update));
  router.patch('/applications/:id/status', validate(statusUpdateSchema), asyncHandler(ctrl.changeStatus));
  router.delete('/applications/:id', asyncHandler(ctrl.remove));
  router.post('/applications/:id/restore', asyncHandler(ctrl.restore));
  return router;
}
