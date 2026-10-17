import { CV_MAX_BYTES, CV_TYPES, cvUpdateSchema, cvUploadSchema } from '@wt/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { AppError, asyncHandler, parseId } from '../lib/http';
import { serializeCv } from '../lib/serialize';
import { storedPath } from '../lib/storage';
import { blockDemo, currentUserId, requireAuth, requireFeature } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as cvs from '../services/cv.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CV_MAX_BYTES, files: 1, fields: 4 },
  fileFilter: (_req, file, cb) => {
    if (CV_TYPES[file.mimetype]) return cb(null, true);
    cb(new AppError('VALIDATION_ERROR', 'Format CV tidak didukung. Gunakan PDF, DOC, atau DOCX.'));
  },
});

/** Terjemahkan error multer (mis. file terlalu besar) ke format error API. */
function singleFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? `Ukuran CV maksimal ${CV_MAX_BYTES / 1024 / 1024} MB` : 'Upload gagal, coba lagi';
      return next(new AppError('VALIDATION_ERROR', message));
    }
    next(err);
  });
}

const requireFile = (req: Request) => {
  if (!req.file) throw new AppError('VALIDATION_ERROR', 'Pilih file CV yang akan diunggah', { file: 'Pilih file CV' });
  return req.file;
};

/** "CV Saya": simpan CV sekali (maks. 5), lalu pilih per lamaran. Fitur paket Standar ke atas. */
export function cvRoutes() {
  const router = Router();
  router.use('/cvs', requireAuth, requireFeature('attachments'));

  router.get(
    '/cvs',
    asyncHandler(async (req, res) => {
      res.json({ data: (await cvs.list(currentUserId(req))).map(serializeCv) });
    }),
  );

  router.post(
    '/cvs',
    blockDemo('Upload CV'),
    singleFile,
    validate(cvUploadSchema),
    asyncHandler(async (req, res) => {
      const cv = await cvs.create(currentUserId(req), requireFile(req), req.body.label);
      res.status(201).json({ data: serializeCv(cv) });
    }),
  );

  router.patch(
    '/cvs/:id',
    validate(cvUpdateSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: serializeCv(await cvs.update(currentUserId(req), parseId(req.params.id), req.body)) });
    }),
  );

  router.post(
    '/cvs/:id/replace',
    blockDemo('Upload CV'),
    singleFile,
    asyncHandler(async (req, res) => {
      res.json({ data: serializeCv(await cvs.replace(currentUserId(req), parseId(req.params.id), requireFile(req))) });
    }),
  );

  router.delete(
    '/cvs/:id',
    asyncHandler(async (req, res) => {
      res.json({ data: await cvs.remove(currentUserId(req), parseId(req.params.id)) });
    }),
  );

  router.get(
    '/cvs/:id/download',
    asyncHandler(async (req, res) => {
      const cv = await cvs.forDownload(currentUserId(req), parseId(req.params.id));
      res.setHeader('Content-Type', cv.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.download(storedPath(cv.userId, cv.storedName), cv.originalName, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File CV tidak ditemukan' } });
      });
    }),
  );

  return router;
}
