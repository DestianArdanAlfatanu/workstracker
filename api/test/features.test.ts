import { addDaysISO, todayISO, weekStartISO } from '@wt/shared';
import ExcelJS from 'exceljs';
import { readdir, rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MAIL_PREVIEW_DIR } from '../src/lib/mailer';
import { prisma } from '../src/lib/prisma';
import { UPLOAD_DIR } from '../src/lib/storage';
import { runDailyReminders } from '../src/services/reminder.service';
import { API, registerAdmin, registerUser, resetDb, validApplication } from './helpers';

beforeEach(resetDb);
afterAll(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
  await rm(MAIL_PREVIEW_DIR, { recursive: true, force: true });
});

async function setup() {
  const ctx = await registerUser();
  const auth = { Authorization: `Bearer ${ctx.token}` };
  const create = async (o: Record<string, unknown> = {}) =>
    (await request(ctx.app).post(`${API}/applications`).set(auth).send(validApplication(o)).expect(201)).body.data;
  return { ...ctx, auth, create };
}

describe('bulk actions', () => {
  it('ubah status massal menulis riwayat, hapus & pulihkan massal', async () => {
    const { app, auth, create } = await setup();
    const a = await create({ company: 'A' });
    const b = await create({ company: 'B', status: 'interview' });
    const other = await registerUser(app);
    const foreign = (
      await request(app)
        .post(`${API}/applications`)
        .set('Authorization', `Bearer ${other.token}`)
        .send(validApplication({ company: 'Milik orang lain' }))
    ).body.data;

    const res = await request(app)
      .post(`${API}/applications/bulk`)
      .set(auth)
      .send({ action: 'status', ids: [a.id, b.id, foreign.id], status: 'interview' })
      .expect(200);
    expect(res.body.data.count).toBe(1); // b sudah interview, foreign bukan milik user

    const detail = await request(app).get(`${API}/applications/${a.id}`).set(auth);
    expect(detail.body.data.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['applied', 'interview']);

    const del = await request(app).post(`${API}/applications/bulk`).set(auth).send({ action: 'delete', ids: [a.id, b.id, foreign.id] });
    expect(del.body.data.count).toBe(2);
    expect((await request(app).get(`${API}/applications`).set(auth)).body.meta.total).toBe(0);

    const restore = await request(app).post(`${API}/applications/bulk`).set(auth).send({ action: 'restore', ids: [a.id, b.id] });
    expect(restore.body.data.count).toBe(2);

    await request(app).post(`${API}/applications/bulk`).set(auth).send({ action: 'status', ids: [], status: 'offer' }).expect(400);
  });
});

describe('ekspor', () => {
  it('CSV dengan BOM, filter, dan pengaman formula; XLSX terbaca', async () => {
    const { app, auth, create } = await setup();
    await create({ company: 'Gojek', source: 'linkedin', notes: '=HYPERLINK("x")' });
    await create({ company: 'Shopee', source: 'glints' });

    const csv = await request(app).get(`${API}/applications/export?format=csv&source=linkedin`).set(auth).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/lamaran-.*\.csv/);
    const text = csv.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Gojek');
    expect(text).not.toContain('Shopee');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);

    const xlsx = await request(app)
      .get(`${API}/applications/export?format=xlsx`)
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as Buffer);
    const ws = wb.getWorksheet('Lamaran')!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).getCell(1).value).toBe('Perusahaan');
  });
});

describe('tugas', () => {
  it('CRUD, selesai/buka kembali, dan otorisasi', async () => {
    const { app, auth, create } = await setup();
    const a = await create({ company: 'Tokopedia' });
    const t = await request(app)
      .post(`${API}/tasks`)
      .set(auth)
      .send({ title: 'Siapkan portofolio', dueDate: todayISO(), applicationId: a.id })
      .expect(201);
    expect(t.body.data).toMatchObject({ title: 'Siapkan portofolio', done: false, application: { company: 'Tokopedia' } });
    await request(app).post(`${API}/tasks`).set(auth).send({ title: 'Update LinkedIn' }).expect(201);
    await request(app).post(`${API}/tasks`).set(auth).send({ title: '' }).expect(400);

    const done = await request(app).patch(`${API}/tasks/${t.body.data.id}`).set(auth).send({ done: true }).expect(200);
    expect(done.body.data.done).toBe(true);
    expect((await request(app).get(`${API}/tasks`).set(auth)).body.data).toHaveLength(1);
    expect((await request(app).get(`${API}/tasks?status=all`).set(auth)).body.data).toHaveLength(2);
    expect((await request(app).get(`${API}/tasks?applicationId=${a.id}&status=all`).set(auth)).body.data).toHaveLength(1);

    const other = await registerUser(app);
    const otherAuth = { Authorization: `Bearer ${other.token}` };
    await request(app).patch(`${API}/tasks/${t.body.data.id}`).set(otherAuth).send({ done: false }).expect(404);
    await request(app).post(`${API}/tasks`).set(otherAuth).send({ title: 'x', applicationId: a.id }).expect(404);

    await request(app).delete(`${API}/tasks/${t.body.data.id}`).set(auth).expect(204);
  });
});

describe('kalender', () => {
  it('menggabungkan tanggal lamar, tindak lanjut, dan tugas', async () => {
    const { app, auth, create } = await setup();
    const today = todayISO();
    await create({ company: 'A', appliedAt: today, nextActionDate: addDaysISO(today, 2), nextActionNote: 'Interview' });
    await create({ company: 'B', appliedAt: today, nextActionDate: addDaysISO(today, 3), status: 'rejected' });
    await request(app).post(`${API}/tasks`).set(auth).send({ title: 'Kirim CV', dueDate: addDaysISO(today, 1) });

    const res = await request(app)
      .get(`${API}/calendar?from=${today}&to=${addDaysISO(today, 10)}`)
      .set(auth)
      .expect(200);
    const types = res.body.data.map((e: { type: string; title: string }) => `${e.type}:${e.title}`);
    expect(types).toEqual(expect.arrayContaining(['applied:A', 'applied:B', 'task:Kirim CV', 'next_action:A']));
    expect(types).not.toContain('next_action:B'); // status akhir tidak dijadwalkan
    await request(app).get(`${API}/calendar?from=${today}&to=${addDaysISO(today, 100)}`).set(auth).expect(400);
  });
});

describe('preferensi & target mingguan', () => {
  it('menyimpan target dan menghitung progres minggu ini', async () => {
    const { app, auth, create } = await setup();
    const pref = await request(app).patch(`${API}/me/preferences`).set(auth).send({ weeklyGoal: 5, emailReminders: false }).expect(200);
    expect(pref.body.data).toMatchObject({ weeklyGoal: 5, emailReminders: false });
    await request(app).patch(`${API}/me/preferences`).set(auth).send({ weeklyGoal: 0 }).expect(400);

    const today = todayISO();
    await create({ appliedAt: today });
    await create({ appliedAt: today, status: 'wishlist' });
    await create({ appliedAt: addDaysISO(weekStartISO(today), -3) }); // minggu lalu

    const stats = await request(app).get(`${API}/stats/summary`).set(auth).expect(200);
    expect(stats.body.data.weekly).toMatchObject({ goal: 5, count: 1, weekStart: weekStartISO(today) });
    expect(stats.body.data.weekly.history).toHaveLength(8);
    expect(stats.body.data.weekly.history[6].count).toBe(1);
  });
});

describe('pengumuman', () => {
  it('admin membuat & menerbitkan; pengguna melihat & menandai dibaca', async () => {
    const { app, auth } = await setup();
    const admin = await registerAdmin(app);
    const adminAuth = { Authorization: `Bearer ${admin.token}` };

    await request(app).post(`${API}/admin/announcements`).set(auth).send({ title: 'x', body: 'y' }).expect(403);
    const draft = await request(app)
      .post(`${API}/admin/announcements`)
      .set(adminAuth)
      .send({ title: 'Fitur baru: Kanban', body: 'Coba tampilan board!', level: 'update' })
      .expect(201);
    expect(draft.body.data.published).toBe(false);
    expect((await request(app).get(`${API}/announcements`).set(auth)).body.data).toHaveLength(0);

    const pub = await request(app)
      .patch(`${API}/admin/announcements/${draft.body.data.id}`)
      .set(adminAuth)
      .send({ published: true })
      .expect(200);
    expect(pub.body.data.publishedAt).not.toBeNull();

    const list = await request(app).get(`${API}/announcements`).set(auth).expect(200);
    expect(list.body.data[0]).toMatchObject({ title: 'Fitur baru: Kanban', read: false });
    await request(app).post(`${API}/announcements/${draft.body.data.id}/read`).set(auth).expect(204);
    expect((await request(app).get(`${API}/announcements`).set(auth)).body.data[0].read).toBe(true);

    await request(app).delete(`${API}/admin/announcements/${draft.body.data.id}`).set(adminAuth).expect(204);
  });
});

describe('pengingat email', () => {
  it('mengirim sekali per hari ke yang mengaktifkan, disimpan sebagai preview tanpa SMTP', async () => {
    const ctx = await registerUser(undefined, { email: `pengingat-${Date.now()}@mailuji.id` });
    const { app, user, body } = ctx;
    const auth = { Authorization: `Bearer ${ctx.token}` };
    const create = async (o: Record<string, unknown> = {}) =>
      (await request(app).post(`${API}/applications`).set(auth).send(validApplication(o)).expect(201)).body.data;
    // Alamat contoh (@example.com) dilewati agar tidak bounce.
    const fakeAddr = await registerUser(app);
    await request(app)
      .post(`${API}/applications`)
      .set('Authorization', `Bearer ${fakeAddr.token}`)
      .send(validApplication({ nextActionDate: todayISO() }));
    const today = todayISO();
    await create({ company: 'Tokopedia', nextActionDate: today, nextActionNote: 'Interview user' });
    await request(app).post(`${API}/tasks`).set(auth).send({ title: 'Kirim portofolio', dueDate: addDaysISO(today, -1) });
    const off = await registerUser(app);
    await prisma.user.update({ where: { id: BigInt(off.user.id) }, data: { emailReminders: false } });

    const noon = new Date(`${today}T05:00:00Z`); // 12.00 WIB
    expect(await runDailyReminders(noon)).toBe(1);
    expect(await runDailyReminders(noon)).toBe(0); // sudah dikirim hari ini

    const files = await readdir(MAIL_PREVIEW_DIR);
    expect(files.some((f) => f.includes(body.email.replace(/[^a-z0-9@._-]/gi, '_')))).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(user.id) } });
    expect(updated.lastReminderOn).not.toBeNull();

    const early = new Date(`${today}T23:00:00Z`);
    early.setUTCDate(early.getUTCDate() - 1); // 06.00 WIB hari ini
    await prisma.user.update({ where: { id: BigInt(user.id) }, data: { lastReminderOn: null } });
    expect(await runDailyReminders(early)).toBe(0);

    const test = await request(app).post(`${API}/me/reminder-test`).set(auth).expect(200);
    expect(test.body.data).toMatchObject({ sent: true, previewMode: true, total: 2 });
  });
});
