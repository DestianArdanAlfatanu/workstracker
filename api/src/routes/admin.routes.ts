import { Router } from 'express';
import {
  adminCreateUserSchema,
  adminCreditsSchema,
  adminListQuerySchema,
  adminPlanSchema,
  adminUpdateUserSchema,
} from '@wt/shared';
import * as ctrl from '../controllers/admin.controller';
import { asyncHandler } from '../lib/http';
import { requireAdmin, requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

export function adminRoutes() {
  const router = Router();
  router.use('/admin', requireAuth, requireAdmin);

  router.get('/admin/overview', asyncHandler(ctrl.overview));
  router.get('/admin/users', validate(adminListQuerySchema, 'query'), asyncHandler(ctrl.list));
  router.post('/admin/users', validate(adminCreateUserSchema), asyncHandler(ctrl.create));
  router.patch('/admin/users/:id', validate(adminUpdateUserSchema), asyncHandler(ctrl.update));
  router.post('/admin/users/:id/reset-password', asyncHandler(ctrl.resetPassword));
  router.post('/admin/users/:id/suspend', asyncHandler(ctrl.suspend));
  router.post('/admin/users/:id/activate', asyncHandler(ctrl.activate));
  router.delete('/admin/users/:id', asyncHandler(ctrl.remove));
  router.patch('/admin/users/:id/plan', validate(adminPlanSchema), asyncHandler(ctrl.setPlan));
  router.post('/admin/users/:id/credits', validate(adminCreditsSchema), asyncHandler(ctrl.addCredits));
  router.get('/admin/users/:id/purchases', asyncHandler(ctrl.purchases));
  router.get('/admin/integrations', asyncHandler(ctrl.integrations));
  router.post('/admin/integrations/ai-test', asyncHandler(ctrl.testAi));
  router.post('/admin/integrations/email-test', asyncHandler(ctrl.testEmail));
  return router;
}
