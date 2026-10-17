import { addDaysISO, todayISO } from '@wt/shared';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeAiProvider, setAiProvider } from '../src/lib/ai';
import { prisma } from '../src/lib/prisma';
import { UPLOAD_DIR } from '../src/lib/storage';
import { CV_LINES, makePdf } from './cv-files';
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

async function setup({ plan = 'premium', credits = 150 }: { plan?: 'basic' | 'standard' | 'premium'; credits?: number } = {}) {
  const ctx = await registerUser(undefined, { plan, aiCredits: credits });
  const auth = { Authorization: `Bearer ${ctx.token}` };
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

describe('akses & kredit', () => {
  it('paket Standar → 403 PLAN_REQUIRED (premium) untuk AI & profil karier', async () => {
    const { app, auth, coverLetter } = await setup({ plan: 'standard', credits: 0 });
    const res = await coverLetter().expect(403);
    expect(JSON.parse(res.body).error).toMatchObject({ code: 'PLAN_REQUIRED', requiredPlan: 'premium' });
    await request(app).get(`${API}/me/career-profile`).set(auth).expect(403);
    const usage = await request(app).get(`${API}/me/ai-usage`).set(auth).expect(200);
    expect(usage.body.data).toMatchObject({ enabled: false, plan: 'standard', balance: 0 });
  });

  it('kredit dipotong sesuai bobot; gagal/ditolak tidak memotong; saldo kurang → 402', async () => {
    const { app, auth, coverLetter, application } = await setup({ credits: 5 });
    fake.mode = 'refusal';
    const refused = parseEvents((await coverLetter().expect(200)).body);
    expect(refused.at(-1)).toMatchObject({ event: 'error' });
    fake.mode = 'error';
    await request(app).post(`${API}/applications/${application.id}/ai/interview-prep`).set(auth).send({}).expect(503);

    fake.mode = 'ok';
    await coverLetter().expect(200); // 2 kredit → sisa 3
    let usage = await request(app).get(`${API}/me/ai-usage`).set(auth).expect(200);
    expect(usage.body.data).toMatchObject({ enabled: true, balance: 3, costs: { cover_letter: 2, interview_prep: 4 } });

    const res = await request(app).post(`${API}/applications/${application.id}/ai/interview-prep`).set(auth).send({}).expect(402);
    expect(res.body.error.code).toBe('AI_CREDITS_EXHAUSTED');
    await coverLetter().expect(200); // sisa 1
    usage = await request(app).get(`${API}/me/ai-usage`).set(auth).expect(200);
    expect(usage.body.data.balance).toBe(1);

    const ledger = await prisma.aiCreditLedger.findMany({ where: { reason: 'usage' } });
    expect(ledger.map((l) => l.delta)).toEqual([-2, -2]);
    expect(ledger.every((l) => l.generationId != null)).toBe(true);
  });

  it('admin tidak dipotong kredit', async () => {
    const admin = await registerAdmin();
    const auth = { Authorization: `Bearer ${admin.token}` };
    await request(admin.app).post(`${API}/ai/extract-job`).set(auth).send({ text: 'x'.repeat(100) }).expect(200);
    expect(await prisma.aiCreditLedger.count()).toBe(0);
    const usage = await request(admin.app).get(`${API}/me/ai-usage`).set(auth).expect(200);
    expect(usage.body.data).toMatchObject({ enabled: true, unlimited: true });
  });

  it('AI belum dikonfigurasi → event error AI_UNAVAILABLE', async () => {
    const { coverLetter } = await setup();
    const key = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    setAiProvider(null);
    const events = parseEvents((await coverLetter().expect(200)).body);
    expect(events.at(-1)).toMatchObject({ event: 'error', data: { error: { code: 'AI_UNAVAILABLE' } } });
    if (key) process.env.GEMINI_API_KEY = key;
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
    expect(prompt.system).toContain('<career_profile>');

    const stored = await prisma.aiGeneration.findFirstOrThrow({ where: { applicationId: BigInt(application.id) } });
    expect(stored.costMicroUsd).toBeGreaterThan(0);
    expect(stored.promptVersion).toBeTruthy();
  });

  it('em dash dari AI diganti koma (cover letter & hasil terstruktur), rentang tahun tetap', async () => {
    const { app, auth, coverLetter, application } = await setup();
    fake.coverLetter = 'Dengan hormat,\n\nSaya Frontend Developer (2023–2026) — fokus pada React.';
    const done = parseEvents((await coverLetter().expect(200)).body).at(-1)!;
    expect(done.data.generation.content).toBe('Dengan hormat,\n\nSaya Frontend Developer (2023–2026), fokus pada React.');
    fake.prep = {
      overview: 'Interviewer menilai teknis — dan kolaborasi.',
      questions: [],
      questionsToAsk: ['Apa tantangan tim — saat ini?'],
      finalTips: [],
    };
    const prep = await request(app).post(`${API}/applications/${application.id}/ai/interview-prep`).set(auth).send({}).expect(201);
    expect(JSON.stringify(prep.body.data.prep)).not.toContain('—');
    expect(prep.body.data.prep.overview).toBe('Interviewer menilai teknis, dan kolaborasi.');
  });

  it('AI membaca CV dari CV Saya: teks CV lamaran, PDF untuk CV hasil scan, tanpa CV bila dipilih', async () => {
    const { app, auth, coverLetter, application } = await setup();
    const upload = (buffer: Buffer, label: string) =>
      request(app).post(`${API}/cvs`).set(auth).field('label', label).attach('file', buffer, { filename: `${label}.pdf`, contentType: 'application/pdf' }).expect(201);
    const withText = (await upload(makePdf(), 'CV Frontend')).body.data;
    const scanned = (await upload(makePdf([]), 'CV Scan')).body.data;
    expect(withText).toMatchObject({ hasText: true, isDefault: true });
    expect(scanned.hasText).toBe(false);
    await request(app).patch(`${API}/applications/${application.id}`).set(auth).send({ cvId: withText.id }).expect(200);

    // Default: CV yang terhubung ke lamaran, dikirim sebagai teks (tanpa file).
    await coverLetter().expect(200);
    const textOf = (i: number) => fake.prompts[i].parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
    const parts = textOf(0);
    expect(parts).toContain('<cv name="CV Frontend">');
    expect(parts).toContain(CV_LINES[3]);
    expect(fake.prompts[0].parts.some((p) => p.type === 'file')).toBe(false);

    // CV hasil scan → file PDF.
    await coverLetter({ cvId: scanned.id }).expect(200);
    expect(fake.prompts[1].parts).toContainEqual(expect.objectContaining({ type: 'file', mimeType: 'application/pdf' }));

    // "Tanpa CV" → tidak ada CV sama sekali.
    await request(app).post(`${API}/applications/${application.id}/ai/ats-check`).set(auth).send({ cvId: null }).expect(201);
    expect(textOf(2)).not.toContain('<cv');

    // CV milik orang lain tidak bisa dipakai.
    const other = await registerUser(app, { plan: 'premium', aiCredits: 10 });
    const otherCv = (
      await request(app)
        .post(`${API}/cvs`)
        .set('Authorization', `Bearer ${other.token}`)
        .field('label', 'Lain')
        .attach('file', makePdf(), { filename: 'x.pdf', contentType: 'application/pdf' })
    ).body.data;
    await request(app).post(`${API}/applications/${application.id}/ai/ats-check`).set(auth).send({ cvId: otherCv.id }).expect(404);
  });

  it('lamaran orang lain → 404', async () => {
    const { app, application } = await setup();

    const other = await registerUser(app, { plan: 'premium', aiCredits: 10 });
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
  it('riwayat, rating, edit, hapus; admin meng-upgrade ke Premium & melihat biaya', async () => {
    const { app, auth, coverLetter, application, user } = await setup({ plan: 'standard', credits: 0 });
    const admin = await registerAdmin(app);
    const adminAuth = { Authorization: `Bearer ${admin.token}` };

    const upgrade = { plan: 'premium', price: 60_000, paidAt: todayISO() };
    await request(app).patch(`${API}/admin/users/${user.id}/plan`).set(auth).send(upgrade).expect(403);
    const upgraded = await request(app).patch(`${API}/admin/users/${user.id}/plan`).set(adminAuth).send(upgrade).expect(200);
    expect(upgraded.body.data).toMatchObject({ plan: 'premium', aiCredits: 150, aiCreditsUsedThisMonth: 0 });

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
    expect(users.body.data.find((u: { id: number }) => u.id === user.id)).toMatchObject({ aiCredits: 148, aiCreditsUsedThisMonth: 2 });
    const overview = await request(app).get(`${API}/admin/overview`).set(adminAuth).expect(200);
    expect(overview.body.data).toMatchObject({ aiGenerationsThisMonth: 1, aiCreditsUsedThisMonth: 2, revenueTotal: 60_000 });
    expect(overview.body.data.aiCostPerCreditIdr).toBeGreaterThan(0);
    expect(overview.body.data.aiCostThisMonthUsd).toBeGreaterThan(0);

    await request(app).delete(`${API}/ai/generations/${id}`).set(auth).expect(204);
    expect((await request(app).get(`${API}/applications/${application.id}/ai/generations`).set(auth)).body.data).toHaveLength(0);
  });
});
