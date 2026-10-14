import Anthropic from '@anthropic-ai/sdk';
import {
  addDaysISO,
  todayISO,
  type CareerProfileInput,
  type CoverLetterOptions,
  type InterviewPrep,
  type InterviewPrepOptions,
  type JobExtract,
} from '@wt/shared';
import {
  AiIncompleteError,
  AiNotConfiguredError,
  AiRefusalError,
  getAiProvider,
  type AiUsageInfo,
  type StreamCallbacks,
} from '../../lib/ai';
import { AppError, notFound } from '../../lib/http';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { fromISODate, toISODate } from '../../lib/serialize';
import { buildContext, profileCompleteness } from './context';
import { demoAiProvider } from './demo-provider';
import {
  AtsCheckSchema,
  atsCheckPrompt,
  coverLetterPrompt,
  interviewPrepPrompt,
  InterviewPrepSchema,
  JobExtractSchema,
  jobExtractPrompt,
  PROMPT_VERSION,
} from './prompts';
import { acquireSlot, assertCanGenerate } from './quota';

/* ---------------------------- Profil karier ---------------------------- */

export async function getProfile(userId: bigint) {
  const p = await prisma.careerProfile.findUnique({ where: { userId } });
  return {
    headline: p?.headline ?? null,
    summary: p?.summary ?? null,
    skills: p?.skills ?? null,
    experience: p?.experience ?? null,
    education: p?.education ?? null,
    achievements: p?.achievements ?? null,
    city: p?.city ?? null,
    updatedAt: p?.updatedAt.toISOString() ?? null,
    completeness: profileCompleteness(p),
  };
}

export async function saveProfile(userId: bigint, input: CareerProfileInput) {
  const data = input as Record<string, string | null | undefined>;
  await prisma.careerProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return getProfile(userId);
}

/* ------------------------------ Generasi ------------------------------ */

/** Ubah error AI/SDK menjadi pesan untuk pengguna; detail teknis hanya ke log. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof AiNotConfiguredError) {
    return new AppError('AI_UNAVAILABLE', 'Fitur AI belum dikonfigurasi oleh admin.');
  }
  if (err instanceof AiRefusalError) {
    return new AppError('VALIDATION_ERROR', 'AI tidak dapat memproses permintaan ini. Coba ubah catatan atau data lamaran.');
  }
  if (err instanceof AiIncompleteError) {
    return new AppError('AI_UNAVAILABLE', 'Jawaban AI tidak lengkap. Silakan coba lagi.');
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return new AppError('AI_UNAVAILABLE', 'Layanan AI sedang sibuk. Coba lagi beberapa saat lagi.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError('AI_UNAVAILABLE', 'Tidak dapat terhubung ke layanan AI. Coba lagi nanti.');
  }
  logger.error({ err }, 'Generasi AI gagal');
  return new AppError('AI_UNAVAILABLE', 'Terjadi kesalahan pada layanan AI. Coba lagi nanti.');
}

/** Akun demo memakai contoh hasil (tanpa memanggil API). */
async function providerFor(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isDemo: true } });
  return user.isDemo ? demoAiProvider : getAiProvider();
}

interface SaveInput {
  userId: bigint;
  applicationId: bigint | null;
  kind: 'cover_letter' | 'interview_prep' | 'ats_check' | 'job_extract';
  options: object;
  content?: string;
  contentJson?: object;
  usage?: AiUsageInfo;
  status: 'completed' | 'failed' | 'refused';
}

function saveGeneration(input: SaveInput) {
  const { usage } = input;
  // Log hanya metadata — tidak pernah isi prompt atau hasil.
  logger.info(
    { kind: input.kind, status: input.status, model: usage?.model, tokensIn: usage?.inputTokens, tokensOut: usage?.outputTokens },
    'Generasi AI',
  );
  return prisma.aiGeneration.create({
    data: {
      userId: input.userId,
      applicationId: input.applicationId,
      kind: input.kind,
      status: input.status,
      options: input.options,
      content: input.content ?? null,
      contentJson: input.contentJson as object | undefined,
      model: usage?.model ?? 'unknown',
      promptVersion: PROMPT_VERSION,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cacheReadTokens: usage?.cacheReadTokens ?? 0,
      costMicroUsd: usage?.costMicroUsd ?? 0,
    },
  });
}

/** Cek akses & ambil slot sebelum mulai (dipanggil sebelum stream SSE dibuka). */
export async function prepare(userId: bigint) {
  await assertCanGenerate(userId);
  return acquireSlot(userId);
}

export async function generateCoverLetter(
  userId: bigint,
  applicationId: bigint,
  opts: CoverLetterOptions,
  cb: StreamCallbacks,
  signal: AbortSignal,
) {
  const ctx = await buildContext(userId, applicationId, opts.cvAttachmentId);
  const options = { ...opts, cvAttachmentId: opts.cvAttachmentId ?? null };
  try {
    const provider = await providerFor(userId);
    const { text, usage } = await provider.streamText(coverLetterPrompt(ctx, opts), cb, signal);
    return await saveGeneration({ userId, applicationId, kind: 'cover_letter', options, content: text, usage, status: 'completed' });
  } catch (err) {
    if (signal.aborted) throw err;
    if (err instanceof AiRefusalError) {
      await saveGeneration({ userId, applicationId, kind: 'cover_letter', options, status: 'refused' });
    }
    throw toAppError(err);
  }
}

export async function generateInterviewPrep(userId: bigint, applicationId: bigint, opts: InterviewPrepOptions) {
  const ctx = await buildContext(userId, applicationId, opts.cvAttachmentId);
  const options = { ...opts, cvAttachmentId: opts.cvAttachmentId ?? null };
  try {
    const provider = await providerFor(userId);
    const { data, usage } = await provider.structured(interviewPrepPrompt(ctx, opts), InterviewPrepSchema);
    return await saveGeneration({
      userId,
      applicationId,
      kind: 'interview_prep',
      options,
      contentJson: data,
      usage,
      status: 'completed',
    });
  } catch (err) {
    if (err instanceof AiRefusalError) {
      await saveGeneration({ userId, applicationId, kind: 'interview_prep', options, status: 'refused' });
    }
    throw toAppError(err);
  }
}

export async function generateAtsCheck(
  userId: bigint,
  applicationId: bigint,
  opts: { language: 'id' | 'en'; cvAttachmentId?: number | null },
) {
  const ctx = await buildContext(userId, applicationId, opts.cvAttachmentId);
  if (!ctx.application.jobDescription?.trim()) {
    throw new AppError('VALIDATION_ERROR', 'Isi deskripsi lowongan terlebih dahulu agar CV bisa dicocokkan.');
  }
  const options = { ...opts, cvAttachmentId: opts.cvAttachmentId ?? null };
  try {
    const provider = await providerFor(userId);
    const { data, usage } = await provider.structured(atsCheckPrompt(ctx, opts.language), AtsCheckSchema);
    const contentJson = { ...data, score: Math.max(0, Math.min(100, Math.round(data.score))) };
    return await saveGeneration({ userId, applicationId, kind: 'ats_check', options, contentJson, usage, status: 'completed' });
  } catch (err) {
    if (err instanceof AiRefusalError) {
      await saveGeneration({ userId, applicationId, kind: 'ats_check', options, status: 'refused' });
    }
    throw toAppError(err);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Isi otomatis: ekstrak data lamaran dari teks lowongan. Hasil dinormalisasi sebelum dikirim ke form. */
export async function extractJob(userId: bigint, text: string): Promise<JobExtract> {
  try {
    const provider = await providerFor(userId);
    const { data, usage } = await provider.structured(jobExtractPrompt(text), JobExtractSchema);
    const salary = (v: number | null) => (v != null && Number.isFinite(v) && v > 0 && v < 4_294_967_295 ? Math.round(v) : null);
    let salaryMin = salary(data.salaryMin);
    let salaryMax = salary(data.salaryMax);
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) [salaryMin, salaryMax] = [salaryMax, salaryMin];
    const trimTo = (v: string | null, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
    const result: JobExtract = {
      company: trimTo(data.company, 150),
      position: trimTo(data.position, 150),
      location: trimTo(data.location, 120),
      workType: data.workType,
      salaryMin,
      salaryMax,
      source: data.source,
      jobDescription: trimTo(data.jobDescription, 20000),
      contactName: trimTo(data.contactName, 100),
      contactEmail: data.contactEmail && EMAIL_RE.test(data.contactEmail.trim()) ? data.contactEmail.trim().slice(0, 191) : null,
    };
    await saveGeneration({
      userId,
      applicationId: null,
      kind: 'job_extract',
      options: { textLength: text.length },
      contentJson: result,
      usage,
      status: 'completed',
    });
    return result;
  } catch (err) {
    if (err instanceof AiRefusalError) {
      await saveGeneration({ userId, applicationId: null, kind: 'job_extract', options: {}, status: 'refused' });
    }
    throw toAppError(err);
  }
}

/* --------------------------- Riwayat generasi --------------------------- */

export async function listGenerations(userId: bigint, applicationId: bigint) {
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId, deletedAt: null }, select: { id: true } });
  if (!app) throw notFound('Lamaran tidak ditemukan');
  return prisma.aiGeneration.findMany({
    where: { applicationId, userId, status: 'completed', kind: { not: 'job_extract' } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
}

async function findOwned(userId: bigint, id: bigint) {
  const g = await prisma.aiGeneration.findFirst({ where: { id, userId, application: { deletedAt: null } } });
  if (!g) throw notFound('Hasil AI tidak ditemukan');
  return g;
}

export async function updateGeneration(userId: bigint, id: bigint, input: { editedContent?: string | null; rating?: 1 | -1 | null }) {
  const g = await findOwned(userId, id);
  return prisma.aiGeneration.update({
    where: { id: g.id },
    data: {
      ...(input.editedContent !== undefined ? { editedContent: input.editedContent } : {}),
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
    },
  });
}

export async function deleteGeneration(userId: bigint, id: bigint) {
  const g = await findOwned(userId, id);
  await prisma.aiGeneration.delete({ where: { id: g.id } });
}

/** Jadikan pertanyaan interview terpilih sebagai tugas latihan (tenggat sehari sebelum jadwal). */
export async function createPracticeTasks(userId: bigint, id: bigint, indexes: number[]) {
  const g = await findOwned(userId, id);
  const prep = g.contentJson as InterviewPrep | null;
  if (g.kind !== 'interview_prep' || !prep || !g.applicationId) {
    throw new AppError('VALIDATION_ERROR', 'Hanya untuk hasil persiapan interview');
  }
  const app = await prisma.application.findUniqueOrThrow({ where: { id: g.applicationId } });

  const today = todayISO();
  let due: string | null = null;
  if (app.nextActionDate) {
    const before = addDaysISO(toISODate(app.nextActionDate), -1);
    due = before >= today ? before : toISODate(app.nextActionDate) >= today ? today : null;
  }
  const questions = [...new Set(indexes)].map((i) => prep.questions[i]).filter(Boolean);
  if (questions.length === 0) throw new AppError('VALIDATION_ERROR', 'Pertanyaan tidak ditemukan');
  const { count } = await prisma.task.createMany({
    data: questions.map((q) => ({
      userId,
      applicationId: app.id,
      title: `Latihan jawab: ${q.question}`.slice(0, 200),
      dueDate: due ? fromISODate(due) : null,
    })),
  });
  return count;
}
