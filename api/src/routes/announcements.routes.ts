import { Router } from 'express';
import { announcementSchema, announcementUpdateSchema } from '@wt/shared';
import { asyncHandler, parseId } from '../lib/http';
import { serializeAnnouncement } from '../lib/serialize';
import { currentUserId, requireAdmin, requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as announcements from '../services/announcements.service';

export function announcementRoutes() {
  const router = Router();

  // Pengguna
  router.get(
    '/announcements',
    requireAuth,
    asyncHandler(async (req, res) => {
      const items = await announcements.forUser(currentUserId(req));
      res.json({ data: items.map(({ announcement, read }) => serializeAnnouncement(announcement, read)) });
    }),
  );
  router.post(
    '/announcements/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      await announcements.markRead(currentUserId(req), parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // Admin
  router.use('/admin/announcements', requireAuth, requireAdmin);
  router.get(
    '/admin/announcements',
    asyncHandler(async (_req, res) => {
      res.json({ data: (await announcements.adminList()).map((a) => serializeAnnouncement(a)) });
    }),
  );
  router.post(
    '/admin/announcements',
    validate(announcementSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json({ data: serializeAnnouncement(await announcements.create(currentUserId(req), req.body)) });
    }),
  );
  router.patch(
    '/admin/announcements/:id',
    validate(announcementUpdateSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: serializeAnnouncement(await announcements.update(parseId(req.params.id), req.body)) });
    }),
  );
  router.delete(
    '/admin/announcements/:id',
    asyncHandler(async (req, res) => {
      await announcements.remove(parseId(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
