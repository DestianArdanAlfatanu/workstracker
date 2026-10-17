import { normalizeJobUrl } from '@wt/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { API, registerUser, resetDb, validApplication } from './helpers';

beforeEach(resetDb);

const session = (app: Parameters<typeof request>[0], cookie?: string[]) => {
  const req = request(app).post(`${API}/auth/extension-session`);
  return cookie ? req.set('Cookie', cookie) : req;
};

describe('sesi Chrome Extension', () => {
  it('memakai cookie website tanpa merotasi; token bisa dipakai memanggil API', async () => {
    const { app, cookie } = await registerUser(undefined, { plan: 'standard' });
    const res = await session(app, cookie).expect(200);
    expect(res.body.data.user).toMatchObject({ plan: 'standard' });
    expect(res.headers['set-cookie']).toBeUndefined();

    await request(app)
      .get(`${API}/applications`)
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
    // Cookie website tetap berlaku (tidak dirotasi oleh extension)
    await session(app, cookie).expect(200);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).expect(200);
  });

  it('tanpa cookie / setelah logout di website → 401', async () => {
    const { app, cookie } = await registerUser(undefined, { plan: 'premium' });
    await session(app).expect(401);
    await request(app).post(`${API}/auth/logout`).set('Cookie', cookie).expect(204);
    await session(app, cookie).expect(401);
  });

  it('paket Basic → 403 PLAN_REQUIRED; akun nonaktif → 403', async () => {
    const basic = await registerUser(undefined, { plan: 'basic' });
    const res = await session(basic.app, basic.cookie).expect(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_REQUIRED', requiredPlan: 'standard' });

    const other = await registerUser(basic.app, { plan: 'standard' });
    await prisma.user.update({ where: { id: BigInt(other.user.id) }, data: { status: 'suspended' } });
    await session(other.app, other.cookie).expect(403);
  });

  it('akun demo tidak bisa memakai extension', async () => {
    const { app, cookie } = await registerUser(undefined, { plan: 'premium' });
    await prisma.user.updateMany({ data: { isDemo: true } });
    const res = await session(app, cookie).expect(403);
    expect(res.body.error.message).toMatch(/mode demo/);
  });
});

describe('cek duplikat link lowongan', () => {
  it('menemukan lamaran dengan link yang sama walau formatnya berbeda; tidak lintas user', async () => {
    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    await request(app)
      .post(`${API}/applications`)
      .set(auth)
      .send(validApplication({ company: 'Gojek', jobUrl: 'https://www.linkedin.com/jobs/view/4012345678/?trk=public' }))
      .expect(201);

    const viaSearch = await request(app)
      .get(`${API}/applications/lookup`)
      .query({ url: 'https://id.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=frontend' })
      .set(auth)
      .expect(200);
    expect(viaSearch.body.data).toMatchObject({ company: 'Gojek', status: 'applied' });

    const none = await request(app).get(`${API}/applications/lookup`).query({ url: 'https://www.linkedin.com/jobs/view/999999999/' }).set(auth);
    expect(none.body.data).toBeNull();

    const other = await registerUser(app);
    const cross = await request(app)
      .get(`${API}/applications/lookup`)
      .query({ url: 'https://www.linkedin.com/jobs/view/4012345678/' })
      .set('Authorization', `Bearer ${other.token}`);
    expect(cross.body.data).toBeNull();
  });

  it('duplikat terdeteksi antara halaman detail & panel pencarian (Jobstreet, Indeed, Loker.id)', async () => {
    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const save = (company: string, jobUrl: string) =>
      request(app).post(`${API}/applications`).set(auth).send(validApplication({ company, jobUrl })).expect(201);
    const lookup = async (url: string) => (await request(app).get(`${API}/applications/lookup`).query({ url }).set(auth).expect(200)).body.data;

    await save('PT Buana', normalizeJobUrl('https://id.jobstreet.com/id/job/95240775?type=standard')!);
    await save('PT Sinar', normalizeJobUrl('https://id.indeed.com/viewjob?jk=3f2a9c1b7d4e5f60')!);
    await save('PT Core', normalizeJobUrl('https://www.loker.id/lowongan-kerja/staf-admin?jobid=15896367')!);

    expect(await lookup('https://id.jobstreet.com/id/it-jobs?jobId=95240775&type=standout')).toMatchObject({ company: 'PT Buana' });
    expect(await lookup('https://id.indeed.com/jobs?q=frontend&vjk=3f2a9c1b7d4e5f60')).toMatchObject({ company: 'PT Sinar' });
    expect(await lookup('https://www.loker.id/cari-lowongan-kerja?jobid=15896367')).toMatchObject({ company: 'PT Core' });
    expect(await lookup('https://id.jobstreet.com/id/job/1')).toBeNull();
  });

  it('normalisasi URL LinkedIn, Instagram, dan situs lain', () => {
    expect(normalizeJobUrl('https://www.linkedin.com/jobs/view/frontend-engineer-at-gojek-4012345678?refId=x')).toBe(
      'https://www.linkedin.com/jobs/view/4012345678/',
    );
    expect(normalizeJobUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678')).toBe(
      'https://www.linkedin.com/jobs/view/4012345678/',
    );
    expect(normalizeJobUrl('https://www.instagram.com/kopisenja.jogja/p/DAbc_12-x/?igsh=abc&img_index=2')).toBe(
      'https://www.instagram.com/p/DAbc_12-x/',
    );
    expect(normalizeJobUrl('https://www.instagram.com/reel/DXyz123/')).toBe('https://www.instagram.com/p/DXyz123/');
    expect(normalizeJobUrl('https://Karir.Example.com/loker/42/?utm_source=ig&id=7#apply')).toBe(
      'https://karir.example.com/loker/42?id=7',
    );
    // Portal loker
    expect(normalizeJobUrl('https://id.jobstreet.com/id/programmer-jobs?jobId=95287652&type=standard')).toBe('https://id.jobstreet.com/id/job/95287652');
    expect(normalizeJobUrl('https://id.jobstreet.com/id/job/95287652?type=standard&ref=search#sol=abc')).toBe('https://id.jobstreet.com/id/job/95287652');
    expect(normalizeJobUrl('https://id.indeed.com/jobs?q=frontend&vjk=3F2A9C1B7D4E5F60')).toBe('https://id.indeed.com/viewjob?jk=3f2a9c1b7d4e5f60');
    expect(normalizeJobUrl('https://id.indeed.com/viewjob?jk=3f2a9c1b7d4e5f60&from=serp')).toBe('https://id.indeed.com/viewjob?jk=3f2a9c1b7d4e5f60');
    expect(normalizeJobUrl('https://www.loker.id/lowongan-kerja/staf-admin?jobid=15896367')).toBe('https://www.loker.id/lowongan-kerja?jobid=15896367');
    expect(normalizeJobUrl('https://glints.com/id/opportunities/jobs/fullstack-developer/a2a8f18e-e8d6-4ac0-b212-ab84050ec852?traceInfo=98&utm_referrer=x')).toBe(
      'https://glints.com/id/opportunities/jobs/fullstack-developer/a2a8f18e-e8d6-4ac0-b212-ab84050ec852',
    );
    expect(normalizeJobUrl('https://dealls.com/loker/manual-quality-assurance-2~ordoapps?source=home')).toBe('https://dealls.com/loker/manual-quality-assurance-2~ordoapps');
    expect(normalizeJobUrl('https://www.kalibrr.com/id-ID/c/ruangguru/jobs/274167/sales-trainee?ref=x')).toBe('https://www.kalibrr.com/id-ID/c/ruangguru/jobs/274167/sales-trainee');
    expect(normalizeJobUrl('bukan url')).toBeNull();
    expect(normalizeJobUrl('javascript:alert(1)')).toBeNull();
  });
});
