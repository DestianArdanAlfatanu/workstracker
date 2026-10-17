import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AtsCheckOptionsInput,
  Insights,
  JobExtract,
  AdminCreditsInput,
  AdminPlanInput,
  Purchase,
  AiGeneration,
  AiGenerationUpdateInput,
  AiUsage,
  CareerProfile,
  CareerProfileInput,
  InterviewPrepOptionsInput,
  Announcement,
  AnnouncementInput,
  CareerProfileDraft,
  CvDocument,
  CvUpdateInput,
  BulkActionInput,
  BulkResult,
  CalendarEvent,
  ImportCommitInput,
  ImportCommitResult,
  ImportParseResult,
  PreferencesInput,
  ShareResolveResult,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  AdminCreateUserInput,
  AdminCredentials,
  AdminOverview,
  AdminUpdateUserInput,
  AdminUser,
  Application,
  ApplicationCreateInput,
  ApplicationDetail,
  ProfileUpdateInput,
  Source,
  StatsSummary,
  Status,
  User,
} from '@wt/shared';
import { api, downloadFile } from './api';

export interface ListParams {
  q?: string;
  status?: Status[];
  source?: Source[];
  sort?: string;
  page?: number;
  limit?: number;
}

export const keys = {
  applications: ['applications'] as const,
  list: (p: ListParams) => ['applications', 'list', p] as const,
  detail: (id: number) => ['applications', 'detail', id] as const,
  upcoming: (limit: number) => ['applications', 'upcoming', limit] as const,
  stats: ['stats'] as const,
};

export function useApplications(params: ListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api<Application[]>('/applications', { query: { ...params } }),
    placeholderData: keepPreviousData,
  });
}

export function useApplication(id: number | null) {
  return useQuery({
    queryKey: keys.detail(id ?? 0),
    queryFn: async () => (await api<ApplicationDetail>(`/applications/${id}`)).data,
    enabled: id != null,
  });
}

export function useUpcoming(limit = 5) {
  return useQuery({
    queryKey: keys.upcoming(limit),
    queryFn: async () => (await api<Application[]>('/applications/upcoming', { query: { limit } })).data,
  });
}

export function useStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: async () => (await api<StatsSummary>('/stats/summary')).data,
  });
}

/** Setelah perubahan lamaran: segarkan daftar, detail, jadwal, dan statistik. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.applications }),
      qc.invalidateQueries({ queryKey: keys.stats }),
      qc.invalidateQueries({ queryKey: ['tasks'] }),
      qc.invalidateQueries({ queryKey: ['calendar'] }),
    ]);
}

export function useCreateApplication() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: ApplicationCreateInput) =>
      (await api<Application>('/applications', { method: 'POST', body: input })).data,
    onSuccess: invalidate,
  });
}

export function useUpdateApplication() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<ApplicationCreateInput> }) =>
      (await api<Application>(`/applications/${id}`, { method: 'PATCH', body: input })).data,
    onSuccess: invalidate,
  });
}

export function useChangeStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Status }) =>
      (await api<Application>(`/applications/${id}/status`, { method: 'PATCH', body: { status } })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteApplication() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      await api(`/applications/${id}`, { method: 'DELETE' });
    },
    onSuccess: invalidate,
  });
}

export function useRestoreApplication() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api<Application>(`/applications/${id}/restore`, { method: 'POST' })).data,
    onSuccess: invalidate,
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) =>
      (await api<User>('/me', { method: 'PATCH', body: input })).data,
  });
}

/* ---------------------------- Admin ---------------------------- */

export interface AdminListParams {
  q?: string;
  status?: 'active' | 'suspended';
  page?: number;
  limit?: number;
}

const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  users: (p: AdminListParams) => ['admin', 'users', p] as const,
};

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: async () => (await api<AdminOverview>('/admin/overview')).data,
  });
}

export function useAdminUsers(params: AdminListParams) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => api<AdminUser[]>('/admin/users', { query: { ...params } }),
    placeholderData: keepPreviousData,
  });
}

function useAdminMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export const useCreateBuyer = () =>
  useAdminMutation(async (input: AdminCreateUserInput) =>
    (await api<AdminCredentials>('/admin/users', { method: 'POST', body: input })).data,
  );

export const useUpdateBuyer = () =>
  useAdminMutation(async ({ id, input }: { id: number; input: AdminUpdateUserInput }) =>
    (await api<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: input })).data,
  );

export const useResetBuyerPassword = () =>
  useAdminMutation(async (id: number) =>
    (await api<AdminCredentials>(`/admin/users/${id}/reset-password`, { method: 'POST' })).data,
  );

export const useSetBuyerStatus = () =>
  useAdminMutation(async ({ id, action }: { id: number; action: 'suspend' | 'activate' }) =>
    (await api<AdminUser>(`/admin/users/${id}/${action}`, { method: 'POST' })).data,
  );

export const useDeleteBuyer = () =>
  useAdminMutation(async (id: number) => {
    await api(`/admin/users/${id}`, { method: 'DELETE' });
  });
/* ------------------------ Fitur lanjutan ------------------------ */

const taskKeys = { all: ['tasks'] as const, list: (p: object) => ['tasks', p] as const };
const calendarKey = (from: string, to: string) => ['calendar', from, to] as const;
const announcementKeys = { user: ['announcements'] as const, admin: ['admin', 'announcements'] as const };

/** Perubahan lamaran/tugas memengaruhi daftar, statistik, kalender, dan tugas. */
function useInvalidateWork() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.applications }),
      qc.invalidateQueries({ queryKey: keys.stats }),
      qc.invalidateQueries({ queryKey: taskKeys.all }),
      qc.invalidateQueries({ queryKey: ['calendar'] }),
    ]);
}

export function useBulkAction() {
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: async (input: BulkActionInput) =>
      (await api<BulkResult>('/applications/bulk', { method: 'POST', body: input })).data,
    onSuccess: invalidate,
  });
}

/* ------------------------ Share Target & push (PWA) ------------------------ */

/** Lamaran dengan link yang sama (cek duplikat sebelum menyimpan loker yang dibagikan). */
export function useJobLookup(url: string | null) {
  return useQuery({
    queryKey: ['applications', 'lookup', url],
    queryFn: async () =>
      (await api<{ id: number; company: string; position: string; status: Status } | null>('/applications/lookup', { query: { url: url! } })).data,
    enabled: !!url && url.length >= 8,
    staleTime: 0,
  });
}

/** Baca judul/info lowongan dari halaman portal loker yang dikenal (tanpa AI). */
export function useShareResolve(url: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['share', 'resolve', url],
    queryFn: async () => (await api<ShareResolveResult>('/share/resolve', { method: 'POST', body: { url } })).data,
    enabled: enabled && !!url,
    staleTime: Infinity,
    retry: false,
  });
}

export interface PushInfo {
  publicKey: string | null;
  configured: boolean;
  devices: number;
}

const pushKey = ['push', 'key'] as const;

export function usePushInfo(enabled = true) {
  return useQuery({ queryKey: pushKey, queryFn: async () => (await api<PushInfo>('/push/key')).data, enabled });
}

export function useSavePushSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sub: PushSubscriptionJSON) =>
      (await api<{ devices: number }>('/push/subscriptions', { method: 'POST', body: sub })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: pushKey }),
  });
}

export function useDeletePushSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (endpoint: string) => {
      await api('/push/subscriptions', { method: 'DELETE', body: { endpoint } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pushKey }),
  });
}

export function useTestPush() {
  return useMutation({
    mutationFn: async () => (await api<{ delivered: number }>('/push/test', { method: 'POST' })).data,
  });
}

/* -------------------------------- Impor -------------------------------- */

/** Baca file XLSX/CSV di server (tanpa disimpan) → judul kolom, baris, dan tebakan pemetaan. */
export async function parseImportFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await api<ImportParseResult>('/applications/import/parse', { method: 'POST', body: form })).data;
}

/** Kirim satu batch impor (atau cek saja dengan `dryRun`). */
export async function commitImport(input: ImportCommitInput) {
  return (await api<ImportCommitResult>('/applications/import', { method: 'POST', body: input })).data;
}

export const downloadImportTemplate = () =>
  downloadFile('/applications/import/template', undefined, 'template-impor-workstracker.xlsx');

/** Segarkan daftar lamaran, statistik, dll. setelah impor selesai. */
export function useRefreshWork() {
  return useInvalidateWork();
}

export function exportApplications(params: Omit<ListParams, 'page' | 'limit'> & { format: 'csv' | 'xlsx'; ids?: number[] }) {
  const { ids, ...rest } = params;
  return downloadFile('/applications/export', { ...rest, ids: ids?.map(String) }, `lamaran.${params.format}`);
}

export function useTasks(params: { status?: 'open' | 'done' | 'all'; applicationId?: number } = {}) {
  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: async () => (await api<Task[]>('/tasks', { query: { ...params } })).data,
  });
}

export function useCreateTask() {
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: async (input: TaskCreateInput) => (await api<Task>('/tasks', { method: 'POST', body: input })).data,
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: TaskUpdateInput }) =>
      (await api<Task>(`/tasks/${id}`, { method: 'PATCH', body: input })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: async (id: number) => {
      await api(`/tasks/${id}`, { method: 'DELETE' });
    },
    onSuccess: invalidate,
  });
}

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: calendarKey(from, to),
    queryFn: async () => (await api<CalendarEvent[]>('/calendar', { query: { from, to } })).data,
    placeholderData: keepPreviousData,
  });
}

/* ------------------------------ CV Saya ------------------------------ */

const cvKeys = { all: ['cvs'] as const };

/** CV aktif + CV arsip yang masih dipakai lamaran. `enabled` false untuk paket tanpa fitur CV. */
export function useCvs(enabled = true) {
  return useQuery({
    queryKey: cvKeys.all,
    queryFn: async () => (await api<CvDocument[]>('/cvs')).data,
    enabled,
  });
}

/** Setelah CV berubah: segarkan daftar CV & lamaran (label/arsip ikut tampil di lamaran). */
function useInvalidateCvs() {
  const qc = useQueryClient();
  const invalidateWork = useInvalidateWork();
  return () => Promise.all([qc.invalidateQueries({ queryKey: cvKeys.all }), invalidateWork()]);
}

export function useUploadCv() {
  const invalidate = useInvalidateCvs();
  return useMutation({
    mutationFn: async ({ file, label }: { file: File; label: string }) => {
      const form = new FormData();
      form.append('label', label);
      form.append('file', file);
      return (await api<CvDocument>('/cvs', { method: 'POST', body: form })).data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCv() {
  const invalidate = useInvalidateCvs();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: CvUpdateInput }) =>
      (await api<CvDocument>(`/cvs/${id}`, { method: 'PATCH', body: input })).data,
    onSuccess: invalidate,
  });
}

export function useReplaceCv() {
  const invalidate = useInvalidateCvs();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return (await api<CvDocument>(`/cvs/${id}/replace`, { method: 'POST', body: form })).data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCv() {
  const invalidate = useInvalidateCvs();
  return useMutation({
    mutationFn: async (id: number) => (await api<{ archived: boolean }>(`/cvs/${id}`, { method: 'DELETE' })).data,
    onSuccess: invalidate,
  });
}

export const downloadCv = (cv: { id: number; label: string }) => downloadFile(`/cvs/${cv.id}/download`, undefined, cv.label);

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PreferencesInput) =>
      (await api<User>('/me/preferences', { method: 'PATCH', body: input })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.stats }),
  });
}

export function useSendTestReminder() {
  return useMutation({
    mutationFn: async () =>
      (await api<{ sent: boolean; previewMode: boolean; total: number }>('/me/reminder-test', { method: 'POST' })).data,
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: announcementKeys.user,
    queryFn: async () => (await api<Announcement[]>('/announcements')).data,
    staleTime: 5 * 60_000,
  });
}

export function useMarkAnnouncementRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api(`/announcements/${id}/read`, { method: 'POST' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: announcementKeys.user }),
  });
}

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: announcementKeys.admin,
    queryFn: async () => (await api<Announcement[]>('/admin/announcements')).data,
  });
}

function useAnnouncementMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: announcementKeys.admin }),
        qc.invalidateQueries({ queryKey: announcementKeys.user }),
      ]),
  });
}

export const useCreateAnnouncement = () =>
  useAnnouncementMutation(async (input: AnnouncementInput) =>
    (await api<Announcement>('/admin/announcements', { method: 'POST', body: input })).data,
  );

export const useUpdateAnnouncement = () =>
  useAnnouncementMutation(async ({ id, input }: { id: number; input: Partial<AnnouncementInput> }) =>
    (await api<Announcement>(`/admin/announcements/${id}`, { method: 'PATCH', body: input })).data,
  );

export const useDeleteAnnouncement = () =>
  useAnnouncementMutation(async (id: number) => {
    await api(`/admin/announcements/${id}`, { method: 'DELETE' });
  });
/* ------------------------- AI Career Assistant ------------------------- */

const aiKeys = {
  profile: ['ai', 'profile'] as const,
  usage: ['ai', 'usage'] as const,
  generations: (applicationId: number) => ['ai', 'generations', applicationId] as const,
};

export function useCareerProfile() {
  return useQuery({
    queryKey: aiKeys.profile,
    queryFn: async () => (await api<CareerProfile>('/me/career-profile')).data,
  });
}

/** AI: isi Profil Karier dari CV (draf, belum disimpan). */
export function useProfileFromCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cvId: number) =>
      (await api<CareerProfileDraft>('/ai/profile-from-cv', { method: 'POST', body: { cvId } })).data,
    onSettled: () => qc.invalidateQueries({ queryKey: aiKeys.usage }),
  });
}

export function useSaveCareerProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CareerProfileInput) =>
      (await api<CareerProfile>('/me/career-profile', { method: 'PUT', body: input })).data,
    onSuccess: (data) => qc.setQueryData(aiKeys.profile, data),
  });
}

export function useAiUsage(enabled = true) {
  return useQuery({
    queryKey: aiKeys.usage,
    queryFn: async () => (await api<AiUsage>('/me/ai-usage')).data,
    enabled,
  });
}

export function useGenerations(applicationId: number | null) {
  return useQuery({
    queryKey: aiKeys.generations(applicationId ?? 0),
    queryFn: async () => (await api<AiGeneration[]>(`/applications/${applicationId}/ai/generations`)).data,
    enabled: applicationId != null,
  });
}

/** Setelah generasi selesai: segarkan riwayat & kuota. */
export function useRefreshAi() {
  const qc = useQueryClient();
  return (applicationId: number) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: aiKeys.generations(applicationId) }),
      qc.invalidateQueries({ queryKey: aiKeys.usage }),
    ]);
}

export function useGenerateInterviewPrep() {
  const refresh = useRefreshAi();
  return useMutation({
    mutationFn: async ({ applicationId, input }: { applicationId: number; input: InterviewPrepOptionsInput }) =>
      (await api<AiGeneration>(`/applications/${applicationId}/ai/interview-prep`, { method: 'POST', body: input })).data,
    onSettled: (_d, _e, vars) => refresh(vars.applicationId),
  });
}

export function useUpdateGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: AiGenerationUpdateInput }) =>
      (await api<AiGeneration>(`/ai/generations/${id}`, { method: 'PATCH', body: input })).data,
    onSuccess: (g) => qc.invalidateQueries({ queryKey: aiKeys.generations(g.applicationId ?? 0) }),
  });
}

export function useDeleteGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; applicationId: number }) => {
      await api(`/ai/generations/${id}`, { method: 'DELETE' });
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: aiKeys.generations(vars.applicationId) }),
  });
}

export function useCreatePracticeTasks() {
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: async ({ id, questionIndexes }: { id: number; questionIndexes: number[] }) =>
      (await api<{ count: number }>(`/ai/generations/${id}/tasks`, { method: 'POST', body: { questionIndexes } })).data,
    onSuccess: invalidate,
  });
}

export const useSetBuyerPlan = () =>
  useAdminMutation(async ({ id, input }: { id: number; input: AdminPlanInput }) =>
    (await api<AdminUser>(`/admin/users/${id}/plan`, { method: 'PATCH', body: input })).data,
  );

export const useAddBuyerCredits = () =>
  useAdminMutation(async ({ id, input }: { id: number; input: AdminCreditsInput }) =>
    (await api<AdminUser>(`/admin/users/${id}/credits`, { method: 'POST', body: input })).data,
  );

export function useBuyerPurchases(id: number | null) {
  return useQuery({
    queryKey: [...adminKeys.all, 'purchases', id],
    queryFn: async () => (await api<Purchase[]>(`/admin/users/${id}/purchases`)).data,
    enabled: id != null,
  });
}
/* ---------------------- Insight, ATS, isi otomatis ---------------------- */

export function useInsights(period: Insights['period']) {
  return useQuery({
    queryKey: ['insights', period],
    queryFn: async () => (await api<Insights>('/stats/insights', { query: { period } })).data,
    placeholderData: keepPreviousData,
  });
}

export function useAtsCheck() {
  const refresh = useRefreshAi();
  return useMutation({
    mutationFn: async ({ applicationId, input }: { applicationId: number; input: AtsCheckOptionsInput }) =>
      (await api<AiGeneration>(`/applications/${applicationId}/ai/ats-check`, { method: 'POST', body: input })).data,
    onSettled: (_d, _e, vars) => refresh(vars.applicationId),
  });
}

export function useExtractJob() {
  const qc = useQueryClient();
  return useMutation({
    /** Teks lowongan dan/atau gambar poster (multipart). */
    mutationFn: async ({ text, images = [] }: { text?: string; images?: Blob[] }) => {
      if (images.length === 0) return (await api<JobExtract>('/ai/extract-job', { method: 'POST', body: { text } })).data;
      const form = new FormData();
      if (text) form.append('text', text);
      images.forEach((img, i) => form.append('images', img, `poster-${i + 1}.${img.type.split('/')[1] ?? 'jpg'}`));
      return (await api<JobExtract>('/ai/extract-job', { method: 'POST', body: form })).data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ai', 'usage'] }),
  });
}
/* ------------------------------ Integrasi ------------------------------ */

export interface IntegrationStatus {
  ai: { configured: boolean; fake: boolean; model: string };
  email: { configured: boolean; host: string | null; port: number; from: string; missingPassword: boolean };
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: async () => (await api<IntegrationStatus>('/admin/integrations')).data,
  });
}

export function useTestAi() {
  return useMutation({
    mutationFn: async () =>
      (await api<{ ok: boolean; error?: string; model?: string; reply?: string; latencyMs?: number }>('/admin/integrations/ai-test', { method: 'POST' })).data,
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: async () =>
      (await api<{ ok: boolean; error?: string; to?: string; previewMode?: boolean }>('/admin/integrations/email-test', { method: 'POST' })).data,
  });
}
