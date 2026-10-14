import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'RATE_LIMITED'
  | 'AI_NOT_ENABLED'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  RATE_LIMITED: 429,
  AI_NOT_ENABLED: 403,
  AI_QUOTA_EXCEEDED: 429,
  AI_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.status = STATUS_BY_CODE[code];
  }
}

export const notFound = (message = 'Data tidak ditemukan') => new AppError('NOT_FOUND', message);

export function sendError(res: Response, code: ErrorCode, message: string, fields?: Record<string, string>) {
  res.status(STATUS_BY_CODE[code]).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

/** Membungkus handler async agar error diteruskan ke error middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Parse ID path (BigInt). ID tidak valid diperlakukan sebagai tidak ditemukan. */
export function parseId(raw: string): bigint {
  if (!/^\d{1,19}$/.test(raw)) throw notFound();
  return BigInt(raw);
}
