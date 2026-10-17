import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {
  jobUrlLookupSchema,
  applicationCreateSchema,
  applicationUpdateSchema,
  bulkActionSchema,
  exportQuerySchema,
  IMPORT_MAX_BYTES,
  importCommitSchema,
  listQuerySchema,
  statusUpdateSchema,
  upcomingQuerySchema,
} from '@wt/shared';
import * as ctrl from '../controllers/applications.controller';
import { AppError, asyncHandler, sendError } from '../lib/http';
import { currentUserId, requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMPORT_MAX_BYTES, files: 1, fields: 2 } });

/** File impor (XLSX/CSV, maks. 2 MB); error multer diterjemahkan ke format error API. */
function importFile(req: Request, res: Response, next: NextFunction) {
  importUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(
        new AppError('VALIDATION_ERROR', err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 2 MB' : 'Upload gagal, coba lagi'),
      );
    }
    next(err);
  });
}

const createImportLimit = () =>
  rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.IMPORT_RATE_LIMIT_MAX ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => currentUserId(req).toString(),
  handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Terlalu banyak impor. Tunggu sebentar lalu coba lagi.'),
});

export function applicationRoutes() {
  const router = Router();
  router.use('/applications', requireAuth);
  const importLimit = createImportLimit();

  router.get('/applications', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
  router.post('/applications', validate(applicationCreateSchema), asyncHandler(ctrl.create));
  // Harus sebelum /:id
  router.post('/applications/bulk', validate(bulkActionSchema), asyncHandler(ctrl.bulk));
  router.get('/applications/export', validate(exportQuerySchema, 'query'), asyncHandler(ctrl.exportFile));
  router.get('/applications/lookup', validate(jobUrlLookupSchema, 'query'), asyncHandler(ctrl.lookup));
  router.post('/applications/import/parse', importLimit, importFile, asyncHandler(ctrl.importParse));
  router.post('/applications/import', importLimit, validate(importCommitSchema), asyncHandler(ctrl.importCommit));
  router.get('/applications/import/template', asyncHandler(ctrl.importTemplate));
  router.get('/applications/upcoming', validate(upcomingQuerySchema, 'query'), asyncHandler(ctrl.upcoming));

  router.get('/applications/:id', asyncHandler(ctrl.get));
  router.patch('/applications/:id', validate(applicationUpdateSchema), asyncHandler(ctrl.update));
  router.patch('/applications/:id/status', validate(statusUpdateSchema), asyncHandler(ctrl.changeStatus));
  router.delete('/applications/:id', asyncHandler(ctrl.remove));
  router.post('/applications/:id/restore', asyncHandler(ctrl.restore));
  return router;
}
