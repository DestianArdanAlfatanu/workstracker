import { addDaysISO, DEADLINE_NOTE, todayISO } from '@wt/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, registerUser, resetDb, validApplication } from './helpers';

beforeEach(resetDb);

async function setup() {
  const ctx = await registerUser();
  const auth = { Authorization: `Bearer ${ctx.token}` };
  const deadline = addDaysISO(todayISO(), 10);
  const create = async (o: Record<string, unknown> = {}) =>
    (await request(ctx.app).post(`${API}/applications`).set(auth).send(validApplication(o)).expect(201)).body.data;
  const get = async (id: number) => (await request(ctx.app).get(`${API}/applications/${id}`).set(auth).expect(200)).body.data;
  return { ...ctx, auth, deadline, create, get };
}

describe('agenda "Batas akhir melamar" hanya untuk Wishlist', () => {
  it('lamaran baru Wishlist menyimpan agenda batas melamar', async () => {
    const { create, deadline } = await setup();
    const app = await create({ status: 'wishlist', nextActionDate: deadline, nextActionNote: DEADLINE_NOTE });
    expect(app.nextActionDate).toBe(deadline);
    expect(app.nextActionNote).toBe(DEADLINE_NOTE);
  });

  it('lamaran baru yang langsung Applied tidak menyimpan agenda batas melamar', async () => {
    const { create, deadline } = await setup();
    const app = await create({ status: 'applied', nextActionDate: deadline, nextActionNote: DEADLINE_NOTE });
    expect(app.nextActionDate).toBeNull();
    expect(app.nextActionNote).toBeNull();
  });

  it('pindah dari Wishlist ke Applied (ubah status) menghapus agenda batas melamar', async () => {
    const { app, auth, create, get, deadline } = await setup();
    const a = await create({ status: 'wishlist', nextActionDate: deadline, nextActionNote: DEADLINE_NOTE });
    await request(app).patch(`${API}/applications/${a.id}/status`).set(auth).send({ status: 'applied' }).expect(200);
    const after = await get(a.id);
    expect(after.status).toBe('applied');
    expect(after.nextActionDate).toBeNull();
    expect(after.nextActionNote).toBeNull();
  });

  it('edit lamaran ke Interview juga menghapusnya, agenda buatan user tetap utuh', async () => {
    const { app, auth, create, get, deadline } = await setup();
    const a = await create({ status: 'wishlist', nextActionDate: deadline, nextActionNote: DEADLINE_NOTE });
    await request(app).patch(`${API}/applications/${a.id}`).set(auth).send({ status: 'interview' }).expect(200);
    expect((await get(a.id)).nextActionNote).toBeNull();

    const own = await create({ status: 'wishlist', nextActionDate: deadline, nextActionNote: 'Follow-up HR' });
    await request(app).patch(`${API}/applications/${own.id}/status`).set(auth).send({ status: 'applied' }).expect(200);
    const kept = await get(own.id);
    expect(kept.nextActionDate).toBe(deadline);
    expect(kept.nextActionNote).toBe('Follow-up HR');
  });

  it('ubah status massal ke Applied menghapus agenda batas melamar saja', async () => {
    const { app, auth, create, get, deadline } = await setup();
    const a = await create({ status: 'wishlist', nextActionDate: deadline, nextActionNote: DEADLINE_NOTE });
    const b = await create({ status: 'wishlist', nextActionDate: deadline, nextActionNote: 'Tanya teman di sana' });
    await request(app).post(`${API}/applications/bulk`).set(auth).send({ action: 'status', ids: [a.id, b.id], status: 'applied' }).expect(200);
    expect((await get(a.id)).nextActionDate).toBeNull();
    expect((await get(b.id)).nextActionNote).toBe('Tanya teman di sana');
  });

  it('tetap Wishlist (edit field lain) tidak menghapus agenda', async () => {
    const { app, auth, create, get, deadline } = await setup();
    const a = await create({ status: 'wishlist', nextActionDate: deadline, nextActionNote: DEADLINE_NOTE });
    await request(app).patch(`${API}/applications/${a.id}`).set(auth).send({ notes: 'Siapkan portofolio' }).expect(200);
    expect((await get(a.id)).nextActionNote).toBe(DEADLINE_NOTE);
  });
});
