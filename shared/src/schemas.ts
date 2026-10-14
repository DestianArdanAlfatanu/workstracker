import { z } from 'zod';
import { SORT_FIELDS, SOURCES, STATUSES, WORK_TYPES } from './enums';
import { isValidISODate, todayISO } from './dates';

const trimOrNull = (v: unknown) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t === '' ? null : t;
};

const optionalText = (max: number, label: string) =>
  z.preprocess(trimOrNull, z.string().max(max, `${label} maksimal ${max} karakter`).nullish());

const requiredText = (max: number, label: string) =>
  z
    .string({ required_error: `${label} wajib diisi`, invalid_type_error: `${label} wajib diisi` })
    .trim()
    .min(1, `${label} wajib diisi`)
    .max(max, `${label} maksimal ${max} karakter`);

const isoDate = (label: string) =>
  z
    .string({ required_error: `${label} wajib diisi`, invalid_type_error: `${label} wajib diisi` })
    .min(1, `${label} wajib diisi`)
    .refine(isValidISODate, `${label} tidak valid`);

const optionalIsoDate = (label: string) =>
  z.preprocess(trimOrNull, z.string().refine(isValidISODate, `${label} tidak valid`).nullish());

/** Menerima angka atau teks seperti "8.000.000" / "Rp 8.000.000". */
const salary = (label: string) =>
  z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v !== 'string') return v;
      const digits = v.replace(/\D/g, '');
      return digits === '' ? null : Number(digits);
    },
    z
      .number({ invalid_type_error: `${label} harus berupa angka` })
      .int(`${label} harus bilangan bulat`)
      .min(0, `${label} tidak boleh negatif`)
      .max(4_294_967_295, `${label} terlalu besar`)
      .nullish(),
  );

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const applicationBase = z.object({
  company: requiredText(150, 'Perusahaan'),
  position: requiredText(150, 'Posisi'),
  appliedAt: isoDate('Tanggal lamar'),
  status: z.enum(STATUSES, { errorMap: () => ({ message: 'Status tidak valid' }) }).default('applied'),
  source: z.enum(SOURCES, { errorMap: () => ({ message: 'Sumber tidak valid' }) }).default('other'),
  location: optionalText(120, 'Lokasi'),
  workType: z.preprocess(
    trimOrNull,
    z.enum(WORK_TYPES, { errorMap: () => ({ message: 'Tipe kerja tidak valid' }) }).nullish(),
  ),
  salaryMin: salary('Gaji min'),
  salaryMax: salary('Gaji maks'),
  jobUrl: z.preprocess(
    trimOrNull,
    z
      .string()
      .max(500, 'URL maksimal 500 karakter')
      .url('URL lowongan tidak valid')
      .refine((u) => /^https?:\/\//i.test(u), 'URL harus diawali http:// atau https://')
      .nullish(),
  ),
  contactName: optionalText(100, 'Nama kontak'),
  contactEmail: z.preprocess(
    trimOrNull,
    z.string().max(191, 'Email maksimal 191 karakter').email('Email kontak tidak valid').nullish(),
  ),
  nextActionDate: optionalIsoDate('Tanggal tindak lanjut'),
  nextActionNote: optionalText(255, 'Catatan tindak lanjut'),
  notes: optionalText(5000, 'Catatan'),
  jobDescription: optionalText(20000, 'Deskripsi lowongan'),
});

type SalaryAndDate = {
  appliedAt?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
};

export function checkApplicationRules(v: SalaryAndDate, ctx: z.RefinementCtx) {
  if (v.salaryMin != null && v.salaryMax != null && v.salaryMax < v.salaryMin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['salaryMax'],
      message: 'Gaji maks harus ≥ gaji min',
    });
  }
  if (v.appliedAt && isValidISODate(v.appliedAt) && v.appliedAt > todayISO()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['appliedAt'],
      message: 'Tanggal lamar tidak boleh di masa depan',
    });
  }
}

export const applicationCreateSchema = applicationBase.superRefine(checkApplicationRules);
export const applicationUpdateSchema = applicationBase.partial().superRefine(checkApplicationRules);

export type ApplicationCreateInput = z.input<typeof applicationCreateSchema>;
export type ApplicationCreate = z.output<typeof applicationCreateSchema>;
export type ApplicationUpdate = z.output<typeof applicationUpdateSchema>;

export const statusUpdateSchema = z.object({
  status: z.enum(STATUSES, { errorMap: () => ({ message: 'Status tidak valid' }) }),
});

const csvEnum = <T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.preprocess(
    (v) => {
      if (v === undefined || v === '') return undefined;
      const arr = Array.isArray(v) ? v : String(v).split(',');
      return arr.map((s) => String(s).trim()).filter(Boolean);
    },
    z.array(z.enum(values, { errorMap: () => ({ message: `${label} tidak valid` }) })).optional(),
  );

export const listQuerySchema = z.object({
  q: z.preprocess(trimOrNull, z.string().max(150).nullish()),
  status: csvEnum(STATUSES, 'Status'),
  source: csvEnum(SOURCES, 'Sumber'),
  sort: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(new RegExp(`^(${SORT_FIELDS.join('|')}):(asc|desc)$`), 'Urutan tidak valid')
      .default('applied_at:desc'),
  ),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  // Maks besar agar tampilan board bisa memuat semua lamaran (batas 2.000 per pengguna).
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(2000).default(20)),
});
export type ListQuery = z.output<typeof listQuerySchema>;

export const upcomingQuerySchema = z.object({
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(5)),
});

const email = z
  .string({ required_error: 'Email wajib diisi' })
  .trim()
  .toLowerCase()
  .min(1, 'Email wajib diisi')
  .max(191, 'Email maksimal 191 karakter')
  .email('Format email tidak valid');

const newPassword = z
  .string({ required_error: 'Password wajib diisi' })
  .min(8, 'Password minimal 8 karakter')
  .max(72, 'Password maksimal 72 karakter');

/** Normalisasi nomor WhatsApp Indonesia ke format 62xxxxxxxxxx. */
export function normalizeWhatsapp(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return digits;
}

const whatsapp = z.preprocess(
  (v) => {
    const t = trimOrNull(v);
    return typeof t === 'string' ? normalizeWhatsapp(t) : t;
  },
  z
    .string()
    .regex(/^\d{9,15}$/, 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)')
    .nullish(),
);

const licenseFields = {
  whatsapp,
  purchasedAt: isoDate('Tanggal beli').refine((d) => d <= todayISO(), 'Tanggal beli tidak boleh di masa depan'),
  price: salary('Harga'),
  notes: optionalText(2000, 'Catatan'),
};

export const adminCreateUserSchema = z.object({
  name: requiredText(100, 'Nama'),
  email,
  ...licenseFields,
});
export type AdminCreateUserInput = z.input<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z
  .object({ name: requiredText(100, 'Nama'), email, ...licenseFields })
  .partial();
export type AdminUpdateUserInput = z.input<typeof adminUpdateUserSchema>;

export const adminListQuerySchema = z.object({
  q: z.preprocess(trimOrNull, z.string().max(191).nullish()),
  status: z.preprocess(emptyToUndefined, z.enum(['active', 'suspended']).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(20)),
});
export type AdminListQuery = z.output<typeof adminListQuerySchema>;

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const profileUpdateSchema = z
  .object({
    name: requiredText(100, 'Nama').optional(),
    currentPassword: z.preprocess(emptyToUndefined, z.string().optional()),
    newPassword: z.preprocess(emptyToUndefined, newPassword.optional()),
  })
  .superRefine((v, ctx) => {
    if (v.newPassword && !v.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentPassword'],
        message: 'Password saat ini wajib diisi',
      });
    }
    if (v.name === undefined && v.newPassword === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Tidak ada perubahan untuk disimpan',
      });
    }
  });
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

/* ----------------------- Fitur lanjutan ----------------------- */

export const preferencesSchema = z
  .object({
    emailReminders: z.boolean({ invalid_type_error: 'Nilai tidak valid' }),
    weeklyGoal: z.preprocess(
      (v) => (v === '' ? null : v),
      z.coerce
        .number({ invalid_type_error: 'Target harus berupa angka' })
        .int('Target harus bilangan bulat')
        .min(1, 'Target minimal 1 lamaran')
        .max(200, 'Target maksimal 200 lamaran per minggu')
        .nullable(),
    ),
  })
  .partial();
export type PreferencesInput = z.input<typeof preferencesSchema>;

const idSchema = z.coerce.number().int().positive();

export const taskCreateSchema = z.object({
  title: requiredText(200, 'Judul tugas'),
  dueDate: optionalIsoDate('Tenggat'),
  applicationId: z.preprocess((v) => (v === '' ? null : v), idSchema.nullish()),
});
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  done: z.boolean().optional(),
});
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

export const taskListQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['open', 'done', 'all']).default('open')),
  applicationId: z.preprocess(emptyToUndefined, idSchema.optional()),
});
export type TaskListQuery = z.output<typeof taskListQuerySchema>;

export const bulkActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
    ids: z.array(idSchema).min(1, 'Pilih minimal satu lamaran').max(500),
    status: z.enum(STATUSES, { errorMap: () => ({ message: 'Status tidak valid' }) }),
  }),
  z.object({ action: z.literal('delete'), ids: z.array(idSchema).min(1, 'Pilih minimal satu lamaran').max(500) }),
  z.object({ action: z.literal('restore'), ids: z.array(idSchema).min(1).max(500) }),
]);
export type BulkActionInput = z.input<typeof bulkActionSchema>;

export const exportQuerySchema = listQuerySchema.omit({ page: true, limit: true }).extend({
  format: z.preprocess(emptyToUndefined, z.enum(['csv', 'xlsx']).default('xlsx')),
  ids: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : String(v).split(',')),
    z.array(idSchema).max(2000).optional(),
  ),
});
export type ExportQuery = z.output<typeof exportQuerySchema>;

export const calendarQuerySchema = z
  .object({ from: isoDate('Tanggal awal'), to: isoDate('Tanggal akhir') })
  .refine((v) => v.from <= v.to, { message: 'Rentang tanggal tidak valid', path: ['to'] })
  .refine(
    (v) => (new Date(v.to).getTime() - new Date(v.from).getTime()) / 86_400_000 <= 62,
    { message: 'Rentang maksimal 62 hari', path: ['to'] },
  );
export type CalendarQuery = z.output<typeof calendarQuerySchema>;

export const announcementSchema = z.object({
  title: requiredText(150, 'Judul'),
  body: requiredText(5000, 'Isi pengumuman'),
  level: z.enum(['info', 'update', 'promo'], { errorMap: () => ({ message: 'Jenis tidak valid' }) }).default('info'),
  published: z.boolean().default(false),
});
export type AnnouncementInput = z.input<typeof announcementSchema>;
export const announcementUpdateSchema = announcementSchema.partial();

/** Lampiran: tipe & ukuran yang diizinkan (dipakai API dan UI). */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_APPLICATION = 10;
export const ATTACHMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/* ----------------------- AI Career Assistant ----------------------- */

export const AI_LANGUAGES = ['id', 'en'] as const;
export const AI_TONES = ['formal', 'semi_formal', 'enthusiastic'] as const;
export const AI_LENGTHS = ['short', 'medium', 'long'] as const;
export const INTERVIEW_FOCUSES = ['mixed', 'behavioral', 'technical', 'hr'] as const;

export const careerProfileSchema = z.object({
  headline: optionalText(150, 'Headline'),
  summary: optionalText(3000, 'Ringkasan'),
  skills: optionalText(3000, 'Skill'),
  experience: optionalText(10000, 'Pengalaman'),
  education: optionalText(3000, 'Pendidikan'),
  achievements: optionalText(5000, 'Pencapaian'),
  city: optionalText(100, 'Kota'),
});
export type CareerProfileInput = z.input<typeof careerProfileSchema>;

const cvAttachmentId = z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullish());

export const coverLetterOptionsSchema = z.object({
  language: z.enum(AI_LANGUAGES).default('id'),
  tone: z.enum(AI_TONES).default('formal'),
  length: z.enum(AI_LENGTHS).default('medium'),
  cvAttachmentId,
  extraNotes: optionalText(1000, 'Catatan tambahan'),
});
export type CoverLetterOptions = z.output<typeof coverLetterOptionsSchema>;
export type CoverLetterOptionsInput = z.input<typeof coverLetterOptionsSchema>;

export const interviewPrepOptionsSchema = z.object({
  language: z.enum(AI_LANGUAGES).default('id'),
  focus: z.enum(INTERVIEW_FOCUSES).default('mixed'),
  questionCount: z.coerce.number().int().min(5, 'Minimal 5 pertanyaan').max(15, 'Maksimal 15 pertanyaan').default(10),
  cvAttachmentId,
});
export type InterviewPrepOptions = z.output<typeof interviewPrepOptionsSchema>;
export type InterviewPrepOptionsInput = z.input<typeof interviewPrepOptionsSchema>;

export const aiGenerationUpdateSchema = z
  .object({
    editedContent: z.preprocess(trimOrNull, z.string().max(20000).nullish()),
    rating: z.union([z.literal(1), z.literal(-1), z.null()]),
  })
  .partial();
export type AiGenerationUpdateInput = z.input<typeof aiGenerationUpdateSchema>;

export const generationTasksSchema = z.object({
  questionIndexes: z.array(z.number().int().min(0).max(30)).min(1, 'Pilih minimal satu pertanyaan').max(15),
});

export const adminAiSchema = z
  .object({
    aiEnabled: z.boolean(),
    aiMonthlyLimit: z.coerce.number().int().min(0).max(1000),
  })
  .partial();
export type AdminAiInput = z.input<typeof adminAiSchema>;
export const atsCheckOptionsSchema = z.object({
  language: z.enum(AI_LANGUAGES).default('id'),
  cvAttachmentId,
});
export type AtsCheckOptionsInput = z.input<typeof atsCheckOptionsSchema>;

export const jobExtractSchema = z.object({
  text: z
    .string({ required_error: 'Teks lowongan wajib diisi' })
    .trim()
    .min(80, 'Tempel teks lowongan yang lebih lengkap (minimal 80 karakter)')
    .max(20000, 'Teks lowongan maksimal 20.000 karakter'),
});

export const insightsQuerySchema = z.object({
  period: z.preprocess(emptyToUndefined, z.enum(['30d', '90d', 'all']).default('90d')),
});

/* ---------------------------- Lupa password ---------------------------- */

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

const resetToken = z
  .string({ required_error: 'Link reset tidak valid' })
  .trim()
  .regex(/^[A-Za-z0-9_-]{20,100}$/, 'Link reset tidak valid');

export const resetTokenSchema = z.object({ token: resetToken });

export const resetPasswordSchema = z.object({
  token: resetToken,
  newPassword,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
