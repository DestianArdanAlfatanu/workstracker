import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { todayISO } from '@wt/shared';
import { prisma } from '../src/lib/prisma';
import { purgeDeleted } from '../src/services/applications.service';
import { API, daysAgoISO, registerUser, resetDb, validApplication } from './helpers';

beforeEach(resetDb);

async function setup() {
  const ctx = await registerUser();
  const auth = { Authorization: `Bearer ${ctx.token}` };
  const create = (overrides: Record<string, unknown> = {}) =>
    request(ctx.app).post(`${API}/applications`).set(auth).send(validApplication(overrides));
  return { ...ctx, auth, create };
}

describe('CRUD lamaran', () => {
  it('membuat lamaran dengan default status & sumber, dan mencatat riwayat awal', async () => {
    const { app, auth, create } = await setup();
    const res = await create().expect(201);
    expect(res.body.data).toMatchObject({
      company: 'Tokopedia',
      status: 'applied',
      source: 'other',
      appliedAt: '2026-10-01',
    });

    const detail = await request(app).get(`${API}/applications/${res.body.data.id}`).set(auth).expect(200);
    expect(detail.body.data.history).toHaveLength(1);
    expect(detail.body.data.history[0]).toMatchObject({ fromStatus: null, toStatus: 'applied' });
  });

  it('menerima gaji berformat "8.000.000" dan string kosong sebagai null', async () => {
    const { create } = await setup();
    const res = await create({ salaryMin: '8.000.000', salaryMax: 12000000, location: '  ', jobUrl: '' }).expect(201);
    expect(res.body.data).toMatchObject({ salaryMin: 8_000_000, salaryMax: 12_000_000, location: null, jobUrl: null });
  });

  it('validasi: field wajib, gaji maks < min, tanggal di masa depan', async () => {
    const { create } = await setup();
    const missing = await create({ company: '', position: undefined }).expect(400);
    expect(missing.body.error.fields).toMatchObject({
      company: 'Perusahaan wajib diisi',
      position: 'Posisi wajib diisi',
    });

    const salary = await create({ salaryMin: 10_000_000, salaryMax: 5_000_000 }).expect(400);
    expect(salary.body.error.fields.salaryMax).toBe('Gaji maks harus ≥ gaji min');

    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const date = await create({ appliedAt: future }).expect(400);
    expect(date.body.error.fields.appliedAt).toBe('Tanggal lamar tidak boleh di masa depan');
  });

  it('PATCH parsial memvalidasi gaji terhadap nilai tersimpan', async () => {
    const { app, auth, create } = await setup();
    const { body } = await create({ salaryMin: 10_000_000 }).expect(201);
    await request(app).patch(`${API}/applications/${body.data.id}`).set(auth).send({ salaryMax: 5_000_000 }).expect(400);
    const ok = await request(app)
      .patch(`${API}/applications/${body.data.id}`)
      .set(auth)
      .send({ salaryMax: 15_000_000, notes: 'Catatan' })
      .expect(200);
    expect(ok.body.data).toMatchObject({ salaryMin: 10_000_000, salaryMax: 15_000_000, notes: 'Catatan', company: 'Tokopedia' });
  });

  it('ubah status menulis riwayat; status yang sama tidak menambah riwayat', async () => {
    const { app, auth, create } = await setup();
    const { body } = await create().expect(201);
    const url = `${API}/applications/${body.data.id}`;
    await request(app).patch(`${url}/status`).set(auth).send({ status: 'interview' }).expect(200);
    await request(app).patch(`${url}/status`).set(auth).send({ status: 'interview' }).expect(200);
    // API tidak mengunci urutan status
    await request(app).patch(`${url}/status`).set(auth).send({ status: 'screening' }).expect(200);
    await request(app).patch(`${url}/status`).set(auth).send({ status: 'bukan-status' }).expect(400);

    const detail = await request(app).get(url).set(auth).expect(200);
    expect(detail.body.data.status).toBe('screening');
    expect(detail.body.data.history.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      'applied',
      'interview',
      'screening',
    ]);
  });
});

describe('daftar', () => {
  it('pencarian, filter, sort, dan pagination', async () => {
    const { app, auth, create } = await setup();
    await create({ company: 'Gojek', position: 'Backend Engineer', source: 'linkedin', appliedAt: '2026-09-01' });
    await create({ company: 'Tokopedia', position: 'Data Analyst', source: 'glints', status: 'interview', appliedAt: '2026-09-15' });
    await create({ company: 'Traveloka', position: 'Frontend Engineer', source: 'linkedin', status: 'rejected', appliedAt: '2026-10-01' });

    const all = await request(app).get(`${API}/applications`).set(auth).expect(200);
    expect(all.body.meta).toEqual({ page: 1, limit: 20, total: 3 });
    expect(all.body.data.map((a: { company: string }) => a.company)).toEqual(['Traveloka', 'Tokopedia', 'Gojek']);

    const q = await request(app).get(`${API}/applications?q=engineer`).set(auth).expect(200);
    expect(q.body.meta.total).toBe(2);

    const filtered = await request(app).get(`${API}/applications?source=linkedin&status=rejected,applied`).set(auth).expect(200);
    expect(filtered.body.data.map((a: { company: string }) => a.company).sort()).toEqual(['Gojek', 'Traveloka']);

    const asc = await request(app).get(`${API}/applications?sort=applied_at:asc&limit=2&page=2`).set(auth).expect(200);
    expect(asc.body.meta).toEqual({ page: 2, limit: 2, total: 3 });
    expect(asc.body.data[0].company).toBe('Traveloka');

    await request(app).get(`${API}/applications?status=nope`).set(auth).expect(400);
    await request(app).get(`${API}/applications?sort=password:asc`).set(auth).expect(400);
  });
});

describe('otorisasi lintas user', () => {
  it('user B tidak bisa melihat atau mengubah lamaran user A', async () => {
    const a = await setup();
    const { body } = await a.create().expect(201);
    const id = body.data.id;

    const b = await registerUser(a.app);
    const authB = { Authorization: `Bearer ${b.token}` };
    const base = `${API}/applications/${id}`;

    await request(a.app).get(base).set(authB).expect(404);
    await request(a.app).patch(base).set(authB).send({ company: 'Hack' }).expect(404);
    await request(a.app).patch(`${base}/status`).set(authB).send({ status: 'offer' }).expect(404);
    await request(a.app).delete(base).set(authB).expect(404);
    await request(a.app).post(`${base}/restore`).set(authB).expect(404);

    const listB = await request(a.app).get(`${API}/applications`).set(authB).expect(200);
    expect(listB.body.meta.total).toBe(0);
    const statsB = await request(a.app).get(`${API}/stats/summary`).set(authB).expect(200);
    expect(statsB.body.data.total).toBe(0);

    const unchanged = await request(a.app).get(base).set(a.auth).expect(200);
    expect(unchanged.body.data.company).toBe('Tokopedia');
  });

  it('id tidak valid menghasilkan 404', async () => {
    const { app, auth } = await setup();
    await request(app).get(`${API}/applications/abc`).set(auth).expect(404);
    await request(app).get(`${API}/applications/999999`).set(auth).expect(404);
  });
});

describe('soft delete & undo', () => {
  it('lamaran terhapus hilang dari daftar dan statistik, lalu bisa dipulihkan', async () => {
    const { app, auth, create } = await setup();
    const { body } = await create().expect(201);
    const url = `${API}/applications/${body.data.id}`;

    await request(app).delete(url).set(auth).expect(204);
    expect((await request(app).get(`${API}/applications`).set(auth)).body.meta.total).toBe(0);
    expect((await request(app).get(`${API}/stats/summary`).set(auth)).body.data.total).toBe(0);
    await request(app).get(url).set(auth).expect(404);

    await request(app).post(`${url}/restore`).set(auth).expect(200);
    await request(app).post(`${url}/restore`).set(auth).expect(404);
    expect((await request(app).get(`${API}/applications`).set(auth)).body.meta.total).toBe(1);
  });

  it('purge menghapus permanen yang terhapus lebih dari 30 hari', async () => {
    const { create } = await setup();
    const old = (await create({ company: 'Lama' })).body.data.id;
    const recent = (await create({ company: 'Baru' })).body.data.id;
    await prisma.application.update({ where: { id: BigInt(old) }, data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) } });
    await prisma.application.update({ where: { id: BigInt(recent) }, data: { deletedAt: new Date(Date.now() - 2 * 86_400_000) } });

    expect(await purgeDeleted(30)).toBe(1);
    expect(await prisma.application.findUnique({ where: { id: BigInt(old) } })).toBeNull();
    expect(await prisma.application.findUnique({ where: { id: BigInt(recent) } })).not.toBeNull();
  });
});

describe('jadwal terdekat', () => {
  it('mengurutkan jadwal, termasuk yang terlewat, dan mengabaikan status akhir', async () => {
    const { app, auth, create } = await setup();
    await create({ company: 'A', nextActionDate: '2030-01-10' });
    await create({ company: 'B', nextActionDate: daysAgoISO(2) });
    await create({ company: 'C', nextActionDate: todayISO() });
    await create({ company: 'D', nextActionDate: '2030-01-01', status: 'rejected' });
    await create({ company: 'E' });

    const res = await request(app).get(`${API}/applications/upcoming?limit=5`).set(auth).expect(200);
    expect(res.body.data.map((a: { company: string }) => a.company)).toEqual(['B', 'C', 'A']);
  });
});
