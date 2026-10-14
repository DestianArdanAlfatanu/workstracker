import { addDaysISO, todayISO } from '@wt/shared';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeAiProvider, setAiProvider } from '../src/lib/ai';
import { prisma } from '../src/lib/prisma';
import { UPLOAD_DIR } from '../src/lib/storage';
import { API, registerAdmin, registerUser, resetDb, validApplication } from './helpers';

let fake: FakeAiProvider;

beforeEach(async () => {
  await resetDb();
  fake = new FakeAiProvider();
  setAiProvider(fake);
});
afterAll(async () => {
  setAiProvider(null);
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/** Baca seluruh respons SSE sebagai teks (supertest tidak mem-buffer text/event-stream). */
const sseParser = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: string) => void) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => (data += chunk));
  res.on('end', () => cb(null, data));
};
function parseEvents(body: string) {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const event = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = JSON.parse(/^data: (.+)$/m.exec(chunk)?.[1] ?? 'null');
      return { event, data };
    });
}

async function setup({ enabled = true, limit = 30 } = {}) {
  const ctx = await registerUser();
  const auth = { Authorization: `Bearer ${ctx.token}` };
  await prisma.user.update({ where: { id: BigInt(ctx.user.id) }, data: { aiEnabled: enabled, aiMonthlyLimit: limit } });
  const app = (
    await request(ctx.app)
      .post(`${API}/applications`)
      .set(auth)
      .send(
        validApplication({
          company: 'Tokopedia',
          position: 'Frontend Engineer',
          salaryMin: 15_000_000,
          contactName: 'Budi HRD',
          contactEmail: 'budi.hrd@tokopedia.test',
          jobDescription: 'Dibutuhkan Frontend Engineer berpengalaman React & TypeScript.',
          nextActionDate: addDaysISO(todayISO(), 3),
          nextActionNote: 'Interview user',
        }),
      )
      .expect(201)
  ).body.data;
  const coverLetter = (o: Record<string, unknown> = {}) =>
    request(ctx.app)
      .post(`${API}/applications/${app.id}/ai/cover-letter`)
      .set(auth)
      .send({ language: 'id', ...o })
      .buffer(true)
      .parse(sseParser as never);
  return { ...ctx, auth, application: app, coverLetter };
}

describe('profil karier', () => {
  it('menyimpan profil dan menghitung kelengkapan', async () => {
    const { app, auth } = await setup();
    const empty = await request(app).get(`${API}/me/career-profile`).set(auth).expect(200);
    expect(empty.body.data.completeness).toBe(0);
    const saved = await request(app)
      .put(`${API}/me/career-profile`)
      .set(auth)
      .send({ headline: 'Frontend Engineer', skills: 'React, TypeScript, Tailwind', experience: '3 tahun di startup e-commerce membangun dashboard.' })
      .expect(200);
    expect(saved.body.data).toMatchObject({ headline: 'Frontend Engineer', completeness: 65 });
  });
});

describe('akses & kuota', () => {
  it('add-on belum aktif → 403 AI_NOT_ENABLED', async () => {
    const { coverLetter } = await setup({ enabled: false });
    const res = await coverLetter().expect(403);
    expect(JSON.parse(res.body).error.code).toBe('AI_NOT_ENABLED');
  });

  it('kuota bulanan habis → 429 AI_QUOTA_EXCEEDED; refusal tidak menghitung kuota', async () => {
    const { app, auth, coverLetter } = await setup({ limit: 1 });
    fake.mode = 'refusal';
    const refused = parseEvents((await coverLetter().expect(200)).body);
    expect(refused.at(-1)).toMatchObject({ event: 'error' });

    fake.mode = 'ok';
    await coverLetter().expect(200);
    const res = await coverLetter().expect(429);
    expect(JSON.parse(res.body).error.code).toBe('AI_QUOTA_EXCEEDED');

    const usage = await request(app).get(`${API}/me/ai-usage`).set(auth).expect(200);
    expect(usage.body.data).toMatchObject({ enabled: true, limit: 1, usedThisMonth: 1 });
  });

  it('AI belum dikonfigurasi → event error AI_UNAVAILABLE', async () => {
    const { coverLetter } = await setup();
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    setAiProvider(null);
    const events = parseEvents((await coverLetter().expect(200)).body);
    expect(events.at(-1)).toMatchObject({ event: 'error', data: { error: { code: 'AI_UNAVAILABLE' } } });
    if (key) process.env.ANTHROPIC_API_KEY = key;
  });
});

describe('cover letter', () => {
  it('mengalirkan teks via SSE, menyimpan hasil, dan tidak mengirim data sensitif', async () => {
    const { app, auth, coverLetter, application, body } = await setup();
    await request(app).put(`${API}/me/career-profile`).set(auth).send({ skills: 'React, TypeScript' });

    const res = await coverLetter({ tone: 'semi_formal', extraNotes: 'Tekankan pengalaman dashboard' }).expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseEvents(res.body);
    const text = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    expect(text).toBe(fake.coverLetter);
    const done = events.at(-1)!;
    expect(done.event).toBe('done');
    expect(done.data.generation).toMatchObject({ kind: 'cover_letter', status: 'completed', content: fake.coverLetter });

    const prompt = fake.prompts[0];
    const all = JSON.stringify(prompt);
    expect(all).toContain('Dibutuhkan Frontend Engineer');
    expect(all).toContain('Tekankan pengalaman dashboard');
    expect(all).toContain('React, TypeScript');
    for (const secret of ['budi.hrd@tokopedia.test', 'Budi HRD', '15000000', body.email]) expect(all).not.toContain(secret);
    expect(prompt.system[1].cache_control).toEqual({ type: 'ephemeral' });

    const stored = await prisma.aiGeneration.findFirstOrThrow({ where: { applicationId: BigInt(application.id) } });
    expect(stored.costMicroUsd).toBeGreaterThan(0);
    expect(stored.promptVersion).toBeTruthy();
  });

  it('CV harus PDF milik sendiri; lamaran orang lain → 404', async () => {
    const { app, auth, coverLetter, application } = await setup();
    const pdf = await request(app)
      .post(`${API}/applications/${application.id}/attachments`)
      .set(auth)
      .attach('file', Buffer.from('%PDF-1.4\nCV'), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);
    await coverLetter({ cvAttachmentId: pdf.body.data.id }).expect(200);
    expect(fake.prompts[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } });

    const other = await registerUser(app);
    await prisma.user.update({ where: { id: BigInt(other.user.id) }, data: { aiEnabled: true } });
    const res = await request(app)
      .post(`${API}/applications/${application.id}/ai/cover-letter`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({})
      .buffer(true)
      .parse(sseParser as never);
    expect(parseEvents(res.body).at(-1)).toMatchObject({ event: 'error', data: { error: { code: 'NOT_FOUND' } } });
  });
});

describe('persiapan interview', () => {
  it('menghasilkan JSON terstruktur dan bisa dijadikan tugas latihan', async () => {
    const { app, auth, application } = await setup();
    const res = await request(app)
      .post(`${API}/applications/${application.id}/ai/interview-prep`)
      .set(auth)
      .send({ focus: 'technical', questionCount: 8 })
      .expect(201);
    expect(res.body.data.prep.questions.length).toBeGreaterThan(0);
    expect(JSON.stringify(fake.prompts[0])).toContain('number of questions: 8');

    const tasks = await request(app)
      .post(`${API}/ai/generations/${res.body.data.id}/tasks`)
      .set(auth)
      .send({ questionIndexes: [0, 1] })
      .expect(201);
    expect(tasks.body.data.count).toBe(2);
    const list = await request(app).get(`${API}/tasks`).set(auth);
    expect(list.body.data[0]).toMatchObject({ dueDate: addDaysISO(todayISO(), 2) });
    expect(list.body.data[0].title).toMatch(/^Latihan jawab:/);
  });
});

describe('riwayat & admin', () => {
  it('riwayat, rating, edit, hapus; admin mengatur add-on & melihat biaya', async () => {
    const { app, auth, coverLetter, application, user } = await setup({ enabled: false });
    const admin = await registerAdmin(app);
    const adminAuth = { Authorization: `Bearer ${admin.token}` };

    await request(app).patch(`${API}/admin/users/${user.id}/ai`).set(auth).send({ aiEnabled: true }).expect(403);
    const enabled = await request(app)
      .patch(`${API}/admin/users/${user.id}/ai`)
      .set(adminAuth)
      .send({ aiEnabled: true, aiMonthlyLimit: 10 })
      .expect(200);
    expect(enabled.body.data).toMatchObject({ aiEnabled: true, aiMonthlyLimit: 10, aiUsedThisMonth: 0 });

    await coverLetter().expect(200);
    const list = await request(app).get(`${API}/applications/${application.id}/ai/generations`).set(auth).expect(200);
    expect(list.body.data).toHaveLength(1);
    const id = list.body.data[0].id;

    const upd = await request(app)
      .patch(`${API}/ai/generations/${id}`)
      .set(auth)
      .send({ rating: 1, editedContent: 'Versi saya' })
      .expect(200);
    expect(upd.body.data).toMatchObject({ rating: 1, editedContent: 'Versi saya' });

    const users = await request(app).get(`${API}/admin/users`).set(adminAuth).expect(200);
    expect(users.body.data.find((u: { id: number }) => u.id === user.id).aiUsedThisMonth).toBe(1);
    const overview = await request(app).get(`${API}/admin/overview`).set(adminAuth).expect(200);
    expect(overview.body.data).toMatchObject({ aiGenerationsThisMonth: 1 });
    expect(overview.body.data.aiCostThisMonthUsd).toBeGreaterThan(0);

    await request(app).delete(`${API}/ai/generations/${id}`).set(auth).expect(204);
    expect((await request(app).get(`${API}/applications/${application.id}/ai/generations`).set(auth)).body.data).toHaveLength(0);
  });
});
