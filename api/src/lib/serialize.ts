import type {
  AiGeneration as DbAiGeneration,
  Announcement as DbAnnouncement,
  Application as DbApplication,
  CvDocument as DbCvDocument,
  License as DbLicense,
  Purchase as DbPurchase,
  Task as DbTask,
  StatusHistory,
  User as DbUser,
} from '@prisma/client';
import type {
  AdminUser,
  AiGeneration,
  AtsCheck,
  InterviewPrep,
  Announcement,
  Application,
  ApplicationDetail,
  CvDocument,
  Purchase,
  Status,
  StatusHistoryEntry,
  Task,
  User,
} from '@wt/shared';

/** Date (kolom DATE, UTC midnight) → "YYYY-MM-DD". */
export const toISODate = (d: Date) => d.toISOString().slice(0, 10);
/** "YYYY-MM-DD" → Date UTC midnight untuk kolom DATE. */
export const fromISODate = (s: string) => new Date(`${s}T00:00:00Z`);

export function serializeUser(u: DbUser): User {
  return {
    id: Number(u.id),
    name: u.name,
    email: u.email,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    emailReminders: u.emailReminders,
    weeklyGoal: u.weeklyGoal,
    plan: u.plan,
    aiCredits: u.aiCredits,
    isDemo: u.isDemo,
    demoExpiresAt: u.demoExpiresAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeAdminUser(
  u: DbUser & { license: DbLicense | null; _count: { applications: number } },
  aiCreditsUsedThisMonth = 0,
): AdminUser {
  return {
    id: Number(u.id),
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    applicationCount: u._count.applications,
    plan: u.plan,
    aiCredits: u.aiCredits,
    aiCreditsUsedThisMonth,
    license: u.license
      ? {
          whatsapp: u.license.whatsapp,
          purchasedAt: toISODate(u.license.purchasedAt),
          price: u.license.price,
          notes: u.license.notes,
        }
      : null,
  };
}

type DbAppWithCv = DbApplication & { cv?: { id: bigint; label: string; archivedAt: Date | null } | null };

export function serializeApplication(a: DbAppWithCv): Application {
  return {
    id: Number(a.id),
    company: a.company,
    position: a.position,
    status: a.status,
    source: a.source,
    location: a.location,
    workType: a.workType,
    salaryMin: a.salaryMin,
    salaryMax: a.salaryMax,
    jobUrl: a.jobUrl,
    contactName: a.contactName,
    contactEmail: a.contactEmail,
    appliedAt: toISODate(a.appliedAt),
    nextActionDate: a.nextActionDate ? toISODate(a.nextActionDate) : null,
    nextActionNote: a.nextActionNote,
    notes: a.notes,
    jobDescription: a.jobDescription,
    cv: a.cv ? { id: Number(a.cv.id), label: a.cv.label, archived: a.cv.archivedAt !== null } : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function serializeHistory(h: StatusHistory): StatusHistoryEntry {
  return {
    id: Number(h.id),
    fromStatus: h.fromStatus as Status | null,
    toStatus: h.toStatus as Status,
    changedAt: h.changedAt.toISOString(),
  };
}

export function serializeCv(c: DbCvDocument & { _count?: { applications: number } }): CvDocument {
  return {
    id: Number(c.id),
    label: c.label,
    originalName: c.originalName,
    mimeType: c.mimeType,
    size: c.size,
    hasText: !!c.textContent,
    pageCount: c.pageCount,
    isDefault: c.isDefault,
    archived: c.archivedAt !== null,
    usedBy: c._count?.applications ?? 0,
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeApplicationDetail(a: DbAppWithCv & { history: StatusHistory[] }): ApplicationDetail {
  return {
    ...serializeApplication(a),
    history: a.history.map(serializeHistory),
  };
}

export function serializeTask(
  t: DbTask & { application: Pick<DbApplication, 'id' | 'company' | 'position'> | null },
): Task {
  return {
    id: Number(t.id),
    title: t.title,
    dueDate: t.dueDate ? toISODate(t.dueDate) : null,
    done: t.doneAt !== null,
    doneAt: t.doneAt?.toISOString() ?? null,
    applicationId: t.applicationId ? Number(t.applicationId) : null,
    application: t.application
      ? { id: Number(t.application.id), company: t.application.company, position: t.application.position }
      : null,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializeAnnouncement(a: DbAnnouncement, read?: boolean): Announcement {
  return {
    id: Number(a.id),
    title: a.title,
    body: a.body,
    level: a.level,
    published: a.published,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    ...(read !== undefined ? { read } : {}),
  };
}

export function serializeAiGeneration(g: DbAiGeneration): AiGeneration {
  return {
    id: Number(g.id),
    applicationId: g.applicationId ? Number(g.applicationId) : null,
    kind: g.kind,
    status: g.status,
    options: (g.options ?? {}) as Record<string, unknown>,
    content: g.content,
    prep: g.kind === 'interview_prep' ? ((g.contentJson as InterviewPrep | null) ?? null) : null,
    ats: g.kind === 'ats_check' ? ((g.contentJson as AtsCheck | null) ?? null) : null,
    editedContent: g.editedContent,
    rating: g.rating === 1 || g.rating === -1 ? g.rating : null,
    model: g.model,
    createdAt: g.createdAt.toISOString(),
  };
}
export function serializePurchase(p: DbPurchase): Purchase {
  return {
    id: Number(p.id),
    kind: p.kind,
    plan: p.plan,
    credits: p.credits,
    price: p.price,
    paidAt: toISODate(p.paidAt),
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}