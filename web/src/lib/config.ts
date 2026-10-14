/** Nomor WhatsApp admin untuk pembelian & bantuan (format internasional tanpa +). */
export const ADMIN_WHATSAPP = (import.meta.env.VITE_ADMIN_WHATSAPP as string | undefined) || '6287796747329';

/** Harga akses seumur hidup yang ditampilkan di landing page (rupiah). */
export const PRICE_ORIGINAL = 49_999;
export const PRICE_PROMO = 24_999;

export const whatsappLink = (text: string) => `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`;

export const BUY_MESSAGE = 'Halo admin, saya ingin membeli akses WorksTracker seumur hidup.';
