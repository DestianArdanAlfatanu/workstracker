import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, sendError } from '../lib/http';
import { logger } from '../lib/logger';

export function notFoundHandler(_req: Request, res: Response) {
  sendError(res, 'NOT_FOUND', 'Endpoint tidak ditemukan');
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    return sendError(res, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Data tidak valid', fields);
  }
  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.fields, err.details);
  }
  // Body JSON rusak dari express.json()
  if (typeof err === 'object' && err && 'type' in err && err.type === 'entity.parse.failed') {
    return sendError(res, 'VALIDATION_ERROR', 'Format JSON tidak valid');
  }
  (req.log ?? logger).error({ err }, 'Unhandled error');
  sendError(res, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server, coba lagi nanti');
}
