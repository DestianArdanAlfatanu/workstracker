import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/** Validasi req.body atau req.query dengan skema Zod; hasil parse menggantikan input. */
export const validate =
  (schema: ZodTypeAny, source: 'body' | 'query' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) return next(result.error);
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
