import { pushSubscriptionSchema, pushUnsubscribeSchema, shareResolveSchema } from '@wt/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, sendError } from '../lib/http';
import { pushConfigured, vapidPublicKey } from '../lib/push';
import { blockDemo, currentUserId, requireAuth, requireFeature } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as push from '../services/push.service';
import * as share from '../services/share.service';

/** Push notification (pengingat di HP/browser) dan Share Target PWA. */
export function pushRoutes() {
  const router = Router();

  router.get(
    '/push/key',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ data: { publicKey: vapidPublicKey(), configured: pushConfigured(), devices: await push.countDevices(currentUserId(req)) } });
    }),
  );
  router.post(
    '/push/subscriptions',
    requireAuth,
    requireFeature('reminders'),
    blockDemo('Notifikasi'),
    validate(pushSubscriptionSchema),
    asyncHandler(async (req, res) => {
      const devices = await push.subscribe(currentUserId(req), req.body, req.get('user-agent'));
      res.status(201).json({ data: { devices } });
    }),
  );
  // Melepas langganan tidak dibatasi paket: pengguna selalu boleh berhenti menerima notifikasi.
  router.delete(
    '/push/subscriptions',
    requireAuth,
    validate(pushUnsubscribeSchema),
    asyncHandler(async (req, res) => {
      await push.unsubscribe(currentUserId(req), req.body.endpoint);
      res.status(204).end();
    }),
  );
  router.post(
    '/push/test',
    requireAuth,
    requireFeature('reminders'),
    asyncHandler(async (req, res) => {
      res.json({ data: { delivered: await push.sendTest(currentUserId(req)) } });
    }),
  );

  const shareLimit = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => currentUserId(req).toString(),
    handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Terlalu banyak permintaan. Tunggu sebentar.'),
  });
  router.post(
    '/share/resolve',
    requireAuth,
    requireFeature('mobile_share'),
    shareLimit,
    validate(shareResolveSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: await share.resolve(req.body.url) });
    }),
  );
  return router;
}
