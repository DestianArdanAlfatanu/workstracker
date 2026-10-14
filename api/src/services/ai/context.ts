import type { Application, CareerProfile } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { notFound } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { storedPath } from '../../lib/storage';

export interface AiContext {
  userName: string;
  application: Application & { history: Array<{ toStatus: string; changedAt: Date }> };
  profile: CareerProfile | null;
  /** CV PDF (base64) bila dipilih pengguna. */
  cv: { name: string; base64: string } | null;
}

/**
 * Kumpulkan data yang dibutuhkan AI. Hanya lamaran & lampiran milik user yang bisa dipakai.
 * Data sensitif (kontak HR, gaji, email pengguna) TIDAK diteruskan ke prompt — lihat prompts.ts.
 */
export async function buildContext(userId: bigint, applicationId: bigint, cvAttachmentId?: number | null): Promise<AiContext> {
  const [user, application, profile] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    prisma.application.findFirst({
      where: { id: applicationId, userId, deletedAt: null },
      include: { history: { orderBy: { changedAt: 'asc' }, select: { toStatus: true, changedAt: true } } },
    }),
    prisma.careerProfile.findUnique({ where: { userId } }),
  ]);
  if (!application) throw notFound('Lamaran tidak ditemukan');

  let cv: AiContext['cv'] = null;
  if (cvAttachmentId) {
    const att = await prisma.attachment.findFirst({
      where: { id: BigInt(cvAttachmentId), userId, mimeType: 'application/pdf', application: { deletedAt: null } },
    });
    if (!att) throw notFound('CV PDF tidak ditemukan');
    const buffer = await readFile(storedPath(att.userId, att.storedName));
    cv = { name: att.originalName, base64: buffer.toString('base64') };
  }

  return { userName: user.name, application, profile, cv };
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
