import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from '@wt/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { AppError, asyncHandler, parseId } from '../lib/http';
import { serializeAttachment } from '../lib/serialize';
import { storedPath } from '../lib/storage';
import { blockDemo, currentUserId, requireAuth } from '../middlewares/auth';
import * as attachments from '../services/attachments.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ATTACHMENT_TYPES[file.mimetype]) return cb(null, true);
    cb(new AppError('VALIDATION_ERROR', 'Format file tidak didukung. Gunakan PDF, DOC, DOCX, PNG, atau JPG.'));
  },
});

/** Terjemahkan error multer (mis. file terlalu besar) ke format error API. */
function singleFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Ukuran file maksimal ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`
          : 'Upload gagal, coba lagi';
      return next(new AppError('VALIDATION_ERROR', message));
    }
    next(err);
  });
}

export function attachmentRoutes() {
  const router = Router();

  router.post(
    '/applications/:id/attachments',
    requireAuth,
    blockDemo('Upload lampiran'),
    singleFile,
    asyncHandler(async (req, res) => {
      if (!req.file) throw new AppError('VALIDATION_ERROR', 'Pilih file yang akan diunggah');
      const ext = ATTACHMENT_TYPES[req.file.mimetype];
      const att = await attachments.upload(currentUserId(req), parseId(req.params.id), req.file, ext);
      res.status(201).json({ data: serializeAttachment(att) });
    }),
  );

  router.get(
    '/attachments/:id/download',
    requireAuth,
    asyncHandler(async (req, res) => {
      const att = await attachments.findOwned(currentUserId(req), parseId(req.params.id));
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.download(storedPath(att.userId, att.storedName), att.originalName, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File tidak ditemukan' } });
      });
    }),
  );

  router.delete(
    '/attachments/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await attachments.remove(currentUserId(req), parseId(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
