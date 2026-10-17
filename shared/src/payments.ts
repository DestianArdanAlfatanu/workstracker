/** Pembayaran otomatis (Midtrans Snap): beli akun baru, upgrade paket, isi ulang kredit AI. */
import { z } from 'zod';
import { PLAN_KEYS, TOPUPS, type Plan } from './plans';

export const PAYMENT_KINDS = ['new_account', 'upgrade', 'topup'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_STATUSES = ['pending', 'paid', 'expired', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Menunggu pembayaran',
  paid: 'Lunas',
  expired: 'Kedaluwarsa',
  failed: 'Gagal',
};

/** Batas waktu membayar sebelum pesanan kedaluwarsa. */
export const PAYMENT_EXPIRY_HOURS = 24;

const name = z.string({ required_error: 'Nama wajib diisi' }).trim().min(1, 'Nama wajib diisi').min(2, 'Nama minimal 2 huruf').max(100, 'Nama maksimal 100 karakter');
const whatsapp = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/[^\d+]/g, '') || null : v),
  z.string().regex(/^(\+?62|0)8\d{7,12}$/, 'Nomor WhatsApp tidak valid, mis. 0812xxxxxxx').nullish(),
);

/** Beli akun baru dari landing (tanpa login). */
export const checkoutSchema = z.object({
  plan: z.enum(PLAN_KEYS, { errorMap: () => ({ message: 'Paket tidak valid' }) }),
  name,
  email: z.string({ required_error: 'Email wajib diisi' }).trim().toLowerCase().email('Email tidak valid').max(191),
  whatsapp,
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

/** Upgrade paket / isi ulang kredit dari dalam aplikasi. */
export const meCheckoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upgrade'), plan: z.enum(PLAN_KEYS, { errorMap: () => ({ message: 'Paket tidak valid' }) }) }),
  z.object({
    kind: z.literal('topup'),
    credits: z.coerce
      .number()
      .refine((c) => TOPUPS.some((t) => t.credits === c), 'Pilih paket kredit yang tersedia'),
  }),
]);
export type MeCheckoutInput = z.input<typeof meCheckoutSchema>;

export const paymentListQuerySchema = z.object({
  q: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined), z.string().max(191).optional()),
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PAYMENT_STATUSES).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentListQuery = z.output<typeof paymentListQuerySchema>;

export interface PaymentConfig {
  /** false: pembayaran otomatis belum diaktifkan, tombol beli kembali ke WhatsApp. */
  enabled: boolean;
  clientKey: string | null;
  snapUrl: string | null;
  /** Mode simulasi (tes/development tanpa Midtrans). */
  fake: boolean;
}

export interface CheckoutSession {
  orderId: string;
  token: string;
  redirectUrl: string;
  amount: number;
}

/** Status pesanan untuk halaman pembayaran (bisa dibuka tanpa login lewat nomor pesanan). */
export interface PaymentOrderPublic {
  orderId: string;
  kind: PaymentKind;
  plan: Plan | null;
  credits: number | null;
  amount: number;
  status: PaymentStatus;
  /** Email disamarkan, mis. ri***@gmail.com. */
  email: string;
  paymentType: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string;
  /** Untuk melanjutkan pembayaran yang belum selesai. */
  token: string | null;
  redirectUrl: string | null;
}

/** Pesanan di halaman admin & riwayat pembayaran pengguna. */
export interface PaymentOrderItem extends Omit<PaymentOrderPublic, 'token' | 'redirectUrl' | 'email'> {
  id: number;
  buyerName: string;
  buyerEmail: string;
  buyerWhatsapp: string | null;
  userId: number | null;
}

export const paymentItemName = (o: { kind: PaymentKind; plan: Plan | null; credits: number | null }, planName: (p: Plan) => string) =>
  o.kind === 'topup'
    ? `Isi ulang ${o.credits} kredit AI`
    : o.kind === 'upgrade'
      ? `Upgrade ke paket ${planName(o.plan!)}`
      : `Akses WorksTracker paket ${planName(o.plan!)}`;
