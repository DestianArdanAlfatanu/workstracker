import rateLimit from 'express-rate-limit';
import { sendError } from '../lib/http';

/**
 * Maksimal 5 percobaan login per menit per IP (PRD). Dibuat per instance app.
 * LOGIN_RATE_LIMIT_MAX hanya untuk menaikkan batas saat E2E.
 */
export const createLoginRateLimit = () =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      sendError(res, 'RATE_LIMITED', 'Terlalu banyak percobaan login, coba lagi dalam 1 menit'),
  });
