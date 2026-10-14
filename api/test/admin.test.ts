import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { todayISO } from '@wt/shared';
import { createApp } from '../src/app';
import { API, registerAdmin, registerUser, resetDb } from './helpers';

beforeEach(resetDb);

const buyer = (o: Record<string, unknown> = {}) => ({
  name: 'Rina Kartika',
  email: `rina-${Date.now()}@example.com`,
  whatsapp: '0812-3456-7890',
  purchasedAt: todayISO(),
  price: '49.000',
  notes: 'Transfer BCA',
  ...o,
});

async function setup() {
  const app = createApp();
  const admin = await registerAdmin(app);
  const auth = { Authorization: `Bearer ${admin.token}` };
  return { app, admin, auth };
}

describe('akses admin', () => {
  it('user biasa ditolak 403 di semua endpoint admin', async () => {
    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app).get(`${API}/admin/overview`).set(auth).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    await request(app).get(`${API}/admin/users`).set(auth).expect(403);
    await request(app).post(`${API}/admin/users`).set(auth).send(buyer()).expect(403);
  });
});

describe('kelola pembeli', () => {
  it('membuat pembeli dengan password default, wajib ganti saat login pertama', async () => {
    const { app, auth } = await setup();
    const input = buyer();
    const res = await request(app).post(`${API}/admin/users`).set(auth).send(input).expect(201);
    const { user, tempPassword } = res.body.data;
    expect(tempPassword).toMatch(/^rina\d{4}$/);
    expect(user).toMatchObject({
      name: 'Rina Kartika',
      status: 'active',
      mustChangePassword: true,
      applicationCount: 0,
      license: { whatsapp: '6281234567890', purchasedAt: todayISO(), price: 49_000, notes: 'Transfer BCA' },
    });

    // Login pembeli dengan password default
    const login = await request(app).post(`${API}/auth/login`).send({ email: input.email, password: tempPassword }).expect(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
    const buyerAuth = { Authorization: `Bearer ${login.body.data.accessToken}` };

    // Belum ganti password: fitur diblokir, /me tetap bisa
    const blocked = await request(app).get(`${API}/applications`).set(buyerAuth).expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await request(app).get(`${API}/me`).set(buyerAuth).expect(200);

    const changed = await request(app)
      .patch(`${API}/me`)
      .set(buyerAuth)
      .send({ currentPassword: tempPassword, newPassword: 'rahasiaku99' })
      .expect(200);
    expect(changed.body.data.mustChangePassword).toBe(false);
    await request(app).get(`${API}/applications`).set(buyerAuth).expect(200);
  });

  it('validasi input dan email duplikat', async () => {
    const { app, auth } = await setup();
    const bad = await request(app)
      .post(`${API}/admin/users`)
      .set(auth)
      .send(buyer({ name: '', email: 'x', whatsapp: '12', purchasedAt: '2999-01-01' }))
      .expect(400);
    expect(Object.keys(bad.body.error.fields)).toEqual(
      expect.arrayContaining(['name', 'email', 'whatsapp', 'purchasedAt']),
    );

    const input = buyer();
    await request(app).post(`${API}/admin/users`).set(auth).send(input).expect(201);
    const dup = await request(app).post(`${API}/admin/users`).set(auth).send(input).expect(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('daftar, cari, dan ubah data penjualan', async () => {
    const { app, auth } = await setup();
    const { body } = await request(app).post(`${API}/admin/users`).set(auth).send(buyer()).expect(201);
    await request(app).post(`${API}/admin/users`).set(auth).send(buyer({ name: 'Bagus', email: 'bagus@example.com', whatsapp: null })).expect(201);

    const all = await request(app).get(`${API}/admin/users`).set(auth).expect(200);
    expect(all.body.meta.total).toBe(2); // admin tidak ikut terdaftar sebagai pembeli
    const found = await request(app).get(`${API}/admin/users?q=7890`).set(auth).expect(200);
    expect(found.body.data.map((u: { name: string }) => u.name)).toEqual(['Rina Kartika']);

    const upd = await request(app)
      .patch(`${API}/admin/users/${body.data.user.id}`)
      .set(auth)
      .send({ price: 59000, notes: 'Upgrade' })
      .expect(200);
    expect(upd.body.data.license).toMatchObject({ price: 59_000, notes: 'Upgrade', whatsapp: '6281234567890' });
  });

  it('reset password mencabut sesi lama dan mewajibkan ganti password', async () => {
    const { app, auth } = await setup();
    const target = await registerUser(app);
    const res = await request(app).post(`${API}/admin/users/${target.user.id}/reset-password`).set(auth).expect(200);
    expect(res.body.data.tempPassword).toMatch(/^user\d{4}$/);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', target.cookie).expect(401);
    await request(app).post(`${API}/auth/login`).send({ email: target.body.email, password: target.body.password }).expect(401);
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: target.body.email, password: res.body.data.tempPassword })
      .expect(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
  });

  it('nonaktifkan akun langsung menolak token & login, lalu bisa diaktifkan lagi', async () => {
    const { app, auth } = await setup();
    const target = await registerUser(app);
    const targetAuth = { Authorization: `Bearer ${target.token}` };
    await request(app).get(`${API}/applications`).set(targetAuth).expect(200);

    const res = await request(app).post(`${API}/admin/users/${target.user.id}/suspend`).set(auth).expect(200);
    expect(res.body.data.status).toBe('suspended');
    const denied = await request(app).get(`${API}/applications`).set(targetAuth).expect(401);
    expect(denied.body.error.message).toMatch(/dinonaktifkan/);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', target.cookie).expect(401);
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: target.body.email, password: target.body.password })
      .expect(403);
    expect(login.body.error.message).toMatch(/dinonaktifkan/);

    await request(app).post(`${API}/admin/users/${target.user.id}/activate`).set(auth).expect(200);
    await request(app).post(`${API}/auth/login`).send({ email: target.body.email, password: target.body.password }).expect(200);
  });

  it('admin tidak bisa menonaktifkan/menghapus dirinya sendiri atau admin lain', async () => {
    const { app, admin, auth } = await setup();
    await request(app).post(`${API}/admin/users/${admin.user.id}/suspend`).set(auth).expect(403);
    await request(app).delete(`${API}/admin/users/${admin.user.id}`).set(auth).expect(403);
    const other = await registerAdmin(app);
    await request(app).post(`${API}/admin/users/${other.user.id}/suspend`).set(auth).expect(404);
  });

  it('hapus pembeli beserta lamarannya', async () => {
    const { app, auth } = await setup();
    const target = await registerUser(app);
    await request(app)
      .post(`${API}/applications`)
      .set('Authorization', `Bearer ${target.token}`)
      .send({ company: 'A', position: 'B', appliedAt: todayISO() })
      .expect(201);
    const list = await request(app).get(`${API}/admin/users`).set(auth).expect(200);
    expect(list.body.data[0].applicationCount).toBe(1);

    await request(app).delete(`${API}/admin/users/${target.user.id}`).set(auth).expect(204);
    expect((await request(app).get(`${API}/admin/users`).set(auth)).body.meta.total).toBe(0);
  });
});

describe('ringkasan admin', () => {
  it('menghitung pembeli dan pendapatan', async () => {
    const { app, auth } = await setup();
    const [y, m] = todayISO().split('-').map(Number);
    const lastMonth = new Date(Date.UTC(y, m - 2, 10)).toISOString().slice(0, 10);
    await request(app).post(`${API}/admin/users`).set(auth).send(buyer({ email: 'a@example.com', price: 49000 })).expect(201);
    const b = await request(app)
      .post(`${API}/admin/users`)
      .set(auth)
      .send(buyer({ email: 'b@example.com', price: 59000, purchasedAt: lastMonth }))
      .expect(201);
    await request(app).post(`${API}/admin/users/${b.body.data.user.id}/suspend`).set(auth).expect(200);

    const res = await request(app).get(`${API}/admin/overview`).set(auth).expect(200);
    expect(res.body.data).toMatchObject({
      totalBuyers: 2,
      active: 1,
      suspended: 1,
      revenueTotal: 108_000,
      revenueThisMonth: 49_000,
      salesThisMonth: 1,
    });
    expect(res.body.data.monthly).toHaveLength(12);
    expect(res.body.data.monthly[11]).toMatchObject({ sales: 1, revenue: 49_000 });
    expect(res.body.data.monthly[10]).toMatchObject({ sales: 1, revenue: 59_000 });
  });
});
