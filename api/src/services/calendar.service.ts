import { FINAL_STATUSES, type CalendarEvent, type CalendarQuery } from '@wt/shared';
import { prisma } from '../lib/prisma';
import { fromISODate, toISODate } from '../lib/serialize';

/** Gabungan tanggal lamar, jadwal tindak lanjut, dan tenggat tugas dalam rentang tanggal. */
export async function events(userId: bigint, { from, to }: CalendarQuery): Promise<CalendarEvent[]> {
  const range = { gte: fromISODate(from), lte: fromISODate(to) };
  const appBase = { userId, deletedAt: null };

  const [applied, nextActions, tasks] = await Promise.all([
    prisma.application.findMany({
      where: { ...appBase, appliedAt: range },
      select: { id: true, company: true, position: true, status: true, appliedAt: true },
    }),
    prisma.application.findMany({
      where: { ...appBase, nextActionDate: range, status: { notIn: [...FINAL_STATUSES] } },
      select: { id: true, company: true, position: true, status: true, nextActionDate: true, nextActionNote: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        dueDate: range,
        OR: [{ applicationId: null }, { application: { deletedAt: null } }],
      },
      select: { id: true, title: true, dueDate: true, doneAt: true, applicationId: true, application: { select: { company: true } } },
    }),
  ]);

  const out: CalendarEvent[] = [
    ...nextActions.map((a) => ({
      date: toISODate(a.nextActionDate!),
      type: 'next_action' as const,
      title: a.company,
      subtitle: a.nextActionNote || a.position,
      applicationId: Number(a.id),
      taskId: null,
      status: a.status,
    })),
    ...tasks.map((t) => ({
      date: toISODate(t.dueDate!),
      type: 'task' as const,
      title: t.title,
      subtitle: t.application?.company ?? null,
      applicationId: t.applicationId ? Number(t.applicationId) : null,
      taskId: Number(t.id),
      status: null,
      done: t.doneAt !== null,
    })),
    ...applied.map((a) => ({
      date: toISODate(a.appliedAt),
      type: 'applied' as const,
      title: a.company,
      subtitle: a.position,
      applicationId: Number(a.id),
      taskId: null,
      status: a.status,
    })),
  ];
  const order = { next_action: 0, task: 1, applied: 2 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);
}
