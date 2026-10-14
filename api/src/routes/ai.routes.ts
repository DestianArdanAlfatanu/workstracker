import {
  aiGenerationUpdateSchema,
  atsCheckOptionsSchema,
  jobExtractSchema,
  careerProfileSchema,
  coverLetterOptionsSchema,
  generationTasksSchema,
  interviewPrepOptionsSchema,
} from '@wt/shared';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AI_MODEL } from '../lib/ai';
import { AppError, asyncHandler, parseId, sendError } from '../lib/http';
import { serializeAiGeneration } from '../lib/serialize';
import { currentUserId, requireAuth } from '../middlewares/auth';
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

/**
 * Cover letter dialirkan via Server-Sent Events:
 *   event: delta  data: {"text": "..."}
 *   event: reset  data: {}            (model fallback mengambil alih — kosongkan teks)
 *   event: done   data: {"generation": {...}}
 *   event: error  data: {"error": {code, message}}
 * Error sebelum stream dibuka (akses, kuota, validasi) dikirim sebagai JSON biasa.
 */
async function coverLetterSse(req: Request, res: Response) {
  const userId = currentUserId(req);
  const applicationId = parseId(req.params.id);
  const release = await assistant.prepare(userId);

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
      { onText: (text) => send('delta', { text }), onReset: () => send('reset', {}) },
      abort.signal,
    );
    send('done', { generation: serializeAiGeneration(generation) });
  } catch (err) {
    if (!abort.signal.aborted) {
      const e = err instanceof AppError ? err : new AppError('AI_UNAVAILABLE', 'Terjadi kesalahan pada layanan AI.');
      send('error', { error: { code: e.code, message: e.message } });
    }
  } finally {
    release();
    res.end();
  }
}

export function aiRoutes() {
  const router = Router();
  const aiLimit = createAiRateLimit();

  router.get(
    '/me/career-profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ data: await assistant.getProfile(currentUserId(req)) });
    }),
  );
  router.put(
    '/me/career-profile',
    requireAuth,
    validate(careerProfileSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: await assistant.saveProfile(currentUserId(req), req.body) });
    }),
  );
  router.get(
    '/me/ai-usage',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ data: { ...(await quota.usage(currentUserId(req))), model: AI_MODEL } });
    }),
  );

  router.post(
    '/applications/:id/ai/cover-letter',
    requireAuth,
    aiLimit,
    validate(coverLetterOptionsSchema),
    asyncHandler(coverLetterSse),
  );
  router.post(
    '/applications/:id/ai/interview-prep',
    requireAuth,
    aiLimit,
    validate(interviewPrepOptionsSchema),
    asyncHandler(async (req, res) => {
      const userId = currentUserId(req);
      const release = await assistant.prepare(userId);
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
    requireAuth,
    aiLimit,
    validate(atsCheckOptionsSchema),
    asyncHandler(async (req, res) => {
      const userId = currentUserId(req);
      const release = await assistant.prepare(userId);
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
    requireAuth,
    aiLimit,
    validate(jobExtractSchema),
    asyncHandler(async (req, res) => {
      const userId = currentUserId(req);
      const release = await assistant.prepare(userId);
      try {
        res.json({ data: await assistant.extractJob(userId, req.body.text) });
      } finally {
        release();
      }
    }),
  );
  router.get(
    '/applications/:id/ai/generations',
    requireAuth,
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
