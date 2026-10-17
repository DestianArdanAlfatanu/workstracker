import type { PaymentOrder, Prisma } from '@prisma/client';
import {
  PAYMENT_EXPIRY_HOURS,
  PLANS,
  paymentItemName,
  planRank,
  todayISO,
  TOPUPS,
  upgradePrice,
  type CheckoutInput,
  type CheckoutSession,
  type MeCheckoutInput,
  type PaymentConfig,
  type PaymentOrderItem,
  type PaymentOrderPublic,
  type Plan,
} from '@wt/shared';
import { randomBytes } from 'node:crypto';
import { APP_URL, BRAND, button, escapeHtml, paragraph, renderLayout } from '../lib/email-layout';
import { AppError, notFound } from '../lib/http';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';
import { hashPassword } from '../lib/password';
import { getPaymentGateway, mapStatus, PaymentGatewayError, toGatewayStatus, type GatewayStatus } from '../lib/payments';
import { prisma } from '../lib/prisma';
import { applyPlanChange, applyTopup } from './admin.service';
import { createSetupLink, SETUP_TTL_HOURS } from './password-reset.service';
import { isDeliverable } from './reminder.service';

const planName = (p: Plan) => PLANS[p].name;
const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
const dateTime = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

const unavailable = () => new AppError('SERVICE_UNAVAILABLE', 'Pembayaran otomatis belum aktif. Silakan beli lewat WhatsApp admin.');

/** Nomor pesanan acak & tidak bisa ditebak (dipakai juga untuk membuka halaman status tanpa login). */
function newOrderId() {
  const d = todayISO().replace(/-/g, '').slice(2);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join('');
  return `WT-${d}-${rand}`;
}

export function config(): PaymentConfig {
  const g = getPaymentGateway();
  return { enabled: !!g, clientKey: g?.clientKey ?? null, snapUrl: g?.snapUrl ?? null, fake: !!g?.fake };
}

const maskEmail = (email: string) => {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
};

export function toPublic(o: PaymentOrder): PaymentOrderPublic {
  return {
    orderId: o.orderId,
    kind: o.kind,
    plan: o.plan,
    credits: o.credits,
    amount: o.amount,
    status: o.status,
    email: maskEmail(o.buyerEmail),
    paymentType: o.paymentType,
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
    expiresAt: o.expiresAt.toISOString(),
    token: o.status === 'pending' ? o.snapToken : null,
    redirectUrl: o.status === 'pending' ? o.redirectUrl : null,
  };
}

export function toItem(o: PaymentOrder): PaymentOrderItem {
  const { token: _t, redirectUrl: _r, email: _e, ...rest } = toPublic(o);
  return { ...rest, id: Number(o.id), buyerName: o.buyerName, buyerEmail: o.buyerEmail, buyerWhatsapp: o.buyerWhatsapp, userId: o.userId ? Number(o.userId) : null };
}

async function startTransaction(data: Omit<Prisma.PaymentOrderUncheckedCreateInput, 'orderId' | 'expiresAt'>): Promise<CheckoutSession> {
  const gateway = getPaymentGateway();
  if (!gateway) throw unavailable();
  const orderId = newOrderId();
  const order = await prisma.paymentOrder.create({
    data: { ...data, orderId, expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_HOURS * 3_600_000) },
  });
  try {
    const tx = await gateway.createTransaction({
      orderId,
      amount: order.amount,
      itemId: order.kind === 'topup' ? `kredit-${order.credits}` : `paket-${order.plan}`,
      itemName: paymentItemName(order, planName),
      customer: { name: order.buyerName, email: order.buyerEmail, phone: order.buyerWhatsapp },
      finishUrl: `${APP_URL}/pembayaran/${orderId}`,
      expiryHours: PAYMENT_EXPIRY_HOURS,
    });
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { snapToken: tx.token, redirectUrl: tx.redirectUrl } });
    return { orderId, token: tx.token, redirectUrl: tx.redirectUrl, amount: order.amount };
  } catch (err) {
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'failed' } });
    logger.error({ err: err instanceof Error ? err.message : err, orderId }, 'Gagal membuat transaksi Midtrans');
    throw new AppError('SERVICE_UNAVAILABLE', 'Pembayaran sedang tidak bisa diproses. Coba lagi beberapa saat atau hubungi admin lewat WhatsApp.');
  }
}

/** Beli akun baru (publik). Pesanan yang masih menunggu untuk email & paket yang sama dipakai ulang. */
export async function checkout(input: CheckoutInput): Promise<CheckoutSession> {
  if (!getPaymentGateway()) throw unavailable();
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AppError('EMAIL_TAKEN', 'Email ini sudah terdaftar. Masuk ke WorksTracker lalu upgrade dari menu aplikasi.', {
      email: 'Email sudah terdaftar',
    });
  }
  const plan = input.plan as Plan;
  const reusable = await prisma.paymentOrder.findFirst({
    where: { kind: 'new_account', buyerEmail: email, plan, status: 'pending', expiresAt: { gt: new Date(Date.now() + 3_600_000) }, snapToken: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (reusable) return { orderId: reusable.orderId, token: reusable.snapToken!, redirectUrl: reusable.redirectUrl!, amount: reusable.amount };
  return startTransaction({
    kind: 'new_account',
    plan,
    amount: PLANS[plan].price,
    buyerName: input.name.trim(),
    buyerEmail: email,
    buyerWhatsapp: (input.whatsapp as string | null | undefined) ?? null,
  });
}

/** Upgrade paket / isi ulang kredit oleh pengguna yang login. Harga selalu dihitung server. */
export async function checkoutForUser(userId: bigint, input: MeCheckoutInput): Promise<CheckoutSession> {
  if (!getPaymentGateway()) throw unavailable();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { license: { select: { whatsapp: true } } } });
  if (user.isDemo || user.role !== 'user') throw new AppError('FORBIDDEN', 'Akun ini tidak bisa melakukan pembayaran.');
  const base = { userId, buyerName: user.name, buyerEmail: user.email, buyerWhatsapp: user.license?.whatsapp ?? null };
  if (input.kind === 'upgrade') {
    const plan = input.plan as Plan;
    if (planRank(plan) <= planRank(user.plan)) {
      throw new AppError('VALIDATION_ERROR', `Anda sudah memakai paket ${planName(user.plan)}. Pilih paket yang lebih tinggi.`);
    }
    return startTransaction({ ...base, kind: 'upgrade', plan, amount: upgradePrice(user.plan, plan) });
  }
  if (!PLANS[user.plan].features.includes('ai')) throw new AppError('PLAN_REQUIRED', 'Kredit AI hanya untuk paket Premium.', undefined, { requiredPlan: 'premium' });
  const pack = TOPUPS.find((t) => t.credits === Number(input.credits))!;
  return startTransaction({ ...base, kind: 'topup', credits: pack.credits, amount: pack.price });
}

/* ------------------------------ Status & lunas ------------------------------ */

/**
 * Terapkan status dari Midtrans ke pesanan. Pesanan lunas dipenuhi tepat sekali
 * (update bersyarat `fulfilled_at IS NULL` di dalam transaksi).
 */
async function applyStatus(order: PaymentOrder, s: GatewayStatus, notification?: Record<string, unknown>) {
  if (Math.round(Number(s.grossAmount)) !== order.amount) {
    logger.error({ orderId: order.orderId, gross: s.grossAmount, amount: order.amount }, 'Jumlah pembayaran tidak cocok dengan pesanan');
    return order;
  }
  const next = mapStatus(s);
  const extra = {
    lastCheckedAt: new Date(),
    paymentType: s.paymentType ?? order.paymentType,
    gatewayTxId: s.transactionId ?? order.gatewayTxId,
    ...(notification ? { lastNotification: notification as Prisma.InputJsonValue } : {}),
  };
  if (next === 'paid') {
    if (order.status !== 'paid') {
      await prisma.paymentOrder.update({ where: { id: order.id }, data: { ...extra, status: 'paid', paidAt: order.paidAt ?? new Date() } });
    }
    await fulfill(order.id);
  } else if (next && next !== order.status && order.status === 'pending') {
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { ...extra, status: next } });
  } else {
    await prisma.paymentOrder.update({ where: { id: order.id }, data: extra });
  }
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
}

interface Fulfilled {
  order: PaymentOrder;
  setupFor?: bigint;
}

/** Penuhi pesanan lunas: buat akun / ubah paket / tambah kredit. Aman dipanggil berkali-kali. */
export async function fulfill(id: bigint) {
  const result = await prisma.$transaction(async (tx): Promise<Fulfilled | null> => {
    const claimed = await tx.paymentOrder.updateMany({ where: { id, status: 'paid', fulfilledAt: null }, data: { fulfilledAt: new Date() } });
    if (claimed.count === 0) return null; // sudah dipenuhi (webhook ganda / rekonsiliasi)
    const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id } });
    const paidAt = todayISO(order.paidAt ?? new Date());
    const notes = `Midtrans ${order.orderId}${order.paymentType ? ` (${order.paymentType})` : ''}`;
    const actor = { createdById: null, paymentOrderId: order.id };

    if (order.kind === 'new_account') {
      const plan = order.plan!;
      const existing = await tx.user.findUnique({ where: { email: order.buyerEmail } });
      if (existing) {
        // Email terdaftar di antara checkout & pembayaran: naikkan paketnya bila lebih tinggi.
        if (planRank(plan) > planRank(existing.plan)) await applyPlanChange(tx, existing, { plan, price: order.amount, paidAt, notes }, actor);
        else logger.warn({ orderId: order.orderId }, 'Pembayaran akun baru untuk email yang sudah terdaftar: perlu ditinjau admin');
        await tx.paymentOrder.update({ where: { id }, data: { userId: existing.id } });
        return { order };
      }
      const credits = PLANS[plan].credits;
      const user = await tx.user.create({
        data: {
          name: order.buyerName,
          email: order.buyerEmail,
          // Password acak yang tidak diketahui siapa pun; pembeli membuat password lewat link email.
          passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
          role: 'user',
          plan,
          aiCredits: credits,
          ...(credits > 0 ? { creditLedger: { create: { delta: credits, reason: 'plan_grant', note: `Paket ${planName(plan)}` } } } : {}),
          license: {
            create: { whatsapp: order.buyerWhatsapp, purchasedAt: new Date(`${paidAt}T00:00:00Z`), price: order.amount, notes, paymentOrderId: order.id },
          },
        },
      });
      await tx.paymentOrder.update({ where: { id }, data: { userId: user.id } });
      return { order, setupFor: user.id };
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId! } });
    if (order.kind === 'upgrade') {
      if (planRank(order.plan!) > planRank(user.plan)) {
        await applyPlanChange(tx, user, { plan: order.plan!, price: order.amount, paidAt, notes }, actor);
      } else {
        // Sudah naik paket lewat jalur lain: catat pembayarannya agar pendapatan tetap benar.
        await tx.purchase.create({ data: { userId: user.id, kind: 'upgrade', plan: order.plan, price: order.amount, paidAt: new Date(`${paidAt}T00:00:00Z`), notes: `${notes}, paket sudah aktif`, paymentOrderId: order.id } });
      }
    } else {
      await applyTopup(tx, user.id, { credits: order.credits!, price: order.amount, paidAt, notes }, actor);
    }
    return { order };
  });
  if (result) await sendFulfillmentEmails(result);
}

export async function getPublicStatus(orderId: string) {
  let order = await prisma.paymentOrder.findUnique({ where: { orderId } });
  if (!order) throw notFound('Pesanan tidak ditemukan');
  // Tarik status terbaru dari Midtrans bila masih menunggu (maks. sekali per 10 detik).
  const gateway = getPaymentGateway();
  if (gateway && order.status === 'pending' && (!order.lastCheckedAt || Date.now() - order.lastCheckedAt.getTime() > 10_000)) {
    order = await refresh(order);
  }
  return toPublic(order);
}

async function refresh(order: PaymentOrder) {
  const gateway = getPaymentGateway();
  if (!gateway) return order;
  try {
    const s = await gateway.getStatus(order.orderId);
    if (s) return applyStatus(order, s);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err, orderId: order.orderId }, 'Cek status pembayaran gagal');
  }
  const expired = order.expiresAt <= new Date();
  return prisma.paymentOrder.update({ where: { id: order.id }, data: { lastCheckedAt: new Date(), ...(expired && order.status === 'pending' ? { status: 'expired' } : {}) } });
}

/** Webhook Midtrans: tanda tangan dicek, lalu status dikonfirmasi ulang langsung ke Midtrans. */
export async function handleNotification(body: Record<string, unknown>) {
  const gateway = getPaymentGateway();
  if (!gateway) throw unavailable();
  if (!gateway.verifyNotification(body)) throw new AppError('FORBIDDEN', 'Tanda tangan notifikasi tidak valid');
  const n = toGatewayStatus(body);
  const order = await prisma.paymentOrder.findUnique({ where: { orderId: n.orderId } });
  if (!order) {
    logger.warn({ orderId: n.orderId }, 'Notifikasi untuk pesanan yang tidak dikenal');
    return { ok: true };
  }
  let confirmed: GatewayStatus | null = null;
  try {
    confirmed = await gateway.getStatus(n.orderId);
  } catch (err) {
    if (!(err instanceof PaymentGatewayError)) throw err;
  }
  await applyStatus(order, confirmed ?? n, body);
  return { ok: true };
}

/** Simulasi pembayaran (PAYMENT_FAKE=1, bukan production). */
export async function simulatePay(orderId: string) {
  const gateway = getPaymentGateway();
  if (!gateway?.fake || process.env.NODE_ENV === 'production') throw notFound('Tidak tersedia');
  (gateway as unknown as { pay: (id: string) => void }).pay(orderId);
  const order = await prisma.paymentOrder.findUnique({ where: { orderId } });
  if (!order) throw notFound('Pesanan tidak ditemukan');
  return toPublic(await refresh(order));
}

/** Job: rekonsiliasi pesanan yang masih menunggu (menutup webhook yang terlewat) & kedaluwarsa. */
export async function reconcilePending(now = new Date()) {
  if (!getPaymentGateway()) return 0;
  const orders = await prisma.paymentOrder.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: new Date(now.getTime() - 60_000) },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  let changed = 0;
  for (const o of orders) {
    const after = await refresh(o);
    if (after.status !== 'pending') changed++;
  }
  // Retry pengiriman fulfillment yang tertunda (mis. server mati di tengah jalan).
  const stuck = await prisma.paymentOrder.findMany({ where: { status: 'paid', fulfilledAt: null }, select: { id: true }, take: 20 });
  for (const s of stuck) await fulfill(s.id);
  return changed;
}

export async function listForUser(userId: bigint) {
  const orders = await prisma.paymentOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  return orders.map(toItem);
}

export async function listAll(query: { status?: PaymentOrder['status']; q?: string | null; page: number; limit: number }) {
  const where: Prisma.PaymentOrderWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.q) where.OR = [{ orderId: { contains: query.q } }, { buyerEmail: { contains: query.q } }, { buyerName: { contains: query.q } }];
  const [items, total, paid] = await prisma.$transaction([
    prisma.paymentOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.paymentOrder.count({ where }),
    prisma.paymentOrder.aggregate({ where: { status: 'paid' }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return { items: items.map(toItem), total, paidCount: paid._count._all, paidAmount: paid._sum.amount ?? 0 };
}

/* -------------------------------- Email -------------------------------- */

function receiptRows(o: PaymentOrder) {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:${BRAND.muted};font-size:14px">${k}</td><td align="right" style="padding:6px 0;font-size:14px;color:${BRAND.navy};font-weight:600">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border-top:1px solid ${BRAND.border};border-bottom:1px solid ${BRAND.border}">
${row('Nomor pesanan', escapeHtml(o.orderId))}
${row('Item', escapeHtml(paymentItemName(o, planName)))}
${row('Jumlah', rupiah(o.amount))}
${row('Metode', escapeHtml((o.paymentType ?? '-').replace(/_/g, ' ')))}
${row('Dibayar', `${dateTime.format(o.paidAt ?? new Date())} WIB`)}
</table>`;
}

function receiptEmail(o: PaymentOrder, setupLink?: string) {
  const first = escapeHtml(o.buyerName.split(' ')[0] ?? '');
  const isNew = o.kind === 'new_account' && !!setupLink;
  const body =
    paragraph(`Halo ${first},`) +
    paragraph(
      isNew
        ? `Terima kasih, pembayaran Anda sudah kami terima dan akun WorksTracker paket <strong>${planName(o.plan!)}</strong> untuk <strong>${escapeHtml(o.buyerEmail)}</strong> sudah aktif.`
        : o.kind === 'topup'
          ? `Pembayaran Anda sudah kami terima. ${o.credits} kredit AI sudah masuk ke akun Anda.`
          : `Pembayaran Anda sudah kami terima. Paket ${planName(o.plan!)} sudah aktif di akun Anda.`,
    ) +
    (isNew
      ? paragraph('Langkah terakhir: buat password untuk masuk.') +
        button('Buat password', setupLink!) +
        paragraph(
          `Link berlaku ${SETUP_TTL_HOURS} jam dan hanya bisa dipakai sekali. Bila sudah kedaluwarsa, pakai "Lupa password" di halaman masuk dengan email ini.`,
          'margin-top:16px;font-size:14px',
        )
      : button('Buka WorksTracker', `${APP_URL}/`)) +
    receiptRows(o) +
    paragraph('Simpan email ini sebagai bukti pembayaran. Akses berlaku seumur hidup.', `font-size:13px;color:${BRAND.muted}`);
  const { html, attachments } = renderLayout({
    preheader: isNew ? 'Akun Anda sudah aktif. Buat password untuk mulai memakai WorksTracker.' : `Bukti pembayaran ${o.orderId}.`,
    title: isNew ? 'Akun WorksTracker Anda siap' : 'Pembayaran berhasil',
    bodyHtml: body,
    footerNote: `Email ini dikirim karena ada pembayaran WorksTracker atas nama ${escapeHtml(o.buyerEmail)}.`,
  });
  const text = [
    `Halo ${o.buyerName.split(' ')[0]},`,
    '',
    isNew ? `Akun WorksTracker paket ${planName(o.plan!)} untuk ${o.buyerEmail} sudah aktif.` : 'Pembayaran Anda sudah kami terima.',
    ...(isNew ? ['Buat password untuk masuk:', setupLink!, `Link berlaku ${SETUP_TTL_HOURS} jam.`] : [`${APP_URL}/`]),
    '',
    `Nomor pesanan: ${o.orderId}`,
    `Item: ${paymentItemName(o, planName)}`,
    `Jumlah: ${rupiah(o.amount)}`,
  ].join('\n');
  return { subject: isNew ? 'Akun WorksTracker Anda siap' : `Pembayaran berhasil: ${paymentItemName(o, planName)}`, html, text, attachments };
}

async function sendFulfillmentEmails({ order, setupFor }: Fulfilled) {
  try {
    const fresh = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    if (!isDeliverable(fresh.buyerEmail)) return;
    const link = setupFor ? await createSetupLink(setupFor) : undefined;
    await sendMail({ to: fresh.buyerEmail, ...receiptEmail(fresh, link) });
  } catch (err) {
    logger.error({ err, orderId: order.orderId }, 'Gagal mengirim email pembayaran');
  }
}
