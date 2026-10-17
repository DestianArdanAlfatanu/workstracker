import type { Application, CareerProfile } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { AppError, notFound } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { storedPath } from '../../lib/storage';

/** CV yang dibaca AI: teks hasil ekstraksi, atau file PDF utuh bila CV hasil scan. */
export interface AiCv {
  name: string;
  text: string | null;
  pdfBase64: string | null;
}

export interface AiContext {
  userName: string;
  application: Application & { history: Array<{ toStatus: string; changedAt: Date }> };
  profile: CareerProfile | null;
  /** CV dari "CV Saya" (yang dipilih, atau yang terhubung ke lamaran). */
  cv: AiCv | null;
}

/** Muat CV milik user untuk AI. Null bila CV tidak bisa dibaca sama sekali (mis. .doc lama hasil scan). */
export async function loadCv(userId: bigint, cvId: bigint): Promise<AiCv | null> {
  const cv = await prisma.cvDocument.findFirst({ where: { id: cvId, userId } });
  if (!cv) throw notFound('CV tidak ditemukan');
  if (cv.textContent) return { name: cv.label, text: cv.textContent, pdfBase64: null };
  if (cv.mimeType === 'application/pdf') {
    const buffer = await readFile(storedPath(cv.userId, cv.storedName));
    return { name: cv.label, text: null, pdfBase64: buffer.toString('base64') };
  }
  return null;
}

/**
 * Kumpulkan data yang dibutuhkan AI. Hanya lamaran & CV milik user yang bisa dipakai.
 * Data sensitif (kontak HR, gaji, email pengguna) TIDAK diteruskan ke prompt; lihat prompts.ts.
 * `cvId` tidak dikirim → CV yang terhubung ke lamaran; `null` → tanpa CV.
 */
export async function buildContext(userId: bigint, applicationId: bigint, cvId?: number | null): Promise<AiContext> {
  const [user, application, profile] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    prisma.application.findFirst({
      where: { id: applicationId, userId, deletedAt: null },
      include: { history: { orderBy: { changedAt: 'asc' }, select: { toStatus: true, changedAt: true } } },
    }),
    prisma.careerProfile.findUnique({ where: { userId } }),
  ]);
  if (!application) throw notFound('Lamaran tidak ditemukan');

  const chosen = cvId === undefined ? application.cvId : cvId === null ? null : BigInt(cvId);
  const cv = chosen ? await loadCv(userId, chosen) : null;
  return { userName: user.name, application, profile, cv };
}

/** CV untuk "Isi Profil Karier dari CV": harus bisa dibaca (teks atau PDF). */
export async function cvForProfile(userId: bigint, cvId: number) {
  const cv = await loadCv(userId, BigInt(cvId));
  if (!cv) {
    throw new AppError('VALIDATION_ERROR', 'CV ini tidak bisa dibaca AI (format Word lama). Unggah versi PDF atau DOCX.');
  }
  return cv;
}

const PROFILE_FIELDS = ['headline', 'summary', 'skills', 'experience', 'education', 'achievements'] as const;

/** 0–100: kelengkapan profil (bobot lebih besar untuk pengalaman & skill). */
export function profileCompleteness(p: Partial<Record<(typeof PROFILE_FIELDS)[number], string | null>> | null) {
  if (!p) return 0;
  const weights = { headline: 10, summary: 15, skills: 25, experience: 30, education: 10, achievements: 10 };
  let score = 0;
  for (const f of PROFILE_FIELDS) if (p[f] && p[f]!.trim().length >= 10) score += weights[f];
  return score;
}
