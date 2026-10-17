import {
  AI_CREDIT_COST,
  aiGenerationUpdateSchema,
  extractCost,
  MAX_POSTER_BYTES,
  MAX_POSTER_IMAGES,
  atsCheckOptionsSchema,
  jobExtractSchema,
  profileFromCvSchema,
  careerProfileSchema,
  coverLetterOptionsSchema,
  generationTasksSchema,
  interviewPrepOptionsSchema,
} from '@wt/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { AppError, asyncHandler, parseId, sendError } from '../lib/http';
import { serializeAiGeneration } from '../lib/serialize';
import { detectImageType } from '../lib/image-type';
import { currentUserId, requireAuth, requireFeature } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as assistant from '../services/ai/assistant.service';
import * as quota from '../services/ai/quota';

/** Maks. 5 permintaan generate per menit per pengguna. */
const createAiRateLimit = () =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    keyGenerator: (req) => currentUserId(req).toString(),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Terlalu banyak permintaan AI, tunggu sebentar.'),
  });

/** Gambar poster (isi otomatis): disimpan di memori saja, tidak ditulis ke disk. */
const posterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_POSTER_BYTES, files: MAX_POSTER_IMAGES, fields: 5, fieldSize: 64 * 1024 },
});

function posterImages(req: Request, res: Response, next: NextFunction) {
  posterUpload.array('images', MAX_POSTER_IMAGES)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Ukuran gambar maksimal ${MAX_POSTER_BYTES / 1024 / 1024} MB`
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Maksimal ${MAX_POSTER_IMAGES} gambar per lowongan`
            : 'Upload gambar gagal, coba lagi';
      return next(new AppError('VALIDATION_ERROR', message));
    }
    next(err);
  });
}

/**
 * Cover letter dialirkan via Server-Sent Events:
 *   event: delta  data: {"text": "..."}
 *   event: done   data: {"generation": {...}}
 *   event: error  data: {"error": {code, message}}
 * Error sebelum stream dibuka (akses, kuota, validasi) dikirim sebagai JSON biasa.
 */
async function coverLetterSse(req: Request, res: Response) {
  const userId = currentUserId(req);
  const applicationId = parseId(req.params.id);
  const release = await assistant.prepare(userId, AI_CREDIT_COST.cover_letter);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Klien menutup koneksi → batalkan permintaan ke model (tidak ditagih penuh, tidak disimpan).
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  try {
    const generation = await assistant.generateCoverLetter(
      userId,
      applicationId,
      req.body,
      { onText: (text) => send('delta', { text }) },
      abort.signal,
    );
    send('done', { generation: serializeAiGeneration(generation) });
  } catch (err) {
    if (!abort.signal.aborted) {
      const e = err instanceof AppError ? err : new AppError('AI_UNAVAILABLE', 'Terjadi kesalahan pada layanan AI.');
      send('error', { error: { code: e.code, message: e.message, ...(e.details ?? {}) } });
    }
  } finally {
    release();
    res.end();
  }
}

export function aiRoutes() {
  const router = Router();
  const aiLimit = createAiRateLimit();
  // Semua fitur AI & Profil Karier termasuk paket Premium.
  const premium = [requireAuth, requireFeature('ai')];

  router.get(
    '/me/career-profile',
    ...premium,
    asyncHandler(async (req, res) => {
      res.json({ data: await assistant.getProfile(currentUserId(req)) });
    }),
  );
  router.put(
    '/me/career-profile',
    ...premium,
    validate(careerProfileSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: await assistant.saveProfile(currentUserId(req), req.body) });
    }),
  );
  router.get(
    '/me/ai-usage',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ data: await quota.usage(currentUserId(req)) });
    }),
  );

  router.post(
    '/applications/:id/ai/cover-letter',
    ...premium,
    aiLimit,
    validate(coverLetterOptionsSchema),
    asyncHandler(coverLetterSse),
  );
  router.post(
    '/applications/:id/ai/interview-prep',
    ...premium,
    aiLimit,
    validate(interviewPrepOptionsSchema),
    asyncHandler(async (req, res) => {
      const userId = currentUserId(req);
      const release = await assistant.prepare(userId, AI_CREDIT_COST.interview_prep);
      try {
        const g = await assistant.generateInterviewPrep(userId, parseId(req.params.id), req.body);
        res.status(201).json({ data: serializeAiGeneration(g) });
      } finally {
        release();
      }
    }),
  );
  router.post(
    '/applications/:id/ai/ats-check',
    ...premium,
    aiLimit,
    validate(atsCheckOptionsSchema),
    asyncHandler(async (req, res) => {
      const userId = currentUserId(req);
      const release = await assistant.prepare(userId, AI_CREDIT_COST.ats_check);
      try {
        const g = await assistant.generateAtsCheck(userId, parseId(req.params.id), req.body);
        res.status(201).json({ data: serializeAiGeneration(g) });
      } finally {
        release();
      }
    }),
  );
  router.post(
    '/ai/extract-job',
    ...premium,
    aiLimit,
    // JSON {text} atau multipart: text + images[] (poster, maks. 4).
    posterImages,
    validate(jobExtractSchema),
    asyncHandler(async (req, res) => {
      const userId = currentUserId(req);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const images = files.map((f) => {
        const mimeType = detectImageType(f.buffer);
        if (!mimeType) {
          throw new AppError('VALIDATION_ERROR', 'Format gambar tidak didukung. Gunakan JPG, PNG, WEBP, atau HEIC.');
        }
        return { mimeType, base64: f.buffer.toString('base64') };
      });
      const text: string | undefined = req.body.text;
      if (!text && images.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Unggah gambar poster atau tempel teks lowongan terlebih dahulu.');
      }
      const release = await assistant.prepare(userId, extractCost(images.length));
      try {
        res.json({ data: await assistant.extractJob(userId, { text, images }) });
      } finally {
        release();
      }
    }),
  );
  router.post(
    '/ai/profile-from-cv',
    ...premium,
    aiLimit,
    validate(profileFromCvSchema),
    asyncHandler(async (req, res) => {
      const userId = currentUserId(req);
      const release = await assistant.prepare(userId, AI_CREDIT_COST.profile_extract);
      try {
        res.json({ data: await assistant.profileFromCv(userId, req.body.cvId) });
      } finally {
        release();
      }
    }),
  );
  router.get(
    '/applications/:id/ai/generations',
    ...premium,
    asyncHandler(async (req, res) => {
      const items = await assistant.listGenerations(currentUserId(req), parseId(req.params.id));
      res.json({ data: items.map(serializeAiGeneration) });
    }),
  );

  router.patch(
    '/ai/generations/:id',
    requireAuth,
    validate(aiGenerationUpdateSchema),
    asyncHandler(async (req, res) => {
      const g = await assistant.updateGeneration(currentUserId(req), parseId(req.params.id), req.body);
      res.json({ data: serializeAiGeneration(g) });
    }),
  );
  router.delete(
    '/ai/generations/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await assistant.deleteGeneration(currentUserId(req), parseId(req.params.id));
      res.status(204).end();
    }),
  );
  router.post(
    '/ai/generations/:id/tasks',
    requireAuth,
    validate(generationTasksSchema),
    asyncHandler(async (req, res) => {
      const count = await assistant.createPracticeTasks(currentUserId(req), parseId(req.params.id), req.body.questionIndexes);
      res.status(201).json({ data: { count } });
    }),
  );

  return router;
}
