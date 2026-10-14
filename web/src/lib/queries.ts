import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AtsCheckOptionsInput,
  Insights,
  JobExtract,
  AdminAiInput,
  AiGeneration,
  AiGenerationUpdateInput,
  AiUsage,
  CareerProfile,
  CareerProfileInput,
  InterviewPrepOptionsInput,
  Announcement,
  AnnouncementInput,
  Attachment,
  BulkActionInput,
  BulkResult,
  CalendarEvent,
  PreferencesInput,
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

export function useUploadAttachment() {
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: async ({ applicationId, file }: { applicationId: number; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return (await api<Attachment>(`/applications/${applicationId}/attachments`, { method: 'POST', body: form })).data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAttachment() {
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: async (id: number) => {
      await api(`/attachments/${id}`, { method: 'DELETE' });
    },
    onSuccess: invalidate,
  });
}

export const downloadAttachment = (a: Pick<Attachment, 'id' | 'originalName'>) =>
  downloadFile(`/attachments/${a.id}/download`, undefined, a.originalName);

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

export function useSaveCareerProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CareerProfileInput) =>
      (await api<CareerProfile>('/me/career-profile', { method: 'PUT', body: input })).data,
    onSuccess: (data) => qc.setQueryData(aiKeys.profile, data),
  });
}

export function useAiUsage() {
  return useQuery({
    queryKey: aiKeys.usage,
    queryFn: async () => (await api<AiUsage>('/me/ai-usage')).data,
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

export const useSetBuyerAi = () =>
  useAdminMutation(async ({ id, input }: { id: number; input: AdminAiInput }) =>
    (await api<AdminUser>(`/admin/users/${id}/ai`, { method: 'PATCH', body: input })).data,
  );
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
    mutationFn: async (text: string) => (await api<JobExtract>('/ai/extract-job', { method: 'POST', body: { text } })).data,
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
