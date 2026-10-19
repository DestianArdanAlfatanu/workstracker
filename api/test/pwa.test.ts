import { addDaysISO, guessFromTitle, parseSharedJob, todayISO } from '@wt/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { FakePushSender, setPushSender } from '../src/lib/push';
import { runDailyPush } from '../src/services/push.service';
import { extractFromHtml, isAllowedJobUrl } from '../src/services/share.service';
import { API, registerUser, resetDb, validApplication } from './helpers';

let fake: FakePushSender;
beforeEach(async () => {
  await resetDb();
  fake = new FakePushSender();
  setPushSender(fake);
  process.env.VAPID_PUBLIC_KEY = 'BPublicKeyUntukTes';
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => setPushSender(null));

const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'p256dh-key-untuk-tes-1234567890', auth: 'auth-key-123' } });

describe('push notification', () => {
  it('berlangganan per perangkat, kirim uji, berhenti; paket Basic & demo ditolak', async () => {
    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const key = await request(app).get(`${API}/push/key`).set(auth).expect(200);
    expect(key.body.data).toMatchObject({ publicKey: 'BPublicKeyUntukTes', configured: true, devices: 0 });

    await request(app).post(`${API}/push/subscriptions`).set(auth).send(sub('hp')).expect(201);
    const second = await request(app).post(`${API}/push/subscriptions`).set(auth).send(sub('laptop')).expect(201);
    expect(second.body.data.devices).toBe(2);
    // Endpoint sama → diperbarui, bukan dobel
    await request(app).post(`${API}/push/subscriptions`).set(auth).send(sub('hp')).expect(201);
    expect(await prisma.pushSubscription.count()).toBe(2);
    await request(app).post(`${API}/push/subscriptions`).set(auth).send({ endpoint: 'http://tidak-aman', keys: { p256dh: 'x', auth: 'y' } }).expect(400);
    await request(app).post(`${API}/push/subscriptions`).set(auth).send({ ...sub('ssrf'), endpoint: 'https://internal.example.net/x' }).expect(400);

    const test = await request(app).post(`${API}/push/test`).set(auth).expect(200);
    expect(test.body.data.delivered).toBe(2);
    expect(fake.sent[0]!.payload.title).toMatch(/Notifikasi WorksTracker aktif/);

    await request(app).delete(`${API}/push/subscriptions`).set(auth).send({ endpoint: sub('laptop').endpoint }).expect(204);
    expect(await prisma.pushSubscription.count()).toBe(1);

    // Perangkat yang sama dipakai akun lain → langganan pindah ke akun tersebut
    const other = await registerUser(app);
    await request(app).post(`${API}/push/subscriptions`).set({ Authorization: `Bearer ${other.token}` }).send(sub('hp')).expect(201);
    const owner = await prisma.pushSubscription.findFirstOrThrow();
    expect(owner.userId.toString()).toBe(String(other.user.id));
    await request(app).post(`${API}/push/test`).set(auth).expect(400);

    const basic = await registerUser(app, { plan: 'basic' });
    const res = await request(app).post(`${API}/push/subscriptions`).set({ Authorization: `Bearer ${basic.token}` }).send(sub('basic')).expect(403);
    expect(res.body.error.requiredPlan).toBe('standard');

    const demo = await request(app).post(`${API}/demo/start`).expect(201);
    await request(app).post(`${API}/push/subscriptions`).set({ Authorization: `Bearer ${demo.body.data.accessToken}` }).send(sub('demo')).expect(403);
  });

  it('pengingat harian lewat push: sekali per hari, langganan mati dihapus, tanpa agenda tidak dikirim', async () => {
    const { app, token, user } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const today = todayISO();
    await request(app).post(`${API}/applications`).set(auth).send(validApplication({ company: 'Tokopedia', nextActionDate: today, nextActionNote: 'Interview user' })).expect(201);
    await request(app).post(`${API}/tasks`).set(auth).send({ title: 'Kirim portofolio', dueDate: addDaysISO(today, -1) }).expect(201);
    await request(app).post(`${API}/push/subscriptions`).set(auth).send(sub('hp')).expect(201);
    await request(app).post(`${API}/push/subscriptions`).set(auth).send(sub('gone-device')).expect(201);

    const quiet = await registerUser(app); // berlangganan tapi tanpa agenda
    await request(app).post(`${API}/push/subscriptions`).set({ Authorization: `Bearer ${quiet.token}` }).send(sub('quiet')).expect(201);

    const early = new Date(`${today}T22:00:00Z`);
    early.setUTCDate(early.getUTCDate() - 1); // 05.00 WIB
    expect(await runDailyPush(early)).toBe(0);

    const noon = new Date(`${today}T05:00:00Z`);
    expect(await runDailyPush(noon)).toBe(1);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.payload).toMatchObject({ title: '1 agenda hari ini, 1 terlewat', tag: 'wt-daily' });
    expect(fake.sent[0]!.payload.body).toContain('Tokopedia');
    // Endpoint "gone" (410) otomatis dihapus
    expect(await prisma.pushSubscription.count({ where: { userId: BigInt(user.id) } })).toBe(1);
    expect(await runDailyPush(noon)).toBe(0); // sudah dikirim hari ini
  });
});

describe('share target', () => {
  it('membaca teks share LinkedIn/Instagram dan judul halaman loker', () => {
    expect(
      parseSharedJob({ text: 'Check out this job at PT Maju Jaya: Frontend Engineer\nhttps://www.linkedin.com/jobs/view/4012345678/?trk=share' }),
    ).toMatchObject({ company: 'PT Maju Jaya', position: 'Frontend Engineer', source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/4012345678/' });
    expect(parseSharedJob({ text: 'Check out this job at PT A: QA Engineer https://www.linkedin.com/jobs/view/4011111111/' })).toMatchObject({
      company: 'PT A',
      position: 'QA Engineer',
    });
    const ig = parseSharedJob({ url: 'https://www.instagram.com/p/AbC123/?igsh=xyz', text: 'Lowongan admin gudang, kirim CV ke hr@contoh.id' });
    expect(ig).toMatchObject({ source: 'instagram', url: 'https://www.instagram.com/p/AbC123/', text: 'Lowongan admin gudang, kirim CV ke hr@contoh.id' });
    expect(parseSharedJob({ url: 'https://karier.contoh.co.id/lowongan/1' }).source).toBe('company_site');

    expect(guessFromTitle('PT Maju hiring Data Analyst in Jakarta, Indonesia | LinkedIn')).toEqual({ company: 'PT Maju', position: 'Data Analyst', location: 'Jakarta, Indonesia' });
    expect(guessFromTitle('Frontend Developer at Startup Kopi | Glints')).toMatchObject({ position: 'Frontend Developer', company: 'Startup Kopi' });
    expect(guessFromTitle('UI Designer - PT Desain Nusantara - Bandung | Kalibrr')).toEqual({ position: 'UI Designer', company: 'PT Desain Nusantara', location: 'Bandung' });
  });

  it('hanya portal loker yang dikenal (tidak bisa dipakai membuka alamat internal)', () => {
    expect(isAllowedJobUrl('https://id.jobstreet.com/id/job/123')).toBe(true);
    expect(isAllowedJobUrl('https://www.linkedin.com/jobs/view/1/')).toBe(true);
    for (const bad of [
      'http://127.0.0.1:4000/health',
      'http://localhost/admin',
      'http://169.254.169.254/latest/meta-data',
      'https://linkedin.com.evil.test/x',
      'https://evil-linkedin.com/x',
      'https://www.linkedin.com:8443/x',
      'https://user:pass@www.linkedin.com/x',
      'file:///etc/passwd',
      'https://contoh.co.id/karier',
    ]) {
      expect(isAllowedJobUrl(bad), bad).toBe(false);
    }
  });

  it('JSON-LD JobPosting & og:title dibaca; redirect ke luar portal tidak diikuti', async () => {
    const html = `<html><head><title>x</title><meta property="og:title" content="Backend Engineer - PT Lain | Jobstreet">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer","hiringOrganization":{"@type":"Organization","name":"PT Teknologi Maju"},"jobLocation":{"address":{"addressLocality":"Jakarta Selatan"}},"validThrough":"2026-12-31T23:59:59Z","description":"<p>Kualifikasi:</p><ul><li>Go &amp; PostgreSQL</li></ul>"}</script></head></html>`;
    expect(extractFromHtml(html)).toMatchObject({
      company: 'PT Teknologi Maju',
      position: 'Backend Engineer',
      location: 'Jakarta Selatan',
      deadline: '2026-12-31',
      description: 'Kualifikasi:\n- Go & PostgreSQL',
    });

    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('jobstreet')) return new Response(html, { headers: { 'content-type': 'text/html' } });
      if (url.includes('glints')) return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:4000/health' } });
      throw new Error(`fetch tak terduga ke ${url}`);
    });
    const ok = await request(app).post(`${API}/share/resolve`).set(auth).send({ url: 'https://id.jobstreet.com/id/job/12345' }).expect(200);
    expect(ok.body.data).toMatchObject({ fetched: true, company: 'PT Teknologi Maju', position: 'Backend Engineer' });

    const redirected = await request(app).post(`${API}/share/resolve`).set(auth).send({ url: 'https://glints.com/id/opportunities/jobs/abc' }).expect(200);
    expect(redirected.body.data.fetched).toBe(false);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).not.toContain('http://127.0.0.1:4000/health');

    await request(app).post(`${API}/share/resolve`).set(auth).send({ url: 'http://127.0.0.1:4000/health' }).expect(400);
    const basic = await registerUser(app, { plan: 'basic' });
    await request(app).post(`${API}/share/resolve`).set({ Authorization: `Bearer ${basic.token}` }).send({ url: 'https://id.jobstreet.com/id/job/1' }).expect(403);
  });
});
