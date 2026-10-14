import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MAIL_PREVIEW_DIR } from '../src/lib/mailer';
import { prisma } from '../src/lib/prisma';
import { API, registerUser, resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  await rm(MAIL_PREVIEW_DIR, { recursive: true, force: true });
});
afterAll(() => rm(MAIL_PREVIEW_DIR, { recursive: true, force: true }));

/** Isi email preview terbaru untuk alamat tertentu (urut berdasarkan nama file = waktu). */
async function latestMail(to: string) {
  const files = (await readdir(MAIL_PREVIEW_DIR).catch(() => [] as string[])).filter((f) => f.includes(to)).sort();
  if (!files.length) return null;
  return readFile(path.join(MAIL_PREVIEW_DIR, files[files.length - 1]), 'utf8');
}

const tokenFrom = (html: string) => decodeURIComponent(/reset-password\?token=([A-Za-z0-9_%-]+)/.exec(html)![1]);

async function user(overrides: Record<string, unknown> = {}) {
  const app = createApp();
  const ctx = await registerUser(app, { email: `reset-${Date.now()}@mailuji.id`, ...overrides });
  return { ...ctx, app };
}

const forgot = (app: ReturnType<typeof createApp>, email: string) =>
  request(app).post(`${API}/auth/forgot-password`).send({ email }).expect(200);

describe('lupa password', () => {
  it('respons sama untuk email yang tidak terdaftar', async () => {
    const app = createApp();
    const res = await forgot(app, 'tidak-ada@mailuji.id');
    expect(res.body.data.message).toMatch(/Jika email tersebut terdaftar/);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('alur lengkap: email link → cek → ganti password → sesi lama dicabut → konfirmasi', async () => {
    const { app, body, cookie } = await user();
    await forgot(app, body.email.toUpperCase());

    const mail = await latestMail(body.email);
    expect(mail).toContain('Atur ulang password');
    const token = tokenFrom(mail!);
    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token); // hanya hash yang disimpan

    expect((await request(app).post(`${API}/auth/reset-password/check`).send({ token })).body.data.valid).toBe(true);
    await request(app).post(`${API}/auth/reset-password`).send({ token, newPassword: 'pendek' }).expect(400);
    await request(app).post(`${API}/auth/reset-password`).send({ token, newPassword: 'passwordbaru123' }).expect(200);

    await request(app).post(`${API}/auth/login`).send({ email: body.email, password: body.password }).expect(401);
    await request(app).post(`${API}/auth/login`).send({ email: body.email, password: 'passwordbaru123' }).expect(200);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401);

    // Link hanya sekali pakai
    await request(app).post(`${API}/auth/reset-password`).send({ token, newPassword: 'lainlagi1234' }).expect(400);
    expect((await request(app).post(`${API}/auth/reset-password/check`).send({ token })).body.data.valid).toBe(false);
    expect(await latestMail(body.email)).toContain('Password Anda telah diubah');
  });

  it('link kedaluwarsa & link lama tidak berlaku setelah permintaan baru', async () => {
    const { app, body } = await user();
    await forgot(app, body.email);
    const first = tokenFrom((await latestMail(body.email))!);
    await new Promise((r) => setTimeout(r, 1100));
    await forgot(app, body.email);
    const second = tokenFrom((await latestMail(body.email))!);
    expect(second).not.toBe(first);
    await request(app).post(`${API}/auth/reset-password`).send({ token: first, newPassword: 'passwordbaru123' }).expect(400);

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).post(`${API}/auth/reset-password`).send({ token: second, newPassword: 'passwordbaru123' }).expect(400);
    expect(expired.body.error.message).toMatch(/kedaluwarsa/);
  });

  it('membatasi 3 permintaan per jam per akun; akun nonaktif, demo, & alamat contoh diabaikan', async () => {
    const { app, body, user: u } = await user();
    for (let i = 0; i < 5; i++) await forgot(app, body.email);
    expect(await prisma.passwordResetToken.count({ where: { userId: BigInt(u.id) } })).toBe(3);

    const suspended = await user({ email: `nonaktif-${Date.now()}@mailuji.id` });
    await prisma.user.update({ where: { id: BigInt(suspended.user.id) }, data: { status: 'suspended' } });
    await forgot(app, suspended.body.email);

    const fakeAddr = await user({ email: `x-${Date.now()}@example.com` });
    await forgot(app, fakeAddr.body.email);

    const demo = await request(app).post(`${API}/demo/start`).expect(201);
    await forgot(app, demo.body.data.user.email);

    expect(await prisma.passwordResetToken.count()).toBe(3);
  });

  it('reset juga menghapus kewajiban ganti password default', async () => {
    const { app, body, user: u } = await user();
    await prisma.user.update({ where: { id: BigInt(u.id) }, data: { mustChangePassword: true } });
    await forgot(app, body.email);
    const token = tokenFrom((await latestMail(body.email))!);
    await request(app).post(`${API}/auth/reset-password`).send({ token, newPassword: 'passwordbaru123' }).expect(200);
    const login = await request(app).post(`${API}/auth/login`).send({ email: body.email, password: 'passwordbaru123' }).expect(200);
    expect(login.body.data.user.mustChangePassword).toBe(false);
  });
});
