import { PLANS, TOPUPS, upgradePrice } from '@wt/shared';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MAIL_PREVIEW_DIR } from '../src/lib/mailer';
import { FakePaymentGateway, setPaymentGateway } from '../src/lib/payments';
import { prisma } from '../src/lib/prisma';
import { reconcilePending } from '../src/services/payments.service';
import { API, registerAdmin, registerUser, resetDb } from './helpers';

let gateway: FakePaymentGateway;
beforeEach(async () => {
  await resetDb();
  await rm(MAIL_PREVIEW_DIR, { recursive: true, force: true });
  gateway = new FakePaymentGateway();
  setPaymentGateway(gateway);
});
afterAll(() => setPaymentGateway(null));

const buyer = (o: Record<string, unknown> = {}) => ({ plan: 'standard', name: 'Rina Wulandari', email: `rina-${Date.now()}@mailuji.id`, whatsapp: '0812-3456-7890', ...o });

/** Link "buat password" dari email preview terbaru untuk alamat tersebut. */
async function setupLinkFor(email: string) {
  const files = (await readdir(MAIL_PREVIEW_DIR)).filter((f) => f.includes(email.replace(/[^a-z0-9@._-]/gi, '_')));
  const html = await readFile(path.join(MAIL_PREVIEW_DIR, files.sort().at(-1)!), 'utf8');
  return /href="(http[^"]*reset-password\?token=[^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
}

describe('pembayaran otomatis: akun baru', () => {
  it('checkout → webhook lunas → akun dibuat, kredit & lisensi tercatat, email link buat password', async () => {
    const app = createApp();
    const config = await request(app).get(`${API}/checkout/config`).expect(200);
    expect(config.body.data).toMatchObject({ enabled: true, fake: true });

    const input = buyer({ plan: 'premium' });
    const res = await request(app).post(`${API}/checkout`).send({ ...input, amount: 1 }).expect(201);
    const { orderId, token } = res.body.data;
    expect(res.body.data.amount).toBe(PLANS.premium.price); // harga dari server, bukan dari klien
    expect(orderId).toMatch(/^WT-\d{6}-[A-Z2-9]{12}$/);
    expect(token).toBe(`fake-${orderId}`);
    expect(gateway.created[0]).toMatchObject({ amount: PLANS.premium.price, itemName: 'Akses WorksTracker paket Premium' });

    // Checkout ulang dengan email & paket sama → pesanan yang sama dipakai lagi
    const again = await request(app).post(`${API}/checkout`).send(input).expect(201);
    expect(again.body.data.orderId).toBe(orderId);

    const pending = await request(app).get(`${API}/checkout/${orderId}`).expect(200);
    expect(pending.body.data).toMatchObject({ status: 'pending', kind: 'new_account', plan: 'premium', token });
    expect(pending.body.data.email).toMatch(/^ri\*+@mailuji\.id$/);

    gateway.pay(orderId);
    const notif = gateway.notification(orderId);
    await request(app).post(`${API}/payments/midtrans/notification`).send(notif).expect(200);
    // Webhook ganda tidak membuat akun/kredit dobel
    await request(app).post(`${API}/payments/midtrans/notification`).send(notif).expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email }, include: { license: true } });
    expect(user).toMatchObject({ plan: 'premium', aiCredits: PLANS.premium.credits, mustChangePassword: false, role: 'user' });
    expect(user.license).toMatchObject({ price: PLANS.premium.price, whatsapp: '081234567890' });
    expect(await prisma.aiCreditLedger.count({ where: { userId: user.id } })).toBe(1);
    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { orderId } });
    expect(order).toMatchObject({ status: 'paid', userId: user.id, paymentType: 'qris' });
    expect(order.fulfilledAt).not.toBeNull();

    const status = await request(app).get(`${API}/checkout/${orderId}`).expect(200);
    expect(status.body.data).toMatchObject({ status: 'paid', token: null, redirectUrl: null });

    // Email berisi link membuat password → pembeli bisa masuk
    const link = await setupLinkFor(input.email);
    expect(link).toContain('baru=1');
    const tokenParam = new URL(link!).searchParams.get('token')!;
    await request(app).post(`${API}/auth/reset-password`).send({ token: tokenParam, newPassword: 'passwordku123' }).expect(200);
    const login = await request(app).post(`${API}/auth/login`).send({ email: input.email, password: 'passwordku123' }).expect(200);
    expect(login.body.data.user).toMatchObject({ plan: 'premium', mustChangePassword: false });

    // Pendapatan masuk ringkasan admin
    const admin = await registerAdmin(app);
    const overview = await request(app).get(`${API}/admin/overview`).set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(overview.body.data.revenueTotal).toBe(PLANS.premium.price);
    const list = await request(app).get(`${API}/admin/payments?status=paid`).set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(list.body.meta).toMatchObject({ total: 1, paidCount: 1, paidAmount: PLANS.premium.price });
  });

  it('menolak tanda tangan palsu, jumlah tidak cocok, email terdaftar; kedaluwarsa & gagal tercatat', async () => {
    const app = createApp();
    const { body } = await registerUser(app, { email: `ada-${Date.now()}@mailuji.id` });
    const taken = await request(app).post(`${API}/checkout`).send(buyer({ email: body.email })).expect(409);
    expect(taken.body.error.message).toMatch(/sudah terdaftar/);
    await request(app).post(`${API}/checkout`).send(buyer({ plan: 'gold' })).expect(400);
    await request(app).post(`${API}/checkout`).send(buyer({ email: 'bukan-email' })).expect(400);

    const { orderId } = (await request(app).post(`${API}/checkout`).send(buyer()).expect(201)).body.data;
    gateway.pay(orderId);
    await request(app).post(`${API}/payments/midtrans/notification`).send(gateway.notification(orderId, { signature_key: 'palsu' })).expect(403);
    expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { orderId } })).status).toBe('pending');

    // Jumlah dimanipulasi (tanda tangan valid untuk jumlah lain) → tidak dipenuhi
    gateway.setStatus(orderId, 'settlement', { grossAmount: '1000.00' });
    await request(app).post(`${API}/payments/midtrans/notification`).send(gateway.notification(orderId)).expect(200);
    expect(await prisma.user.count({ where: { email: { startsWith: 'rina-' } } })).toBe(0);

    const second = (await request(app).post(`${API}/checkout`).send(buyer({ email: `dua-${Date.now()}@mailuji.id` })).expect(201)).body.data.orderId;
    gateway.setStatus(second, 'expire');
    await request(app).post(`${API}/payments/midtrans/notification`).send(gateway.notification(second)).expect(200);
    expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { orderId: second } })).status).toBe('expired');

    await request(app).get(`${API}/checkout/WT-000000-TIDAKADA`).expect(404);
    await request(app).post(`${API}/payments/simulate/${second}`).expect(200); // mode simulasi aktif di tes
  });

  it('rekonsiliasi menangkap pembayaran yang webhook-nya terlewat', async () => {
    const app = createApp();
    const input = buyer({ plan: 'basic' });
    const { orderId } = (await request(app).post(`${API}/checkout`).send(input).expect(201)).body.data;
    await prisma.paymentOrder.update({ where: { orderId }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    gateway.pay(orderId);
    expect(await reconcilePending()).toBe(1);
    expect(await prisma.user.findUnique({ where: { email: input.email } })).toMatchObject({ plan: 'basic' });
    expect(await reconcilePending()).toBe(0);
  });
});

describe('pembayaran otomatis: upgrade & isi ulang dari aplikasi', () => {
  it('upgrade bayar selisih lalu isi ulang kredit; paket lebih rendah, demo & admin ditolak', async () => {
    const ctx = await registerUser(undefined, { plan: 'standard', email: `std-${Date.now()}@mailuji.id` });
    const auth = { Authorization: `Bearer ${ctx.token}` };
    const app = ctx.app;
    await request(app).post(`${API}/me/checkout`).set(auth).send({ kind: 'upgrade', plan: 'basic' }).expect(400);
    const topupStd = await request(app).post(`${API}/me/checkout`).set(auth).send({ kind: 'topup', credits: 50 }).expect(403);
    expect(topupStd.body.error.code).toBe('PLAN_REQUIRED');

    const up = await request(app).post(`${API}/me/checkout`).set(auth).send({ kind: 'upgrade', plan: 'premium' }).expect(201);
    expect(up.body.data.amount).toBe(upgradePrice('standard', 'premium'));
    gateway.pay(up.body.data.orderId);
    await request(app).get(`${API}/checkout/${up.body.data.orderId}`).expect(200); // halaman status ikut menarik status
    let user = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(ctx.user.id) } });
    expect(user).toMatchObject({ plan: 'premium', aiCredits: PLANS.premium.credits });

    const pack = TOPUPS[1]!;
    const top = await request(app).post(`${API}/me/checkout`).set(auth).send({ kind: 'topup', credits: pack.credits }).expect(201);
    expect(top.body.data.amount).toBe(pack.price);
    await request(app).post(`${API}/me/checkout`).set(auth).send({ kind: 'topup', credits: 77 }).expect(400);
    gateway.pay(top.body.data.orderId);
    await request(app).post(`${API}/payments/midtrans/notification`).send(gateway.notification(top.body.data.orderId)).expect(200);
    user = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(ctx.user.id) } });
    expect(user.aiCredits).toBe(PLANS.premium.credits + pack.credits);

    const purchases = await prisma.purchase.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
    expect(purchases.map((p) => [p.kind, p.price, p.createdById])).toEqual([
      ['upgrade', upgradePrice('standard', 'premium'), null],
      ['topup', pack.price, null],
    ]);
    const mine = await request(app).get(`${API}/me/payments`).set(auth).expect(200);
    expect(mine.body.data.map((o: { status: string }) => o.status)).toEqual(['paid', 'paid']);
    // Upgrade lagi ke paket yang sama ditolak
    await request(app).post(`${API}/me/checkout`).set(auth).send({ kind: 'upgrade', plan: 'premium' }).expect(400);

    const demo = await request(app).post(`${API}/demo/start`).expect(201);
    await request(app).post(`${API}/me/checkout`).set({ Authorization: `Bearer ${demo.body.data.accessToken}` }).send({ kind: 'upgrade', plan: 'premium' }).expect(403);
    const admin = await registerAdmin(app);
    await request(app).post(`${API}/me/checkout`).set({ Authorization: `Bearer ${admin.token}` }).send({ kind: 'upgrade', plan: 'premium' }).expect(403);
    await request(app).get(`${API}/admin/payments`).set(auth).expect(403);
  });

  it('tanpa gateway: config nonaktif dan checkout 503', async () => {
    setPaymentGateway(null);
    const key = process.env.MIDTRANS_SERVER_KEY;
    const fake = process.env.PAYMENT_FAKE;
    delete process.env.MIDTRANS_SERVER_KEY;
    delete process.env.PAYMENT_FAKE;
    const app = createApp();
    expect((await request(app).get(`${API}/checkout/config`)).body.data).toMatchObject({ enabled: false });
    await request(app).post(`${API}/checkout`).send(buyer()).expect(503);
    if (key) process.env.MIDTRANS_SERVER_KEY = key;
    if (fake) process.env.PAYMENT_FAKE = fake;
  });
});
