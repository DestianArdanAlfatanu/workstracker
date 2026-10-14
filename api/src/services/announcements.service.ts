import type { AnnouncementLevel } from '@wt/shared';
import { notFound } from '../lib/http';
import { prisma } from '../lib/prisma';

interface AnnouncementFields {
  title?: string;
  body?: string;
  level?: AnnouncementLevel;
  published?: boolean;
}

/* ------------------------------- Admin ------------------------------- */

export const adminList = () => prisma.announcement.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });

export function create(adminId: bigint, input: Required<Pick<AnnouncementFields, 'title' | 'body'>> & AnnouncementFields) {
  return prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      level: input.level ?? 'info',
      published: input.published ?? false,
      publishedAt: input.published ? new Date() : null,
      createdById: adminId,
    },
  });
}

export async function update(id: bigint, input: AnnouncementFields) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound('Pengumuman tidak ditemukan');
  // Tanggal tayang diisi saat pertama kali dipublikasikan.
  const publishedAt =
    input.published === true && !existing.published ? new Date() : input.published === false ? null : undefined;
  return prisma.announcement.update({
    where: { id },
    data: { ...input, ...(publishedAt !== undefined ? { publishedAt } : {}) },
  });
}

export async function remove(id: bigint) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound('Pengumuman tidak ditemukan');
  await prisma.announcement.delete({ where: { id } });
}

/* ------------------------------ Pengguna ----------------------------- */

/** 20 pengumuman terbaru yang sudah tayang, dengan status sudah dibaca. */
export async function forUser(userId: bigint) {
  const items = await prisma.announcement.findMany({
    where: { published: true },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: 20,
    include: { reads: { where: { userId }, select: { userId: true } } },
  });
  return items.map(({ reads, ...a }) => ({ announcement: a, read: reads.length > 0 }));
}

export async function markRead(userId: bigint, id: bigint) {
  const a = await prisma.announcement.findFirst({ where: { id, published: true } });
  if (!a) throw notFound('Pengumuman tidak ditemukan');
  await prisma.announcementRead.upsert({
    where: { userId_announcementId: { userId, announcementId: id } },
    update: {},
    create: { userId, announcementId: id },
  });
}
