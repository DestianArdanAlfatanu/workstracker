import type { Source, Status, WorkType } from './enums';

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  emailReminders: boolean;
  weeklyGoal: number | null;
  aiEnabled: boolean;
  isDemo: boolean;
  demoExpiresAt: string | null;
  createdAt: string;
}

export interface LicenseInfo {
  whatsapp: string | null;
  purchasedAt: string;
  price: number | null;
  notes: string | null;
}

/** Baris pembeli di halaman admin (tanpa isi lamaran — hanya jumlahnya). */
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  applicationCount: number;
  license: LicenseInfo | null;
  aiEnabled: boolean;
  aiMonthlyLimit: number;
  aiUsedThisMonth: number;
}

export interface AdminCredentials {
  user: AdminUser;
  /** Password default — hanya dikirim sekali saat dibuat/di-reset. */
  tempPassword: string;
}

export interface AdminOverview {
  totalBuyers: number;
  active: number;
  suspended: number;
  revenueTotal: number;
  revenueThisMonth: number;
  salesThisMonth: number;
  aiGenerationsThisMonth: number;
  demosThisMonth: number;
  /** Estimasi biaya API AI bulan ini (USD). */
  aiCostThisMonthUsd: number;
  /** 12 bulan terakhir, urut dari terlama. */
  monthly: Array<{ month: string; sales: number; revenue: number }>;
}

export interface StatusHistoryEntry {
  id: number;
  fromStatus: Status | null;
  toStatus: Status;
  changedAt: string;
}

export interface Application {
  id: number;
  company: string;
  position: string;
  status: Status;
  source: Source;
  location: string | null;
  workType: WorkType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  jobUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  appliedAt: string;
  nextActionDate: string | null;
  nextActionNote: string | null;
  notes: string | null;
  jobDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDetail extends Application {
  history: StatusHistoryEntry[];
  attachments: Attachment[];
}

/** Perbandingan bulan berjalan vs bulan lalu. */
export interface MonthTrend {
  current: number;
  previous: number;
}

export interface MonthlyActivity {
  /** "YYYY-MM" */
  month: string;
  /** Lamaran (non-wishlist) dengan tanggal lamar di bulan ini. */
  applied: number;
  /** Dari lamaran tersebut, yang pernah mencapai Screening atau lebih. */
  responded: number;
}

export interface StatsSummary {
  total: number;
  active: number;
  interview: number;
  offer: number;
  accepted: number;
  rejected: number;
  responseRate: number;
  overdueCount: number;
  countsByStatus: Record<Status, number>;
  bySource: Record<Source, number>;
  weekly: WeeklyProgress;
  /** 12 bulan terakhir, urut dari terlama. */
  monthly: MonthlyActivity[];
  trends: {
    /** Lamaran baru (berdasarkan tanggal lamar). */
    applied: MonthTrend;
    /** Lamaran yang masuk ke status tersebut (dari riwayat status). */
    interview: MonthTrend;
    offer: MonthTrend;
    rejected: MonthTrend;
  };
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface Preferences {
  emailReminders: boolean;
  weeklyGoal: number | null;
}

export interface WeeklyProgress {
  /** Senin minggu berjalan (YYYY-MM-DD, Asia/Jakarta). */
  weekStart: string;
  weekEnd: string;
  goal: number | null;
  /** Lamaran (non-wishlist) dengan tanggal lamar di minggu ini. */
  count: number;
  /** 8 minggu terakhir termasuk minggu ini, urut dari terlama. */
  history: Array<{ weekStart: string; count: number }>;
}

export interface Task {
  id: number;
  title: string;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
  applicationId: number | null;
  application: { id: number; company: string; position: string } | null;
  createdAt: string;
}

export interface Attachment {
  id: number;
  applicationId: number;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export type CalendarEventType = 'applied' | 'next_action' | 'task';

export interface CalendarEvent {
  date: string;
  type: CalendarEventType;
  title: string;
  subtitle: string | null;
  applicationId: number | null;
  taskId: number | null;
  status: Status | null;
  done?: boolean;
}

export type AnnouncementLevel = 'info' | 'update' | 'promo';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  level: AnnouncementLevel;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  /** Hanya untuk pengguna: sudah dibaca/ditutup. */
  read?: boolean;
}

export interface BulkResult {
  count: number;
}

export interface CareerProfile {
  headline: string | null;
  summary: string | null;
  skills: string | null;
  experience: string | null;
  education: string | null;
  achievements: string | null;
  city: string | null;
  updatedAt: string | null;
  /** 0–100: seberapa lengkap profil untuk AI. */
  completeness: number;
}

export interface AiUsage {
  enabled: boolean;
  limit: number;
  usedThisMonth: number;
  /** Persetujuan pengiriman data ke penyedia AI dicatat di browser; info untuk UI. */
  model: string;
}

export interface InterviewQuestion {
  category: 'behavioral' | 'technical' | 'motivation' | 'situational';
  question: string;
  whyAsked: string;
  pointsToHighlight: string[];
  answerOutline: string[];
  avoid: string;
}

export interface InterviewPrep {
  overview: string;
  questions: InterviewQuestion[];
  questionsToAsk: string[];
  finalTips: string[];
}

export type AiGenerationKind = 'cover_letter' | 'interview_prep' | 'ats_check' | 'job_extract';

export interface AiGeneration {
  id: number;
  applicationId: number | null;
  kind: AiGenerationKind;
  status: 'completed' | 'failed' | 'refused';
  options: Record<string, unknown>;
  content: string | null;
  prep: InterviewPrep | null;
  ats: AtsCheck | null;
  editedContent: string | null;
  rating: 1 | -1 | null;
  model: string;
  createdAt: string;
}
export interface AtsRequirement {
  requirement: string;
  status: 'met' | 'partial' | 'missing';
  evidence: string;
  suggestion: string;
}

export interface AtsCheck {
  score: number;
  verdict: string;
  summary: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  requirements: AtsRequirement[];
  cvImprovements: string[];
  nextSteps: string[];
}

export interface JobExtract {
  company: string | null;
  position: string | null;
  location: string | null;
  workType: WorkType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  source: Source | null;
  jobDescription: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

export interface Insight {
  id: string;
  tone: 'positive' | 'warning' | 'info';
  title: string;
  detail: string;
}

export interface Insights {
  period: '30d' | '90d' | 'all';
  totalApplied: number;
  bySource: Array<{ source: Source; applied: number; responded: number; rate: number }>;
  funnel: Array<{ stage: 'applied' | 'screening' | 'interview' | 'offer' | 'accepted'; count: number }>;
  medianDaysToResponse: number | null;
  medianDaysToInterview: number | null;
  stale: number;
  insights: Insight[];
}