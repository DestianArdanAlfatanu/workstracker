import { todayISO } from '@wt/shared';

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const rupiahFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** "2026-10-13" → "13 Okt 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** Timestamp ISO → "13 Okt 2026, 14.05" (zona waktu lokal). */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

/** 8000000 → "Rp 8.000.000" */
export function formatRupiah(value: number | null | undefined): string {
  if (value == null) return '-';
  return `Rp ${rupiahFmt.format(value)}`;
}

export function formatSalaryRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return '-';
  if (min != null && max != null) return min === max ? formatRupiah(min) : `${formatRupiah(min)} – ${formatRupiah(max)}`;
  return min != null ? `≥ ${formatRupiah(min)}` : `≤ ${formatRupiah(max)}`;
}

/** Format angka saat mengetik di input gaji: "8000000" → "8.000.000". */
export function formatThousands(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits ? rupiahFmt.format(Number(digits)) : '';
}

export type DueState = 'overdue' | 'today' | 'upcoming';

export function dueState(iso: string | null): DueState | null {
  if (!iso) return null;
  const today = todayISO();
  if (iso < today) return 'overdue';
  if (iso === today) return 'today';
  return 'upcoming';
}
