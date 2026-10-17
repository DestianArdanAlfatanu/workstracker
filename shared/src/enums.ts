export const STATUSES = [
  'wishlist',
  'applied',
  'screening',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
] as const;
export type Status = (typeof STATUSES)[number];

export const ACTIVE_STATUSES: readonly Status[] = ['applied', 'screening', 'interview', 'offer'];
export const FINAL_STATUSES: readonly Status[] = ['accepted', 'rejected', 'withdrawn'];
/** Status yang dihitung sebagai "mendapat respons" (Screening atau lebih). */
export const RESPONDED_STATUSES: readonly Status[] = ['screening', 'interview', 'offer', 'accepted'];

export const STATUS_LABELS: Record<Status, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const SOURCES = [
  'linkedin',
  'jobstreet',
  'glints',
  'kalibrr',
  'dealls',
  'kitalulus',
  'loker_id',
  'indeed',
  'karirhub',
  'company_site',
  'instagram',
  'referral',
  'other',
] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  linkedin: 'LinkedIn',
  jobstreet: 'Jobstreet',
  glints: 'Glints',
  kalibrr: 'Kalibrr',
  dealls: 'Dealls',
  kitalulus: 'KitaLulus',
  loker_id: 'Loker.id',
  indeed: 'Indeed',
  karirhub: 'Karirhub Kemnaker',
  company_site: 'Situs perusahaan',
  instagram: 'Instagram',
  referral: 'Referral',
  other: 'Lainnya',
};

export const WORK_TYPES = ['onsite', 'hybrid', 'remote'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  onsite: 'Onsite',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export const SORT_FIELDS = ['applied_at', 'created_at', 'next_action_date', 'company'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const MAX_ACTIVE_APPLICATIONS = 2000;
export const PAGE_SIZE = 20;
