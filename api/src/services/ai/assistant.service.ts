import { ApiError } from '@google/genai';
import {
  AI_CREDIT_COST,
  addDaysISO,
  extractCost,
  todayISO,
  type CareerProfileInput,
  type CoverLetterOptions,
  type InterviewPrep,
  type InterviewPrepOptions,
  type AiGenerationKind,
  type CareerProfileDraft,
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
import { buildContext, cvForProfile, profileCompleteness } from './context';
import { demoAiProvider } from './demo-provider';
import {
  AtsCheckSchema,
  CareerProfileDraftSchema,
  profileFromCvPrompt,
  atsCheckPrompt,
  coverLetterPrompt,
  interviewPrepPrompt,
  InterviewPrepSchema,
  JobExtractSchema,
  jobExtractPrompt,
  PROMPT_VERSION,
} from './prompts';
import { acquireSlot, assertCanGenerate, chargeCredits } from './quota';

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

/**
 * Em dash (—) adalah ciri khas tulisan AI. Prompt sudah melarangnya; ini pengaman terakhir:
 * diganti koma (rentang angka dengan en dash "2023–2026" tidak diubah).
 */
export const noEmDash = (s: string) => s.replace(/\s*—\s*/g, ', ').replace(/,\s*,/g, ',');

/** Terapkan noEmDash ke semua teks di hasil terstruktur. */
function cleanStrings<T>(value: T): T {
  if (typeof value === 'string') return noEmDash(value) as T;
  if (Array.isArray(value)) return value.map(cleanStrings) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanStrings(v)])) as T;
  }
  return value;
}

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
  if (err instanceof ApiError && (err.status === 429 || err.status >= 500)) {
    logger.warn({ status: err.status, message: err.message }, 'Gemini sibuk / kuota');
    return new AppError('AI_UNAVAILABLE', 'Layanan AI sedang sibuk. Coba lagi beberapa saat lagi.');
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
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
  kind: AiGenerationKind;
  options: object;
  /** Kredit yang dipotong bila berhasil (default: bobot fitur). */
  credits?: number;
  content?: string;
  contentJson?: object;
  usage?: AiUsageInfo;
  status: 'completed' | 'failed' | 'refused';
}

/**
 * Simpan hasil; untuk generasi yang berhasil, kredit dipotong di transaksi yang sama
 * (gagal/ditolak tidak memotong kredit).
 */
function saveGeneration(input: SaveInput) {
  const { usage } = input;
  // Log hanya metadata — tidak pernah isi prompt atau hasil.
  logger.info(
    { kind: input.kind, status: input.status, model: usage?.model, tokensIn: usage?.inputTokens, tokensOut: usage?.outputTokens },
    'Generasi AI',
  );
  return prisma.$transaction(async (tx) => {
    const generation = await tx.aiGeneration.create({ data: generationData(input) });
    if (input.status === 'completed') {
      await chargeCredits(tx, input.userId, input.kind, input.credits ?? AI_CREDIT_COST[input.kind], generation.id);
    }
    return generation;
  });
}

function generationData(input: SaveInput) {
  const { usage } = input;
  return {
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
  };
}

/** Cek paket & saldo kredit lalu ambil slot sebelum mulai (dipanggil sebelum stream SSE dibuka). */
export async function prepare(userId: bigint, cost: number) {
  await assertCanGenerate(userId, cost);
  return acquireSlot(userId);
}

export async function generateCoverLetter(
  userId: bigint,
  applicationId: bigint,
  opts: CoverLetterOptions,
  cb: StreamCallbacks,
  signal: AbortSignal,
) {
  const ctx = await buildContext(userId, applicationId, opts.cvId);
  const options = { ...opts, cvId: opts.cvId ?? null };
  try {
    const provider = await providerFor(userId);
    const res = await provider.streamText(coverLetterPrompt(ctx, opts), { onText: (t) => cb.onText(noEmDash(t)) }, signal);
    const text = noEmDash(res.text);
    const usage = res.usage;
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
  const ctx = await buildContext(userId, applicationId, opts.cvId);
  const options = { ...opts, cvId: opts.cvId ?? null };
  try {
    const provider = await providerFor(userId);
    const res = await provider.structured(interviewPrepPrompt(ctx, opts), InterviewPrepSchema);
    const data = cleanStrings(res.data);
    const usage = res.usage;
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
  opts: { language: 'id' | 'en'; cvId?: number | null },
) {
  const ctx = await buildContext(userId, applicationId, opts.cvId);
  if (!ctx.application.jobDescription?.trim()) {
    throw new AppError('VALIDATION_ERROR', 'Isi deskripsi lowongan terlebih dahulu agar CV bisa dicocokkan.');
  }
  const options = { ...opts, cvId: opts.cvId ?? null };
  try {
    const provider = await providerFor(userId);
    const res = await provider.structured(atsCheckPrompt(ctx, opts.language), AtsCheckSchema);
    const data = cleanStrings(res.data);
    const usage = res.usage;
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PosterImage {
  mimeType: string;
  base64: string;
}

/**
 * Isi otomatis: ekstrak data lamaran dari teks lowongan dan/atau gambar poster.
 * Biaya: 1 kredit per gambar (teks saja = 1 kredit). Gambar tidak disimpan.
 * Hasil dinormalisasi sebelum dikirim ke form.
 */
export async function extractJob(userId: bigint, input: { text?: string; images?: PosterImage[] }): Promise<JobExtract> {
  const imageCount = input.images?.length ?? 0;
  const credits = extractCost(imageCount);
  const options = { textLength: input.text?.length ?? 0, images: imageCount };
  try {
    const provider = await providerFor(userId);
    const res = await provider.structured(jobExtractPrompt(input), JobExtractSchema);
    // Transkrip poster dibiarkan apa adanya (salinan tulisan asli); field lain dibersihkan.
    const data = { ...cleanStrings(res.data), posterText: res.data.posterText };
    const usage = res.usage;
    const salary = (v: number | null) => (v != null && Number.isFinite(v) && v > 0 && v < 4_294_967_295 ? Math.round(v) : null);
    let salaryMin = salary(data.salaryMin);
    let salaryMax = salary(data.salaryMax);
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) [salaryMin, salaryMax] = [salaryMax, salaryMin];
    const trimTo = (v: string | null, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
    const phone = data.contactPhone?.replace(/[^\d+]/g, '') ?? '';
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
      contactPhone: phone.length >= 8 && phone.length <= 20 ? phone : null,
      deadline: data.deadline && DATE_RE.test(data.deadline.trim()) ? data.deadline.trim() : null,
      applyInstructions: trimTo(data.applyInstructions, 500),
      posterText: imageCount ? trimTo(data.posterText, 20000) : null,
    };
    await saveGeneration({
      userId,
      applicationId: null,
      kind: 'job_extract',
      options,
      contentJson: result,
      usage,
      credits,
      status: 'completed',
    });
    return result;
  } catch (err) {
    if (err instanceof AiRefusalError) {
      await saveGeneration({ userId, applicationId: null, kind: 'job_extract', options, status: 'refused' });
    }
    throw toAppError(err);
  }
}
/** Isi Profil Karier dari CV (draf; pengguna yang menyimpan). 1 kredit. */
export async function profileFromCv(userId: bigint, cvId: number): Promise<CareerProfileDraft> {
  const cv = await cvForProfile(userId, cvId);
  const options = { cvId, fromText: !!cv.text };
  try {
    const provider = await providerFor(userId);
    const res = await provider.structured(profileFromCvPrompt(cv), CareerProfileDraftSchema);
    const d = cleanStrings(res.data);
    const trimTo = (v: string | null, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
    const draft: CareerProfileDraft = {
      headline: trimTo(d.headline, 150),
      summary: trimTo(d.summary, 3000),
      skills: trimTo(d.skills, 3000),
      experience: trimTo(d.experience, 10000),
      education: trimTo(d.education, 3000),
      achievements: trimTo(d.achievements, 5000),
      city: trimTo(d.city, 100),
    };
    await saveGeneration({ userId, applicationId: null, kind: 'profile_extract', options, contentJson: draft, usage: res.usage, status: 'completed' });
    return draft;
  } catch (err) {
    if (err instanceof AiRefusalError) {
      await saveGeneration({ userId, applicationId: null, kind: 'profile_extract', options, status: 'refused' });
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
