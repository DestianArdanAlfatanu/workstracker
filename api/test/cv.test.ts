import { CV_MAX_ACTIVE } from '@wt/shared';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeAiProvider, setAiProvider } from '../src/lib/ai';
import { prisma } from '../src/lib/prisma';
import { storedPath, UPLOAD_DIR } from '../src/lib/storage';
import { purgeDeleted } from '../src/services/applications.service';
import { purgeOrphanArchived } from '../src/services/cv.service';
import { migrateLegacyAttachments } from '../src/services/cv-migration';
import { CV_LINES, DOCX_TYPE, makeDocx, makePdf, PDF_TYPE } from './cv-files';
import { API, registerUser, resetDb, validApplication } from './helpers';

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

async function setup(plan: 'basic' | 'standard' | 'premium' = 'standard') {
  const ctx = await registerUser(undefined, { plan, aiCredits: plan === 'premium' ? 10 : 0 });
  const auth = { Authorization: `Bearer ${ctx.token}` };
  const upload = (label: string, buffer: Buffer = makePdf(), filename = `${label}.pdf`, type = PDF_TYPE) =>
    request(ctx.app).post(`${API}/cvs`).set(auth).field('label', label).attach('file', buffer, { filename, contentType: type });
  const createApp = async (o: Record<string, unknown> = {}) =>
    (await request(ctx.app).post(`${API}/applications`).set(auth).send(validApplication(o)).expect(201)).body.data;
  const fileOf = async (id: number) => {
    const cv = await prisma.cvDocument.findUniqueOrThrow({ where: { id: BigInt(id) } });
    return storedPath(cv.userId, cv.storedName);
  };
  return { ...ctx, auth, upload, createApp, fileOf };
}

describe('CV Saya', () => {
  it('unggah PDF & DOCX: teks terbaca, CV pertama jadi utama, file palsu ditolak, maks. 5', async () => {
    const { app, auth, upload } = await setup();
    const pdf = await upload('CV Frontend').expect(201);
    expect(pdf.body.data).toMatchObject({
      label: 'CV Frontend',
      mimeType: PDF_TYPE,
      hasText: true,
      pageCount: 1,
      isDefault: true,
      archived: false,
      usedBy: 0,
    });
    const stored = await prisma.cvDocument.findUniqueOrThrow({ where: { id: BigInt(pdf.body.data.id) } });
    expect(stored.textContent).toContain(CV_LINES[3]);

    const docx = await upload('CV Word', await makeDocx(), 'cv.docx', DOCX_TYPE).expect(201);
    expect(docx.body.data).toMatchObject({ hasText: true, isDefault: false });
    const docxStored = await prisma.cvDocument.findUniqueOrThrow({ where: { id: BigInt(docx.body.data.id) } });
    expect(docxStored.textContent).toContain('Universitas Contoh');

    const scanned = await upload('CV Scan', makePdf([])).expect(201);
    expect(scanned.body.data.hasText).toBe(false);

    // .exe berkedok PDF, format lain, tanpa nama, tanpa file
    const fake = await upload('Palsu', Buffer.from('MZ fake'), 'cv.pdf').expect(400);
    expect(fake.body.error.message).toMatch(/tidak sesuai/);
    await upload('Teks', Buffer.from('hello'), 'a.txt', 'text/plain').expect(400);
    await upload('', makePdf()).expect(400);
    await request(app).post(`${API}/cvs`).set(auth).field('label', 'Kosong').expect(400);

    await upload('CV 4').expect(201);
    await upload('CV 5').expect(201);
    const sixth = await upload('CV 6').expect(400);
    expect(sixth.body.error.message).toMatch(new RegExp(`Maksimal ${CV_MAX_ACTIVE} CV`));

    const list = await request(app).get(`${API}/cvs`).set(auth).expect(200);
    expect(list.body.data).toHaveLength(5);
    expect(list.body.data[0]).toMatchObject({ label: 'CV Frontend', isDefault: true });
  });

  it('ganti nama & CV utama; lamaran baru otomatis memakai CV utama', async () => {
    const { app, auth, upload, createApp } = await setup();
    const a = (await upload('CV A').expect(201)).body.data;
    const b = (await upload('CV B').expect(201)).body.data;

    const renamed = await request(app).patch(`${API}/cvs/${b.id}`).set(auth).send({ label: 'CV Backend', isDefault: true }).expect(200);
    expect(renamed.body.data).toMatchObject({ label: 'CV Backend', isDefault: true });
    const list = (await request(app).get(`${API}/cvs`).set(auth)).body.data;
    expect(list.filter((c: { isDefault: boolean }) => c.isDefault).map((c: { id: number }) => c.id)).toEqual([b.id]);
    await request(app).patch(`${API}/cvs/${a.id}`).set(auth).send({ isDefault: false }).expect(400);

    const auto = await createApp();
    expect(auto.cv).toEqual({ id: b.id, label: 'CV Backend', archived: false });
    const picked = await createApp({ cvId: a.id });
    expect(picked.cv.id).toBe(a.id);
    const none = await createApp({ cvId: null });
    expect(none.cv).toBeNull();
    const changed = await request(app).patch(`${API}/applications/${none.id}`).set(auth).send({ cvId: a.id }).expect(200);
    expect(changed.body.data.cv.label).toBe('CV A');
    const detail = await request(app).get(`${API}/applications/${picked.id}`).set(auth).expect(200);
    expect(detail.body.data.cv).toMatchObject({ id: a.id, label: 'CV A' });
    expect(detail.body.data.attachments).toBeUndefined();

    const usage = (await request(app).get(`${API}/cvs`).set(auth)).body.data.find((c: { id: number }) => c.id === a.id);
    expect(usage.usedBy).toBe(2);
  });

  it('hapus/ganti CV yang dipakai lamaran → versi lama diarsipkan; tidak dipakai → file dihapus', async () => {
    const { app, auth, upload, createApp, fileOf } = await setup();
    const used = (await upload('CV Dipakai').expect(201)).body.data;
    const unused = (await upload('CV Nganggur').expect(201)).body.data;
    const application = await createApp({ cvId: used.id });

    // Ganti file CV yang belum dipakai: CV yang sama, file lama dihapus.
    const unusedFile = await fileOf(unused.id);
    const swapped = await request(app)
      .post(`${API}/cvs/${unused.id}/replace`)
      .set(auth)
      .attach('file', await makeDocx(), { filename: 'baru.docx', contentType: DOCX_TYPE })
      .expect(200);
    expect(swapped.body.data).toMatchObject({ id: unused.id, originalName: 'baru.docx', mimeType: DOCX_TYPE });
    expect(existsSync(unusedFile)).toBe(false);
    expect(existsSync(await fileOf(unused.id))).toBe(true);

    // Ganti file CV yang dipakai: CV baru (label & utama sama), versi lama diarsipkan.
    const usedFile = await fileOf(used.id);
    const replaced = await request(app)
      .post(`${API}/cvs/${used.id}/replace`)
      .set(auth)
      .attach('file', makePdf(['CV versi baru', ...CV_LINES]), { filename: 'v2.pdf', contentType: PDF_TYPE })
      .expect(200);
    expect(replaced.body.data.id).not.toBe(used.id);
    expect(replaced.body.data).toMatchObject({ label: 'CV Dipakai', isDefault: true, archived: false });
    expect(existsSync(usedFile)).toBe(true);
    const appAfter = (await request(app).get(`${API}/applications/${application.id}`).set(auth)).body.data;
    expect(appAfter.cv).toEqual({ id: used.id, label: 'CV Dipakai', archived: true });
    const list = (await request(app).get(`${API}/cvs`).set(auth)).body.data;
    expect(list.map((c: { id: number; archived: boolean }) => [c.id, c.archived])).toEqual(
      expect.arrayContaining([[used.id, true], [replaced.body.data.id, false]]),
    );
    await request(app).get(`${API}/cvs/${used.id}/download`).set(auth).expect(200);
    await request(app).patch(`${API}/cvs/${used.id}`).set(auth).send({ label: 'x' }).expect(400);

    // Arsip boleh tetap dipakai lamaran lamanya, tapi tidak bisa dipilih untuk lamaran lain.
    await request(app).patch(`${API}/applications/${application.id}`).set(auth).send({ notes: 'ok', cvId: used.id }).expect(200);
    const another = await createApp();
    await request(app).patch(`${API}/applications/${another.id}`).set(auth).send({ cvId: used.id }).expect(400);

    // Hapus CV yang dipakai → diarsipkan; CV utama berpindah.
    const current = replaced.body.data;
    const delUsed = await request(app).delete(`${API}/cvs/${current.id}`).set(auth).expect(200);
    expect(delUsed.body.data).toEqual({ archived: true });
    const afterDel = (await request(app).get(`${API}/cvs`).set(auth)).body.data;
    expect(afterDel.find((c: { id: number }) => c.id === unused.id).isDefault).toBe(true);

    // Hapus CV yang tidak dipakai → data & file hilang.
    const fileUnused = await fileOf(unused.id);
    const delUnused = await request(app).delete(`${API}/cvs/${unused.id}`).set(auth).expect(200);
    expect(delUnused.body.data).toEqual({ archived: false });
    expect(existsSync(fileUnused)).toBe(false);
    expect(await prisma.cvDocument.count({ where: { id: BigInt(unused.id) } })).toBe(0);

    // Lamaran dihapus permanen → arsip yatim dibersihkan beserta filenya.
    await prisma.application.updateMany({ data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) } });
    await purgeDeleted(30);
    expect(await purgeOrphanArchived()).toBe(2);
    expect(existsSync(usedFile)).toBe(false);
    expect(await prisma.cvDocument.count()).toBe(0);
  });

  it('hanya pemilik: unduh, ubah, hapus, dan memakai CV di lamaran', async () => {
    const { app, auth, upload, createApp } = await setup();
    const cv = (await upload('CV Rina').expect(201)).body.data;
    const dl = await request(app).get(`${API}/cvs/${cv.id}/download`).set(auth).expect(200);
    expect(dl.headers['content-disposition']).toContain('CV Rina.pdf');

    const other = await registerUser(app);
    const otherAuth = { Authorization: `Bearer ${other.token}` };
    await request(app).get(`${API}/cvs/${cv.id}/download`).set(otherAuth).expect(404);
    await request(app).patch(`${API}/cvs/${cv.id}`).set(otherAuth).send({ label: 'x' }).expect(404);
    await request(app).delete(`${API}/cvs/${cv.id}`).set(otherAuth).expect(404);
    expect((await request(app).get(`${API}/cvs`).set(otherAuth)).body.data).toHaveLength(0);
    const res = await request(app).post(`${API}/applications`).set(otherAuth).send(validApplication({ cvId: cv.id }));
    expect([400, 404]).toContain(res.status);
    expect((await createApp()).cv.id).toBe(cv.id);
  });

  it('Isi Profil Karier dari CV: Premium, 1 kredit, hasil berupa draf', async () => {
    const { app, auth, upload } = await setup('premium');
    const cv = (await upload('CV Frontend').expect(201)).body.data;
    const res = await request(app).post(`${API}/ai/profile-from-cv`).set(auth).send({ cvId: cv.id }).expect(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ headline: expect.any(String), skills: expect.any(String), experience: expect.any(String) }),
    );
    expect(JSON.stringify(fake.prompts[0].parts)).toContain(CV_LINES[3]);
    const usage = await request(app).get(`${API}/me/ai-usage`).set(auth).expect(200);
    expect(usage.body.data).toMatchObject({ balance: 9, costs: { profile_extract: 1 } });
    // Profil belum tersimpan sampai pengguna menekan Simpan.
    expect((await request(app).get(`${API}/me/career-profile`).set(auth)).body.data.completeness).toBe(0);

    await request(app).post(`${API}/ai/profile-from-cv`).set(auth).send({}).expect(400);
    const other = await registerUser(app, { plan: 'premium', aiCredits: 5 });
    await request(app).post(`${API}/ai/profile-from-cv`).set({ Authorization: `Bearer ${other.token}` }).send({ cvId: cv.id }).expect(404);

    const standard = await setup('standard');
    const s = (await standard.upload('CV').expect(201)).body.data;
    const denied = await request(standard.app).post(`${API}/ai/profile-from-cv`).set(standard.auth).send({ cvId: s.id }).expect(403);
    expect(denied.body.error.requiredPlan).toBe('premium');
  });

  it('paket Basic → 403 PLAN_REQUIRED (standard)', async () => {
    const { app, auth, upload } = await setup('basic');
    const res = await upload('CV').expect(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_REQUIRED', requiredPlan: 'standard' });
    await request(app).get(`${API}/cvs`).set(auth).expect(403);
  });
});

describe('migrasi lampiran lama → CV Saya', () => {
  it('file identik digabung jadi satu CV, lamaran tertaut, duplikat dihapus, aman diulang', async () => {
    const { user, createApp } = await setup();
    const userId = BigInt(user.id);
    const apps = [await createApp({ company: 'A', cvId: null }), await createApp({ company: 'B', cvId: null }), await createApp({ company: 'C', cvId: null })];
    const same = makePdf();
    const files = [
      { app: apps[0], name: 'CV_Rina.pdf', stored: 'legacy-1.pdf', buffer: same, type: PDF_TYPE, at: '2026-10-01 08:00:00' },
      { app: apps[1], name: 'CV_Rina.pdf', stored: 'legacy-2.pdf', buffer: same, type: PDF_TYPE, at: '2026-10-02 08:00:00' },
      { app: apps[2], name: 'CV Inggris.docx', stored: 'legacy-3.docx', buffer: await makeDocx(), type: DOCX_TYPE, at: '2026-10-03 08:00:00' },
      { app: apps[2], name: 'foto.png', stored: 'legacy-4.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: 'image/png', at: '2026-10-03 09:00:00' },
    ];
    await mkdir(storedPath(userId, ''), { recursive: true });
    for (const f of files) {
      await writeFile(storedPath(userId, f.stored), f.buffer);
      await prisma.$executeRaw`INSERT INTO legacy_attachments (user_id, application_id, original_name, stored_name, mime_type, size, created_at)
        VALUES (${userId}, ${BigInt(f.app.id)}, ${f.name}, ${f.stored}, ${f.type}, ${f.buffer.length}, ${f.at})`;
    }

    const result = await migrateLegacyAttachments();
    expect(result).toMatchObject({ total: 4, created: 3, linked: 3, removedDuplicates: 1 });
    const cvs = await prisma.cvDocument.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    expect(cvs.map((c) => [c.label, c.archivedAt === null, c.isDefault])).toEqual([
      ['CV Rina', true, false],
      ['CV Inggris', true, true],
      ['foto', false, false],
    ]);
    expect(cvs[0].textContent).toContain(CV_LINES[3]);
    const linked = await prisma.application.findMany({ where: { userId }, orderBy: { id: 'asc' }, select: { cvId: true } });
    expect(linked.map((a) => a.cvId)).toEqual([cvs[0].id, cvs[0].id, cvs[1].id]);
    // Salinan duplikat dihapus, file yang dipakai CV tetap ada.
    const kept = cvs[0].storedName;
    const dropped = kept === 'legacy-1.pdf' ? 'legacy-2.pdf' : 'legacy-1.pdf';
    expect(existsSync(storedPath(userId, kept))).toBe(true);
    expect(existsSync(storedPath(userId, dropped))).toBe(false);

    const again = await migrateLegacyAttachments();
    expect(again).toMatchObject({ created: 0, linked: 0 });
    expect(await prisma.cvDocument.count({ where: { userId } })).toBe(3);
  });
});
