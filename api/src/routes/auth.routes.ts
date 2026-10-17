import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  preferencesSchema,
  profileUpdateSchema,
  resetPasswordSchema,
  resetTokenSchema,
} from '@wt/shared';
import rateLimit from 'express-rate-limit';
import * as reset from '../services/password-reset.service';
import * as ctrl from '../controllers/auth.controller';
import { asyncHandler, sendError } from '../lib/http';
import { blockDemo, requireAuth, requireAuthAllowPasswordChange, requireFeature } from '../middlewares/auth';
import { createLoginRateLimit } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';

export function authRoutes() {
  const router = Router();
  // Tidak ada registrasi publik: akun pembeli dibuat oleh admin (lihat admin.routes.ts).
  router.post('/auth/login', createLoginRateLimit(), validate(loginSchema), asyncHandler(ctrl.login));
  router.post('/auth/refresh', asyncHandler(ctrl.refresh));
  router.post('/auth/logout', asyncHandler(ctrl.logout));

  // Chrome Extension memakai sesi website tanpa login ulang.
  const extensionLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.EXTENSION_RATE_LIMIT_MAX ?? 30),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.'),
  });
  router.post('/auth/extension-session', extensionLimit, asyncHandler(ctrl.extensionSession));

  // Lupa password: dibatasi per IP agar tidak dipakai untuk spam email.
  const resetLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RESET_RATE_LIMIT_MAX ?? 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.'),
  });
  router.post(
    '/auth/forgot-password',
    resetLimit,
    validate(forgotPasswordSchema),
    asyncHandler(async (req, res) => {
      await reset.requestReset(req.body.email, req.ip);
      res.json({
        data: { message: 'Jika email tersebut terdaftar, kami telah mengirim link untuk mengatur ulang password.' },
      });
    }),
  );
  router.post(
    '/auth/reset-password/check',
    resetLimit,
    validate(resetTokenSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: { valid: await reset.checkToken(req.body.token) } });
    }),
  );
  router.post(
    '/auth/reset-password',
    resetLimit,
    validate(resetPasswordSchema),
    asyncHandler(async (req, res) => {
      await reset.resetPassword(req.body.token, req.body.newPassword);
      res.json({ data: { message: 'Password berhasil diubah. Silakan masuk dengan password baru.' } });
    }),
  );

  router.get('/me', requireAuthAllowPasswordChange, asyncHandler(ctrl.me));
  router.patch('/me', requireAuthAllowPasswordChange, validate(profileUpdateSchema), asyncHandler(ctrl.updateMe));
  router.patch('/me/preferences', requireAuth, validate(preferencesSchema), asyncHandler(ctrl.updatePreferences));
  router.post('/me/reminder-test', requireAuth, requireFeature('reminders'), blockDemo('Email pengingat'), asyncHandler(ctrl.sendTestReminder));
  return router;
}
