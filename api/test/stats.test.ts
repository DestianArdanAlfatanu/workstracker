import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { todayISO } from '@wt/shared';
import { API, daysAgoISO, registerUser, resetDb, validApplication } from './helpers';

beforeEach(resetDb);

describe('GET /stats/summary', () => {
  it('menghitung kartu statistik dan response rate', async () => {
    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const create = async (o: Record<string, unknown>) =>
      (await request(app).post(`${API}/applications`).set(auth).send(validApplication(o)).expect(201)).body.data;

    await create({ status: 'wishlist' });
    await create({ status: 'applied', nextActionDate: daysAgoISO(1) }); // terlewat
    await create({ status: 'applied' });
    await create({ status: 'interview' });
    await create({ status: 'offer' });
    await create({ status: 'rejected' }); // ditolak tanpa pernah screening
    const wasScreened = await create({ status: 'applied' });
    await request(app).patch(`${API}/applications/${wasScreened.id}/status`).set(auth).send({ status: 'screening' });
    await request(app).patch(`${API}/applications/${wasScreened.id}/status`).set(auth).send({ status: 'rejected' });

    const res = await request(app).get(`${API}/stats/summary`).set(auth).expect(200);
    expect(res.body.data).toMatchObject({
      total: 7,
      active: 4, // applied x2, interview, offer
      interview: 1,
      offer: 1,
      rejected: 2,
      overdueCount: 1,
    });
    // Pernah screening+: interview, offer, wasScreened = 3 dari 6 non-wishlist
    expect(res.body.data.responseRate).toBe(50);
    expect(res.body.data.countsByStatus.wishlist).toBe(1);
  });

  it('aktivitas bulanan, sumber, dan tren bulan ini vs bulan lalu', async () => {
    const { app, token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const today = todayISO();
    const [y, m] = today.split('-').map(Number);
    const prevMonthDay = new Date(Date.UTC(y, m - 2, 15)).toISOString().slice(0, 10);
    const create = async (o: Record<string, unknown>) =>
      (await request(app).post(`${API}/applications`).set(auth).send(validApplication(o)).expect(201)).body.data;

    const a = await create({ appliedAt: today, source: 'linkedin' });
    await create({ appliedAt: today, source: 'linkedin' });
    await create({ appliedAt: prevMonthDay, source: 'glints' });
    await create({ appliedAt: today, status: 'wishlist' }); // tidak dihitung di aktivitas
    await request(app).patch(`${API}/applications/${a.id}/status`).set(auth).send({ status: 'interview' });

    const { body } = await request(app).get(`${API}/stats/summary`).set(auth).expect(200);
    const s = body.data;
    expect(s.monthly).toHaveLength(12);
    expect(s.monthly[11]).toEqual({ month: today.slice(0, 7), applied: 2, responded: 1 });
    expect(s.monthly[10]).toMatchObject({ applied: 1, responded: 0 });
    expect(s.trends.applied).toEqual({ current: 2, previous: 1 });
    expect(s.trends.interview).toEqual({ current: 1, previous: 0 });
    expect(s.bySource).toMatchObject({ linkedin: 2, glints: 1, other: 1 });
  });

  it('response rate 0 jika belum ada lamaran', async () => {
    const { app, token } = await registerUser();
    const res = await request(app).get(`${API}/stats/summary`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.data).toMatchObject({ total: 0, responseRate: 0 });
  });
});
