import type { AiGenerationKind, UserRole } from './types';

/**
 * Paket akses seumur hidup WorksTracker — satu sumber aturan untuk API & web.
 * Harga dalam rupiah (sekali bayar).
 */
export const PLAN_KEYS = ['basic', 'standard', 'premium'] as const;
export type Plan = (typeof PLAN_KEYS)[number];

/** Fitur yang dibatasi per paket. Dashboard, Lamaran, Pengaturan selalu tersedia. */
export const FEATURE_KEYS = [
  'calendar',
  'tasks',
  'insight',
  'share_card',
  'attachments',
  'reminders',
  'extension',
  'mobile_share',
  'ai',
] as const;
export type Feature = (typeof FEATURE_KEYS)[number];

export interface PlanInfo {
  key: Plan;
  name: string;
  price: number;
  tagline: string;
  /** Kredit AI yang didapat saat membeli/upgrade ke paket ini. */
  credits: number;
  features: readonly Feature[];
}

/** Kredit AI yang diberikan paket Premium. */
export const PREMIUM_CREDITS = 150;
/** Harga jual 1 kredit AI (rupiah) — dasar hitung harga Premium & isi ulang. */
export const CREDIT_PRICE = 400;
/**
 * Dasar hitung modal AI (dipakai ringkasan admin): kurs USD→IDR (sedikit di atas kurs pasar
 * sebagai cadangan) dan PPN 11% yang ditagih Google untuk akun Indonesia.
 */
export const COST_BASIS = { usdToIdr: 18_000, vat: 0.11 } as const;
/** Peringatan bila modal rata-rata per kredit melewati angka ini (margin menipis). */
export const CREDIT_COST_ALERT_IDR = 380;

/** Kredit untuk akun demo (hasil AI berupa contoh, tanpa biaya). */
export const DEMO_CREDITS = 50;

const STANDARD_FEATURES: readonly Feature[] = [
  'calendar',
  'tasks',
  'insight',
  'share_card',
  'attachments',
  'reminders',
  'extension',
  'mobile_share',
];

export const PLANS: Record<Plan, PlanInfo> = {
  basic: {
    key: 'basic',
    name: 'Basic',
    price: 24_999,
    tagline: 'Catat & pantau semua lamaran',
    credits: 0,
    features: [],
  },
  standard: {
    key: 'standard',
    name: 'Standar',
    price: 49_999,
    tagline: 'Semua alat untuk pencarian kerja yang rapi',
    credits: 0,
    features: STANDARD_FEATURES,
  },
  premium: {
    key: 'premium',
    name: 'Premium',
    price: 109_999,
    tagline: 'Semua fitur + AI Career Assistant',
    credits: PREMIUM_CREDITS,
    features: [...STANDARD_FEATURES, 'ai'],
  },
};

export const FEATURE_LABELS: Record<Feature, string> = {
  calendar: 'Kalender',
  tasks: 'Tugas',
  insight: 'Insight',
  share_card: 'Kartu progres',
  attachments: 'CV Saya',
  reminders: 'Email pengingat',
  extension: 'Chrome Extension',
  mobile_share: 'Bagikan loker dari HP',
  ai: 'AI Career Assistant',
};

/** Paket termurah yang membuka fitur tersebut. */
export function requiredPlan(feature: Feature): Plan {
  return PLAN_KEYS.find((p) => PLANS[p].features.includes(feature)) ?? 'premium';
}

/** Admin selalu punya akses penuh. */
export function hasFeature(plan: Plan, role: UserRole, feature: Feature): boolean {
  return role === 'admin' || PLANS[plan].features.includes(feature);
}

export const planRank = (plan: Plan) => PLAN_KEYS.indexOf(plan);

/** Harga upgrade = selisih harga paket. */
export function upgradePrice(from: Plan, to: Plan): number {
  return Math.max(0, PLANS[to].price - PLANS[from].price);
}

/**
 * Bobot kredit per fitur AI (Gemini 3.1 Pro). Isi otomatis dihitung per gambar poster
 * (atau 1 kredit untuk teks saja).
 */
export const AI_CREDIT_COST: Record<AiGenerationKind, number> = {
  job_extract: 1,
  cover_letter: 2,
  interview_prep: 4,
  ats_check: 4,
  profile_extract: 1,
};

export interface TopupPack {
  credits: number;
  price: number;
}

export const TOPUPS: readonly TopupPack[] = [
  { credits: 50, price: 19_999 },
  { credits: 100, price: 39_999 },
];

/** Maksimal gambar poster per isi otomatis (mis. post carousel Instagram). */
export const MAX_POSTER_IMAGES = 4;
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;
export const POSTER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

export function extractCost(imageCount: number): number {
  return AI_CREDIT_COST.job_extract * Math.max(1, imageCount);
}
