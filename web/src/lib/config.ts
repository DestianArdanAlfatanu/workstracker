import { PLANS, type Plan } from '@wt/shared';

/** Nomor WhatsApp admin untuk pembelian & bantuan (format internasional tanpa +). */
export const ADMIN_WHATSAPP = (import.meta.env.VITE_ADMIN_WHATSAPP as string | undefined) || '6287796747329';

/** Harga termurah (paket Basic) untuk teks "mulai Rp …". */
export const PRICE_FROM = PLANS.basic.price;

export const whatsappLink = (text: string) => `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`;

export const BUY_MESSAGE = 'Halo admin, saya ingin membeli akses WorksTracker seumur hidup.';

export const buyPlanMessage = (plan: Plan) =>
  `Halo admin, saya ingin membeli WorksTracker paket ${PLANS[plan].name} (seumur hidup).`;

export const upgradeMessage = (from: Plan, to: Plan, email?: string) =>
  `Halo admin, saya ingin upgrade WorksTracker dari paket ${PLANS[from].name} ke ${PLANS[to].name}.${email ? ` Email akun: ${email}` : ''}`;

export const topupMessage = (email?: string) =>
  `Halo admin, saya ingin isi ulang kredit AI WorksTracker.${email ? ` Email akun: ${email}` : ''}`;
