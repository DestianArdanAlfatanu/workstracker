import { Prisma } from '@prisma/client';
import {
  FINAL_STATUSES,
  MAX_ACTIVE_APPLICATIONS,
  type ApplicationCreate,
  type ApplicationUpdate,
  type ListQuery,
  type Status,
} from '@wt/shared';
import { AppError, notFound } from '../lib/http';
import { prisma } from '../lib/prisma';
import { fromISODate } from '../lib/serialize';
import { removeStoredFiles } from '../lib/storage';

const NOT_FOUND_MESSAGE = 'Lamaran tidak ditemukan';

const SORT_MAP = {
  applied_at: 'appliedAt',
  created_at: 'createdAt',
  next_action_date: 'nextActionDate',
  company: 'company',
} as const;

type FieldInput = Partial<ApplicationCreate>;

/** Ubah input tervalidasi menjadi data Prisma (hanya field yang dikirim). */
function toData(input: FieldInput) {
  const data: Prisma.ApplicationUncheckedUpdateInput = {};
  const copy = [
    'company',
    'position',
    'status',
    'source',
    'location',
    'workType',
    'salaryMin',
    'salaryMax',
    'jobUrl',
    'contactName',
    'contactEmail',
    'nextActionNote',
    'notes',
    'jobDescription',
  ] as const;
  for (const key of copy) {
    if (input[key] !== undefined) (data as Record<string, unknown>)[key] = input[key];
  }
  if (input.appliedAt !== undefined) data.appliedAt = fromISODate(input.appliedAt);
  if (input.nextActionDate !== undefined) {
    data.nextActionDate = input.nextActionDate ? fromISODate(input.nextActionDate) : null;
  }
  return data;
}

async function assertBelowLimit(userId: bigint) {
  const count = await prisma.application.count({ where: { userId, deletedAt: null } });
  if (count >= MAX_ACTIVE_APPLICATIONS) {
    throw new AppError(
      'FORBIDDEN',
      `Batas ${MAX_ACTIVE_APPLICATIONS.toLocaleString('id-ID')} lamaran tercapai. Hapus lamaran lama untuk menambah yang baru.`,
    );
  }
}

async function findOwned(userId: bigint, id: bigint) {
  const app = await prisma.application.findFirst({ where: { id, userId, deletedAt: null } });
  if (!app) throw notFound(NOT_FOUND_MESSAGE);
  return app;
}

type ListFilters = Pick<ListQuery, 'q' | 'status' | 'source' | 'sort'>;

/** Filter & urutan daftar lamaran; dipakai juga oleh ekspor. */
export function buildListQuery(userId: bigint, query: ListFilters, ids?: number[]) {
  const where: Prisma.ApplicationWhereInput = { userId, deletedAt: null };
  if (ids?.length) where.id = { in: ids.map(BigInt) };
  if (query.status?.length) where.status = { in: query.status };
  if (query.source?.length) where.source = { in: query.source };
  if (query.q) where.OR = [{ company: { contains: query.q } }, { position: { contains: query.q } }];

  const [field, dir] = query.sort.split(':') as [keyof typeof SORT_MAP, Prisma.SortOrder];
  const sortKey = SORT_MAP[field];
  const orderBy: Prisma.ApplicationOrderByWithRelationInput[] = [
    sortKey === 'nextActionDate'
      ? { nextActionDate: { sort: dir, nulls: 'last' } }
      : { [sortKey]: dir },
    { id: 'desc' },
  ];
  return { where, orderBy };
}

export async function list(userId: bigint, query: ListQuery) {
  const { where, orderBy } = buildListQuery(userId, query);
  const [items, total] = await prisma.$transaction([
    prisma.application.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.application.count({ where }),
  ]);
  return { items, total };
}

export async function get(userId: bigint, id: bigint) {
  const app = await prisma.application.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      history: { orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] },
      attachments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!app) throw notFound(NOT_FOUND_MESSAGE);
  return app;
}

export async function create(userId: bigint, input: ApplicationCreate) {
  await assertBelowLimit(userId);
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: { ...(toData(input) as Prisma.ApplicationUncheckedCreateInput), userId },
    });
    await tx.statusHistory.create({
      data: { applicationId: app.id, fromStatus: null, toStatus: app.status },
    });
    return app;
  });
}

export async function update(userId: bigint, id: bigint, input: ApplicationUpdate) {
  const existing = await findOwned(userId, id);

  const salaryMin = input.salaryMin !== undefined ? input.salaryMin : existing.salaryMin;
  const salaryMax = input.salaryMax !== undefined ? input.salaryMax : existing.salaryMax;
  if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
    throw new AppError('VALIDATION_ERROR', 'Gaji maks harus ≥ gaji min', {
      salaryMax: 'Gaji maks harus ≥ gaji min',
    });
  }

  return prisma.$transaction(async (tx) => {
    const app = await tx.application.update({ where: { id: existing.id }, data: toData(input) });
    if (input.status && input.status !== existing.status) {
      await tx.statusHistory.create({
        data: { applicationId: app.id, fromStatus: existing.status, toStatus: input.status },
      });
    }
    return app;
  });
}

export async function changeStatus(userId: bigint, id: bigint, status: Status) {
  return update(userId, id, { status });
}

export async function softDelete(userId: bigint, id: bigint) {
  const existing = await findOwned(userId, id);
  await prisma.application.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
}

export async function restore(userId: bigint, id: bigint) {
  const existing = await prisma.application.findFirst({
    where: { id, userId, deletedAt: { not: null } },
  });
  if (!existing) throw notFound(NOT_FOUND_MESSAGE);
  await assertBelowLimit(userId);
  return prisma.application.update({ where: { id: existing.id }, data: { deletedAt: null } });
}

export async function upcoming(userId: bigint, limit: number) {
  return prisma.application.findMany({
    where: {
      userId,
      deletedAt: null,
      nextActionDate: { not: null },
      status: { notIn: [...FINAL_STATUSES] },
    },
    orderBy: [{ nextActionDate: 'asc' }, { id: 'asc' }],
    take: limit,
  });
}

/** Hapus permanen lamaran yang sudah di-soft-delete lebih lama dari `days` hari. */
export async function purgeDeleted(days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const where = { deletedAt: { lt: cutoff } };
  // Hapus juga file lampirannya dari disk.
  const files = await prisma.attachment.findMany({
    where: { application: where },
    select: { userId: true, storedName: true },
  });
  const { count } = await prisma.application.deleteMany({ where });
  await removeStoredFiles(files);
  return count;
}

/** Aksi massal pada lamaran milik user; id yang bukan miliknya diabaikan. */
export async function bulk(
  userId: bigint,
  input:
    | { action: 'status'; ids: number[]; status: Status }
    | { action: 'delete'; ids: number[] }
    | { action: 'restore'; ids: number[] },
) {
  const ids = [...new Set(input.ids)].map(BigInt);

  if (input.action === 'delete') {
    const { count } = await prisma.application.updateMany({
      where: { id: { in: ids }, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count;
  }

  if (input.action === 'restore') {
    const active = await prisma.application.count({ where: { userId, deletedAt: null } });
    const candidates = await prisma.application.count({ where: { id: { in: ids }, userId, deletedAt: { not: null } } });
    if (active + candidates > MAX_ACTIVE_APPLICATIONS) {
      throw new AppError(
        'FORBIDDEN',
        `Batas ${MAX_ACTIVE_APPLICATIONS.toLocaleString('id-ID')} lamaran tercapai. Hapus lamaran lama terlebih dahulu.`,
      );
    }
    const { count } = await prisma.application.updateMany({
      where: { id: { in: ids }, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return count;
  }

  const { status } = input;
  return prisma.$transaction(async (tx) => {
    const targets = await tx.application.findMany({
      where: { id: { in: ids }, userId, deletedAt: null, status: { not: status } },
      select: { id: true, status: true },
    });
    if (targets.length === 0) return 0;
    await tx.application.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data: { status } });
    await tx.statusHistory.createMany({
      data: targets.map((t) => ({ applicationId: t.id, fromStatus: t.status, toStatus: status })),
    });
    return targets.length;
  });
}

/** Semua lamaran sesuai filter (maks. 2.000) untuk diekspor. */
export function forExport(userId: bigint, query: Parameters<typeof buildListQuery>[1], ids?: number[]) {
  const { where, orderBy } = buildListQuery(userId, query, ids);
  return prisma.application.findMany({ where, orderBy, take: MAX_ACTIVE_APPLICATIONS });
}
