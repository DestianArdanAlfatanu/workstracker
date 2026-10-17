import { PLANS, todayISO } from '@wt/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { toGeminiSchema, usageFrom } from '../src/lib/ai';
import { prisma } from '../src/lib/prisma';
import { JobExtractSchema } from '../src/services/ai/prompts';
import { runDailyReminders } from '../src/services/reminder.service';
import { API, registerAdmin, registerUser, resetDb, validApplication } from './helpers';

beforeEach(resetDb);

async function userWith(plan: 'basic' | 'standard' | 'premium') {
  const ctx = await registerUser(undefined, { plan, aiCredits: plan === 'premium' ? 150 : 0 });
  const auth = { Authorization: `Bearer ${ctx.token}` };
  const application = (await request(ctx.app).post(`${API}/applications`).set(auth).send(validApplication()).expect(201)).body.data;
  return { ...ctx, auth, application };
}

describe('hak akses per paket', () => {
  it('Basic: dashboard & lamaran saja', async () => {
    const { app, auth, application, user } = await userWith('basic');
    expect(user).toMatchObject({ plan: 'basic', aiCredits: 0 });
    await request(app).get(`${API}/applications`).set(auth).expect(200);
    await request(app).get(`${API}/stats/summary`).set(auth).expect(200);
    await request(app).get(`${API}/applications/export?format=csv`).set(auth).expect(200);

    const tasks = await request(app).get(`${API}/tasks`).set(auth).expect(403);
    expect(tasks.body.error).toMatchObject({ code: 'PLAN_REQUIRED', requiredPlan: 'standard' });
    await request(app).get(`${API}/calendar?from=2026-10-01&to=2026-10-31`).set(auth).expect(403);
    await request(app).get(`${API}/stats/insights`).set(auth).expect(403);
    await request(app)
      .post(`${API}/cvs`)
      .set(auth)
      .field('label', 'CV')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(403);
    await request(app).get(`${API}/cvs`).set(auth).expect(403);
    expect(application.cv).toBeNull();
    await request(app).patch(`${API}/me/preferences`).set(auth).send({ emailReminders: true }).expect(403);
    await request(app).patch(`${API}/me/preferences`).set(auth).send({ emailReminders: false }).expect(200);
    await request(app).post(`${API}/me/reminder-test`).set(auth).expect(403);
    const ai = await request(app).post(`${API}/ai/extract-job`).set(auth).send({ text: 'x'.repeat(100) }).expect(403);
    expect(ai.body.error.requiredPlan).toBe('premium');
  });

  it('Standar: semua menu kecuali AI', async () => {
    const { app, auth } = await userWith('standard');
    await request(app).get(`${API}/tasks`).set(auth).expect(200);
    await request(app).get(`${API}/calendar?from=2026-10-01&to=2026-10-31`).set(auth).expect(200);
    await request(app).get(`${API}/stats/insights`).set(auth).expect(200);
    await request(app).patch(`${API}/me/preferences`).set(auth).send({ emailReminders: true }).expect(200);
    await request(app).get(`${API}/me/career-profile`).set(auth).expect(403);
  });

  it('Premium & admin: semua fitur', async () => {
    const premium = await userWith('premium');
    await request(premium.app).get(`${API}/me/career-profile`).set(premium.auth).expect(200);
    const admin = await registerAdmin();
    const auth = { Authorization: `Bearer ${admin.token}` };
    await request(admin.app).get(`${API}/tasks`).set(auth).expect(200);
    await request(admin.app).get(`${API}/me/career-profile`).set(auth).expect(200);
  });

  it('email pengingat harian hanya untuk Standar ke atas', async () => {
    await userWith('basic');
    await userWith('standard');
    const late = new Date(`${todayISO()}T12:00:00+07:00`);
    await runDailyReminders(late);
    const reminded = await prisma.user.findMany({ where: { lastReminderOn: { not: null } }, select: { plan: true } });
    expect(reminded.map((u) => u.plan)).toEqual(['standard']);
  });
});

describe('admin: paket, upgrade, & isi ulang kredit', () => {
  it('membuat pembeli per paket, upgrade bayar selisih, isi ulang & koreksi kredit, pendapatan ikut', async () => {
    const admin = await registerAdmin();
    const app = admin.app;
    const auth = { Authorization: `Bearer ${admin.token}` };
    const create = (plan: string, email: string) =>
      request(app)
        .post(`${API}/admin/users`)
        .set(auth)
        .send({ name: 'Rina Putri', email, plan, purchasedAt: todayISO(), price: PLANS[plan as 'basic'].price })
        .expect(201);

    const basic = (await create('basic', 'rina.basic@mailuji.id')).body.data.user;
    expect(basic).toMatchObject({ plan: 'basic', aiCredits: 0 });
    const premium = (await create('premium', 'rina.premium@mailuji.id')).body.data.user;
    expect(premium).toMatchObject({ plan: 'premium', aiCredits: 150 });
    await request(app).post(`${API}/admin/users`).set(auth).send({ name: 'X', email: 'x@mailuji.id', plan: 'gold', purchasedAt: todayISO() }).expect(400);

    const same = await request(app).patch(`${API}/admin/users/${basic.id}/plan`).set(auth).send({ plan: 'basic', paidAt: todayISO() }).expect(400);
    expect(same.body.error.message).toMatch(/sudah memakai paket Basic/);
    const toStandard = await request(app)
      .patch(`${API}/admin/users/${basic.id}/plan`)
      .set(auth)
      .send({ plan: 'standard', price: 25_000, paidAt: todayISO() })
      .expect(200);
    expect(toStandard.body.data).toMatchObject({ plan: 'standard', aiCredits: 0 });
    const toPremium = await request(app)
      .patch(`${API}/admin/users/${basic.id}/plan`)
      .set(auth)
      .send({ plan: 'premium', price: 60_000, paidAt: todayISO(), notes: 'Transfer BCA' })
      .expect(200);
    expect(toPremium.body.data).toMatchObject({ plan: 'premium', aiCredits: 150 });

    const topup = await request(app)
      .post(`${API}/admin/users/${basic.id}/credits`)
      .set(auth)
      .send({ credits: 100, price: 39_999, paidAt: todayISO() })
      .expect(200);
    expect(topup.body.data.aiCredits).toBe(250);
    const fix = await request(app).post(`${API}/admin/users/${basic.id}/credits`).set(auth).send({ credits: -10, paidAt: todayISO() }).expect(200);
    expect(fix.body.data.aiCredits).toBe(240);
    await request(app).post(`${API}/admin/users/${basic.id}/credits`).set(auth).send({ credits: -999, paidAt: todayISO() }).expect(400);
    await request(app).post(`${API}/admin/users/${basic.id}/credits`).set(auth).send({ credits: 0, paidAt: todayISO() }).expect(400);

    const purchases = await request(app).get(`${API}/admin/users/${basic.id}/purchases`).set(auth).expect(200);
    expect(purchases.body.data.map((p: { kind: string; price: number }) => [p.kind, p.price])).toEqual(
      expect.arrayContaining([
        ['upgrade', 25_000],
        ['upgrade', 60_000],
        ['topup', 39_999],
      ]),
    );
    const ledger = await prisma.aiCreditLedger.findMany({ where: { userId: BigInt(basic.id) }, orderBy: { id: 'asc' } });
    expect(ledger.map((l) => [l.reason, l.delta])).toEqual([
      ['plan_grant', 150],
      ['topup', 100],
      ['admin_adjust', -10],
    ]);

    const overview = (await request(app).get(`${API}/admin/overview`).set(auth).expect(200)).body.data;
    expect(overview.revenueTotal).toBe(24_999 + 109_999 + 25_000 + 60_000 + 39_999);
    expect(overview.byPlan).toEqual({ basic: 0, standard: 0, premium: 2 });
    expect(overview.aiCostPerCreditIdr).toBeNull();
  });
});

describe('Gemini: biaya & skema', () => {
  it('menghitung biaya: thinking ditagih sebagai output, cache lebih murah', () => {
    const u = usageFrom('gemini-3.1-pro-preview', {
      promptTokenCount: 3000,
      cachedContentTokenCount: 1000,
      candidatesTokenCount: 700,
      thoughtsTokenCount: 1300,
    });
    expect(u).toMatchObject({ inputTokens: 2000, outputTokens: 2000, cacheReadTokens: 1000 });
    // 2000×$2 + 2000×$12 + 1000×$0,2 per 1 juta token = $0,0282
    expect(u.costMicroUsd).toBe(28_200);
  });

  it('skema JSON tanpa anyOf-null, $schema, atau batas angka bawaan zod', () => {
    const json = JSON.stringify(toGeminiSchema(JobExtractSchema));
    expect(json).not.toContain('anyOf');
    expect(json).not.toContain('$schema');
    expect(json).not.toContain('9007199254740991');
    const schema = toGeminiSchema(JobExtractSchema) as { properties: Record<string, { type: unknown; enum?: unknown[] }> };
    expect(schema.properties.company.type).toEqual(['string', 'null']);
    expect(schema.properties.source.enum).toContain(null);
    expect(toGeminiSchema(z.object({ n: z.number().int() }))).toMatchObject({ properties: { n: { type: 'integer' } } });
  });
});
