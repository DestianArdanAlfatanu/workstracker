import { checkoutSchema, meCheckoutSchema, paymentListQuerySchema, type PaymentListQuery } from '@wt/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, sendError } from '../lib/http';
import { blockDemo, currentUserId, requireAdmin, requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as payments from '../services/payments.service';

const limit = (max: number, windowMs: number, message: string) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 'RATE_LIMITED', message),
  });

/** Pembayaran otomatis Midtrans: beli akun, upgrade, isi ulang kredit, webhook. */
export function paymentRoutes() {
  const router = Router();
  const checkoutLimit = limit(Number(process.env.CHECKOUT_RATE_LIMIT_MAX ?? 10), 15 * 60_000, 'Terlalu banyak percobaan pembelian. Coba lagi sebentar lagi.');
  const statusLimit = limit(120, 60_000, 'Terlalu banyak permintaan. Tunggu sebentar.');

  router.get('/checkout/config', (_req, res) => {
    res.json({ data: payments.config() });
  });
  router.post(
    '/checkout',
    checkoutLimit,
    validate(checkoutSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json({ data: await payments.checkout(req.body) });
    }),
  );
  router.get(
    '/checkout/:orderId',
    statusLimit,
    asyncHandler(async (req, res) => {
      res.json({ data: await payments.getPublicStatus(String(req.params.orderId).slice(0, 50)) });
    }),
  );

  router.post(
    '/me/checkout',
    requireAuth,
    blockDemo('Pembayaran'),
    checkoutLimit,
    validate(meCheckoutSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json({ data: await payments.checkoutForUser(currentUserId(req), req.body) });
    }),
  );
  router.get(
    '/me/payments',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ data: await payments.listForUser(currentUserId(req)) });
    }),
  );

  // Notifikasi dari Midtrans (Payment Notification URL di dashboard Midtrans).
  router.post(
    '/payments/midtrans/notification',
    asyncHandler(async (req, res) => {
      res.json({ data: await payments.handleNotification((req.body ?? {}) as Record<string, unknown>) });
    }),
  );
  // Mode simulasi (PAYMENT_FAKE=1, bukan production): tandai pesanan lunas.
  router.post(
    '/payments/simulate/:orderId',
    asyncHandler(async (req, res) => {
      res.json({ data: await payments.simulatePay(String(req.params.orderId)) });
    }),
  );

  router.get(
    '/admin/payments',
    requireAuth,
    requireAdmin,
    validate(paymentListQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as PaymentListQuery;
      const { items, total, paidCount, paidAmount } = await payments.listAll({ ...query, q: query.q ?? null });
      res.json({ data: items, meta: { page: query.page, limit: query.limit, total, paidCount, paidAmount } });
    }),
  );
  return router;
}
