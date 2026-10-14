import type { Prisma } from '@prisma/client';
import type { TaskListQuery } from '@wt/shared';
import { notFound } from '../lib/http';
import { prisma } from '../lib/prisma';
import { fromISODate } from '../lib/serialize';

const include = { application: { select: { id: true, company: true, position: true } } } as const;

interface TaskFields {
  title?: string;
  dueDate?: string | null;
  applicationId?: number | null;
  done?: boolean;
}

/** Lamaran yang ditautkan harus milik user yang sama dan belum dihapus. */
async function assertApplication(userId: bigint, applicationId: number | null | undefined) {
  if (applicationId == null) return;
  const app = await prisma.application.findFirst({
    where: { id: BigInt(applicationId), userId, deletedAt: null },
    select: { id: true },
  });
  if (!app) throw notFound('Lamaran tidak ditemukan');
}

async function findOwned(userId: bigint, id: bigint) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw notFound('Tugas tidak ditemukan');
  return task;
}

// Tugas dari lamaran yang dihapus (soft delete) ikut disembunyikan.
const visible = { OR: [{ applicationId: null }, { application: { deletedAt: null } }] };

export async function list(userId: bigint, query: TaskListQuery) {
  const where: Prisma.TaskWhereInput = { userId, ...visible };
  if (query.status === 'open') where.doneAt = null;
  if (query.status === 'done') where.doneAt = { not: null };
  if (query.applicationId) where.applicationId = BigInt(query.applicationId);
  return prisma.task.findMany({
    where,
    include,
    orderBy: [{ doneAt: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    take: 500,
  });
}

export async function create(userId: bigint, input: TaskFields & { title: string }) {
  await assertApplication(userId, input.applicationId);
  return prisma.task.create({
    data: {
      userId,
      title: input.title,
      dueDate: input.dueDate ? fromISODate(input.dueDate) : null,
      applicationId: input.applicationId != null ? BigInt(input.applicationId) : null,
    },
    include,
  });
}

export async function update(userId: bigint, id: bigint, input: TaskFields) {
  const task = await findOwned(userId, id);
  if (input.applicationId !== undefined) await assertApplication(userId, input.applicationId);
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? fromISODate(input.dueDate) : null;
  if (input.applicationId !== undefined) {
    data.applicationId = input.applicationId != null ? BigInt(input.applicationId) : null;
  }
  if (input.done !== undefined) data.doneAt = input.done ? (task.doneAt ?? new Date()) : null;
  return prisma.task.update({ where: { id: task.id }, data, include });
}

export async function remove(userId: bigint, id: bigint) {
  const task = await findOwned(userId, id);
  await prisma.task.delete({ where: { id: task.id } });
}
