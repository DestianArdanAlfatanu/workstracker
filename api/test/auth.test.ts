import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { API, registerUser, resetDb } from './helpers';

const rtCookie = (setCookie: string[]) => setCookie.find((c) => c.startsWith('rt='))!.split(';')[0];

beforeEach(resetDb);

describe('auth', () => {
  it('registrasi publik ditutup', async () => {
    await request(createApp())
      .post(`${API}/auth/register`)
      .send({ name: 'X', email: 'x@example.com', password: 'rahasia123' })
      .expect(404);
  });

  it('login mengembalikan access token, user, dan cookie refresh httpOnly', async () => {
    const { app, body } = await registerUser();
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: body.email, password: body.password })
      .expect(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ email: body.email, role: 'user', mustChangePassword: false });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('rt='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    expect(stored.passwordHash.startsWith('$2b$12$')).toBe(true);
    expect(stored.lastLoginAt).not.toBeNull();
  });

  it('login gagal dengan pesan generik dan validasi per field', async () => {
    const { app, body } = await registerUser();
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: body.email, password: 'salah-password' })
      .expect(401);
    expect(res.body.error.message).toBe('Email atau password salah');

    const invalid = await request(app).post(`${API}/auth/login`).send({ email: 'bukan-email' }).expect(400);
    expect(Object.keys(invalid.body.error.fields)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('membatasi login 5x per menit per IP', async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      await request(app).post(`${API}/auth/login`).send({ email: 'x@example.com', password: 'x' }).expect(401);
    }
    const res = await request(app).post(`${API}/auth/login`).send({ email: 'x@example.com', password: 'x' }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('refresh merotasi token: token lama tidak bisa dipakai lagi', async () => {
    const { app, cookie } = await registerUser();
    const first = cookie[0].split(';')[0];
    const res = await request(app).post(`${API}/auth/refresh`).set('Cookie', first).expect(200);
    expect(res.body.data.accessToken).toBeTruthy();
    const second = rtCookie(res.headers['set-cookie'] as unknown as string[]);
    expect(second).not.toBe(first);

    await request(app).post(`${API}/auth/refresh`).set('Cookie', first).expect(401);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', second).expect(200);
  });

  it('logout mencabut refresh token', async () => {
    const { app, cookie } = await registerUser();
    await request(app).post(`${API}/auth/logout`).set('Cookie', cookie).expect(204);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401);
  });

  it('endpoint terlindungi menolak tanpa token', async () => {
    const app = createApp();
    const res = await request(app).get(`${API}/me`).expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    await request(app).get(`${API}/applications`).set('Authorization', 'Bearer abc').expect(401);
  });
});

describe('profil', () => {
  it('GET /me dan ubah nama', async () => {
    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).get(`${API}/me`).set(auth).expect(200);
    const res = await request(app).patch(`${API}/me`).set(auth).send({ name: 'Nama Baru' }).expect(200);
    expect(res.body.data.name).toBe('Nama Baru');
  });

  it('ubah password butuh password saat ini yang benar dan mencabut sesi lain', async () => {
    const { app, token, cookie, body } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const other = await request(app).post(`${API}/auth/login`).send({ email: body.email, password: body.password });
    const otherRt = rtCookie(other.headers['set-cookie'] as unknown as string[]);

    const wrong = await request(app)
      .patch(`${API}/me`)
      .set(auth)
      .send({ currentPassword: 'salah', newPassword: 'passwordbaru1' })
      .expect(400);
    expect(wrong.body.error.fields.currentPassword).toBeDefined();

    const same = await request(app)
      .patch(`${API}/me`)
      .set(auth)
      .send({ currentPassword: body.password, newPassword: body.password })
      .expect(400);
    expect(same.body.error.fields.newPassword).toBeDefined();

    await request(app)
      .patch(`${API}/me`)
      .set(auth)
      .set('Cookie', cookie)
      .send({ currentPassword: body.password, newPassword: 'passwordbaru1' })
      .expect(200);

    await request(app).post(`${API}/auth/login`).send({ email: body.email, password: 'passwordbaru1' }).expect(200);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', otherRt).expect(401);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).expect(200);
  });
});
