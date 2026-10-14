import { addDaysISO, todayISO } from '@wt/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FakeAiProvider, setAiProvider } from '../src/lib/ai';
import { prisma } from '../src/lib/prisma';
import { purgeExpiredDemos } from '../src/services/demo/demo.service';
import { SAMPLE_APPLICATIONS } from '../src/services/demo/sample-data';
import { API, registerUser, resetDb, validApplication } from './helpers';

let fake: FakeAiProvider;
beforeEach(async () => {
  await resetDb();
  fake = new FakeAiProvider();
  setAiProvider(fake);
});
afterAll(() => setAiProvider(null));

async function startDemo(app = createApp()) {
  const res = await request(app).post(`${API}/demo/start`).expect(201);
  return { app, auth: { Authorization: `Bearer ${res.body.data.accessToken}` }, res };
}

describe('demo instan', () => {
  it('membuat akun demo berisi data contoh dengan sesi aktif', async () => {
    const { app, auth, res } = await startDemo();
    expect(res.body.data.user).toMatchObject({ isDemo: true, aiEnabled: true, name: 'Pengunjung Demo' });
    expect(res.headers['set-cookie']).toBeDefined();
    const list = await request(app).get(`${API}/applications`).set(auth).expect(200);
    expect(list.body.meta.total).toBe(SAMPLE_APPLICATIONS.length);
    const tasks = await request(app).get(`${API}/tasks`).set(auth).expect(200);
    expect(tasks.body.data.length).toBeGreaterThan(0);
    const profile = await request(app).get(`${API}/me/career-profile`).set(auth).expect(200);
    expect(profile.body.data.completeness).toBe(100);
  });

  it('membatasi fitur demo & menolak login biasa', async () => {
    const { app, auth, res } = await startDemo();
    const appId = (await request(app).get(`${API}/applications`).set(auth)).body.data[0].id;
    const upload = await request(app)
      .post(`${API}/applications/${appId}/attachments`)
      .set(auth)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(403);
    expect(upload.body.error.message).toMatch(/mode demo/);
    await request(app).patch(`${API}/me`).set(auth).send({ currentPassword: 'x', newPassword: 'passwordbaru1' }).expect(403);
    await request(app).post(`${API}/me/reminder-test`).set(auth).expect(403);
    await request(app)
      .post(`${API}/auth/login`)
      .send({ email: res.body.data.user.email, password: 'apa-saja' })
      .expect(401);
  });

  it('AI di demo memakai contoh hasil tanpa memanggil provider', async () => {
    const { app, auth } = await startDemo();
    const apps = (await request(app).get(`${API}/applications?q=Tokopedia`).set(auth)).body.data;
    const prep = await request(app).post(`${API}/applications/${apps[0].id}/ai/interview-prep`).set(auth).send({}).expect(201);
    expect(prep.body.data.prep.questions.length).toBeGreaterThan(0);
    expect(prep.body.data.model).toBe('demo');
    const ats = await request(app).post(`${API}/applications/${apps[0].id}/ai/ats-check`).set(auth).send({}).expect(201);
    expect(ats.body.data.ats.score).toBeGreaterThan(0);
    expect(fake.prompts).toHaveLength(0);
    const g = await prisma.aiGeneration.findMany({ where: { model: 'demo' } });
    expect(g.every((x) => x.costMicroUsd === 0)).toBe(true);
  });

  it('demo kedaluwarsa ditolak lalu dihapus oleh job', async () => {
    const { app, auth, res } = await startDemo();
    await prisma.user.update({ where: { id: BigInt(res.body.data.user.id) }, data: { demoExpiresAt: new Date(Date.now() - 1000) } });
    const denied = await request(app).get(`${API}/applications`).set(auth).expect(401);
    expect(denied.body.error.message).toMatch(/demo sudah berakhir/);
    expect(await purgeExpiredDemos()).toBe(1);
    expect(await prisma.application.count({ where: { userId: BigInt(res.body.data.user.id) } })).toBe(0);
  });

  it('rate limit 5 demo per jam per IP & tidak muncul di daftar pembeli admin', async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) await request(app).post(`${API}/demo/start`).expect(201);
    await request(app).post(`${API}/demo/start`).expect(429);
    const admin = await registerUser(app, { role: 'admin' });
    const auth = { Authorization: `Bearer ${admin.token}` };
    expect((await request(app).get(`${API}/admin/users`).set(auth)).body.meta.total).toBe(0);
    expect((await request(app).get(`${API}/admin/overview`).set(auth)).body.data).toMatchObject({ totalBuyers: 0, demosThisMonth: 5 });
  });
});

async function buyer() {
  const ctx = await registerUser();
  await prisma.user.update({ where: { id: BigInt(ctx.user.id) }, data: { aiEnabled: true } });
  const auth = { Authorization: `Bearer ${ctx.token}` };
  return { ...ctx, auth };
}

describe('ATS checker', () => {
  it('wajib deskripsi lowongan, menyimpan hasil, dan menghitung kuota', async () => {
    const { app, auth } = await buyer();
    const noJd = (await request(app).post(`${API}/applications`).set(auth).send(validApplication()).expect(201)).body.data;
    const res = await request(app).post(`${API}/applications/${noJd.id}/ai/ats-check`).set(auth).send({}).expect(400);
    expect(res.body.error.message).toMatch(/deskripsi lowongan/);

    fake.prep = {
      score: 140,
      verdict: 'Cocok',
      summary: 'Ringkasan',
      matchedKeywords: ['React'],
      missingKeywords: ['GraphQL'],
      requirements: [{ requirement: 'React', status: 'met', evidence: 'React 3 tahun', suggestion: '-' }],
      cvImprovements: ['Tambahkan angka'],
      nextSteps: ['Perbarui CV'],
    };
    const withJd = (
      await request(app)
        .post(`${API}/applications`)
        .set(auth)
        .send(validApplication({ jobDescription: 'Butuh React dan GraphQL.' }))
        .expect(201)
    ).body.data;
    const ok = await request(app).post(`${API}/applications/${withJd.id}/ai/ats-check`).set(auth).send({ language: 'en' }).expect(201);
    expect(ok.body.data).toMatchObject({ kind: 'ats_check', ats: { score: 100, missingKeywords: ['GraphQL'] } });
    expect(JSON.stringify(fake.prompts[0])).toContain('Butuh React dan GraphQL.');
    expect((await request(app).get(`${API}/me/ai-usage`).set(auth)).body.data.usedThisMonth).toBe(1);
  });
});

describe('isi otomatis dari lowongan', () => {
  it('mengekstrak & menormalisasi data, menghitung kuota, butuh add-on', async () => {
    const { app, auth } = await buyer();
    fake.prep = {
      company: '  PT Maju Jaya ',
      position: 'Data Analyst',
      location: 'Bandung',
      workType: 'remote',
      salaryMin: 12000000,
      salaryMax: 8000000,
      source: 'glints',
      jobDescription: 'Analisis data penjualan.',
      contactName: null,
      contactEmail: 'bukan-email',
    };
    const text = 'Lowongan Data Analyst di PT Maju Jaya, Bandung (remote). Gaji 8-12 juta. '.repeat(3);
    const res = await request(app).post(`${API}/ai/extract-job`).set(auth).send({ text }).expect(200);
    expect(res.body.data).toMatchObject({
      company: 'PT Maju Jaya',
      salaryMin: 8000000,
      salaryMax: 12000000,
      workType: 'remote',
      contactEmail: null,
    });
    expect(JSON.stringify(fake.prompts[0])).toContain('<job_ad>');
    expect((await request(app).get(`${API}/me/ai-usage`).set(auth)).body.data.usedThisMonth).toBe(1);

    await request(app).post(`${API}/ai/extract-job`).set(auth).send({ text: 'terlalu pendek' }).expect(400);
    const other = await registerUser(app);
    await request(app).post(`${API}/ai/extract-job`).set('Authorization', `Bearer ${other.token}`).send({ text }).expect(403);
  });
});

describe('insight', () => {
  it('menghitung kanal, funnel, waktu respons, dan insight otomatis', async () => {
    const { app, auth } = await buyer();
    const today = todayISO();
    const mk = async (o: Record<string, unknown>) =>
      (await request(app).post(`${API}/applications`).set(auth).send(validApplication(o)).expect(201)).body.data;
    const move = (id: number, status: string) =>
      request(app).patch(`${API}/applications/${id}/status`).set(auth).send({ status }).expect(200);

    // Referral: 3 lamaran, 3 direspons; LinkedIn: 6 lamaran, 1 direspons
    for (let i = 0; i < 3; i++) {
      const a = await mk({ source: 'referral', appliedAt: addDaysISO(today, -5) });
      await move(a.id, 'screening');
      if (i === 0) await move(a.id, 'interview');
    }
    for (let i = 0; i < 6; i++) {
      const a = await mk({ source: 'linkedin', appliedAt: addDaysISO(today, -20) });
      if (i === 0) await move(a.id, 'screening');
    }
    await mk({ source: 'glints', status: 'wishlist', appliedAt: today });

    const res = await request(app).get(`${API}/stats/insights?period=90d`).set(auth).expect(200);
    const d = res.body.data;
    expect(d.totalApplied).toBe(9);
    expect(d.bySource[0]).toMatchObject({ source: 'referral', applied: 3, responded: 3, rate: 100 });
    expect(d.funnel).toEqual([
      { stage: 'applied', count: 9 },
      { stage: 'screening', count: 4 },
      { stage: 'interview', count: 1 },
      { stage: 'offer', count: 0 },
      { stage: 'accepted', count: 0 },
    ]);
    expect(d.medianDaysToResponse).toBeGreaterThanOrEqual(5);
    expect(d.stale).toBe(5);
    const ids = d.insights.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['best-source', 'weak-busy-source', 'stale', 'response-time']));

    const short = await request(app).get(`${API}/stats/insights?period=30d`).set(auth).expect(200);
    expect(short.body.data.totalApplied).toBe(9);
    await request(app).get(`${API}/stats/insights?period=1y`).set(auth).expect(400);
  });
});
