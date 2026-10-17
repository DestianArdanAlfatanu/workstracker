import {
  parseDate,
  parseDelimited,
  parseSalary,
  parseSource,
  parseStatus,
  prepareRow,
  splitHeader,
  suggestMapping,
  todayISO,
  type ImportCell,
  type ImportParseResult,
} from '@wt/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { API, registerUser, resetDb, validApplication } from './helpers';

beforeEach(resetDb);

async function setup() {
  const ctx = await registerUser();
  const auth = { Authorization: `Bearer ${ctx.token}` };
  const parse = (buffer: Buffer, filename: string) =>
    request(ctx.app).post(`${API}/applications/import/parse`).set(auth).attach('file', buffer, { filename });
  /** Parse → siapkan semua baris (pemetaan otomatis) → kirim. */
  const importAll = (result: ImportParseResult, extra: Record<string, unknown> = {}) => {
    const rows = result.rows.map((r, i) => prepareRow(r, result.suggestedMapping, { fillEmptyDate: true }, i + 2));
    return request(ctx.app)
      .post(`${API}/applications/import`)
      .set(auth)
      .send({ rows: rows.map((r) => ({ line: r.line, input: r.input })), ...extra });
  };
  return { ...ctx, auth, parse, importAll };
}

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('konversi nilai impor', () => {
  it('status, sumber, tanggal, dan gaji ala spreadsheet Indonesia', () => {
    expect(parseStatus('Ditolak')).toBe('rejected');
    expect(parseStatus('tidak lolos')).toBe('rejected');
    expect(parseStatus('Lolos berkas')).toBe('screening');
    expect(parseStatus('Interview HR tahap 2')).toBe('interview');
    expect(parseStatus('Sudah melamar')).toBe('applied');
    expect(parseStatus('Offering letter')).toBe('offer');
    expect(parseStatus('Withdrawn')).toBe('withdrawn');
    expect(parseStatus('???')).toBeNull();

    expect(parseSource('Linked In')).toBe('linkedin');
    expect(parseSource('Website perusahaan')).toBe('company_site');
    expect(parseSource('IG')).toBe('instagram');
    expect(parseSource('Karirhub Kemnaker')).toBe('karirhub');
    expect(parseSource('Loker.id')).toBe('loker_id');

    expect(parseDate('2026-10-03')).toBe('2026-10-03');
    expect(parseDate('03/10/2026')).toBe('2026-10-03');
    expect(parseDate('3-10-26')).toBe('2026-10-03');
    expect(parseDate('10/25/2026')).toBe('2026-10-25');
    expect(parseDate('13 Okt 2026')).toBe('2026-10-13');
    expect(parseDate('Senin, 5 Oktober 2026')).toBe('2026-10-05');
    expect(parseDate('Oct 13, 2026')).toBe('2026-10-13');
    expect(parseDate(46298)).toBe('2026-10-03');
    expect(parseDate('31/02/2026')).toBeNull();

    expect(parseSalary('Rp 8.000.000')).toEqual({ min: 8_000_000, max: null });
    expect(parseSalary('8,5 jt')).toEqual({ min: 8_500_000, max: null });
    expect(parseSalary('8.5 juta')).toEqual({ min: 8_500_000, max: null });
    expect(parseSalary('8-10 jt')).toEqual({ min: 8_000_000, max: 10_000_000 });
    expect(parseSalary('7.500k s/d 9.000k')).toEqual({ min: 7_500_000, max: 9_000_000 });
    expect(parseSalary('Rp 8.000.000,00')).toEqual({ min: 8_000_000, max: null });
    expect(parseSalary(12_000_000)).toEqual({ min: 12_000_000, max: null });
  });

  it('CSV: BOM, pemisah titik koma, kutip; pemetaan kolom & validasi per baris', () => {
    const csv = '﻿Nama Perusahaan;Jabatan;Tgl Lamar;Status;Gaji;Link;Keterangan\r\n' +
      'Tokopedia;Frontend;03/10/2026;Interview;8-10 jt;https://www.linkedin.com/jobs/view/4087654321/?trk=x;"Catatan; dengan ""kutip""\nbaris dua"\r\n' +
      ';Backend;04/10/2026;Ditolak;;;\r\n' +
      'Gojek;QA;;Rencana;;id.jobstreet.com/id/job/12345678;\r\n';
    const { headers, rows } = splitHeader(parseDelimited(csv));
    expect(headers[0]).toBe('Nama Perusahaan');
    const mapping = suggestMapping(headers);
    expect(mapping).toMatchObject({ company: 0, position: 1, appliedAt: 2, status: 3, salary: 4, jobUrl: 5, notes: 6 });

    const [a, b, c] = rows.map((r, i) => prepareRow(r, mapping, { fillEmptyDate: true, today: '2026-10-16' }, i + 2));
    expect(a!.errors).toEqual([]);
    expect(a!.data).toMatchObject({
      company: 'Tokopedia',
      status: 'interview',
      source: 'linkedin',
      appliedAt: '2026-10-03',
      salaryMin: 8_000_000,
      salaryMax: 10_000_000,
      jobUrl: 'https://www.linkedin.com/jobs/view/4087654321/',
      notes: 'Catatan; dengan "kutip"\nbaris dua',
    });
    expect(b!.errors).toContain('Perusahaan wajib diisi');
    expect(c!.data).toMatchObject({ status: 'wishlist', appliedAt: '2026-10-16', source: 'jobstreet', jobUrl: 'https://id.jobstreet.com/id/job/12345678' });
    expect(c!.warnings).toContain('Tanggal lamar kosong, diisi hari ini');
  });

  it('nilai yang tidak dikenali menjadi peringatan, bukan error', () => {
    const r = prepareRow(['PT A', 'Admin', '2026-10-01', 'Proses panjang sekali', 'Facebook', 'bukan-email'] as ImportCell[], {
      company: 0, position: 1, appliedAt: 2, status: 3, source: 4, contactEmail: 5,
    }, { fillEmptyDate: false }, 2);
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({ status: 'applied', source: 'other' });
    expect(r.warnings.join(' ')).toMatch(/Sumber "Facebook"/);
    expect(r.warnings.join(' ')).toMatch(/Email HR tidak valid/);
    expect(prepareRow(['PT A', 'Admin', ''], { company: 0, position: 1, appliedAt: 2 }, { fillEmptyDate: false }, 2).errors).toContain(
      'Tanggal lamar wajib diisi',
    );
  });
});

describe('impor lamaran (API)', () => {
  it('ekspor XLSX lalu impor kembali menghasilkan data yang sama', async () => {
    const { app, auth, parse, importAll } = await setup();
    const source = await registerUser(app);
    const sAuth = { Authorization: `Bearer ${source.token}` };
    await request(app).post(`${API}/applications`).set(sAuth).send(validApplication({
      company: '=Tokopedia', position: 'Frontend', status: 'interview', source: 'glints', salaryMin: 8_000_000, salaryMax: 9_000_000,
      workType: 'remote', nextActionDate: todayISO(), nextActionNote: 'Interview', jobUrl: 'https://glints.com/id/opportunities/jobs/abc', notes: 'Baris 1\nBaris 2',
      jobDescription: 'Kualifikasi: React',
    })).expect(201);
    await request(app).post(`${API}/applications`).set(sAuth).send(validApplication({ company: 'Gojek', position: 'QA', status: 'rejected' })).expect(201);

    const xlsx = await request(app).get(`${API}/applications/export?format=xlsx`).set(sAuth).buffer(true).parse(binary).expect(200);
    const parsed = await parse(xlsx.body as Buffer, 'lamaran.xlsx').expect(200);
    expect(parsed.body.data.sheet).toBe('Lamaran');
    expect(parsed.body.data.rows).toHaveLength(2);
    const res = await importAll(parsed.body.data).expect(201);
    expect(res.body.data).toMatchObject({ created: 2, skipped: [] });

    const fields = (list: Array<Record<string, unknown>>) =>
      list
        .map(({ company, position, status, source, appliedAt, salaryMin, salaryMax, workType, nextActionDate, nextActionNote, jobUrl, notes, jobDescription }) => ({
          company, position, status, source, appliedAt, salaryMin, salaryMax, workType, nextActionDate, nextActionNote, jobUrl, notes, jobDescription,
        }))
        .sort((x, y) => String(x.company).localeCompare(String(y.company)));
    const original = (await request(app).get(`${API}/applications`).set(sAuth)).body.data;
    const imported = (await request(app).get(`${API}/applications`).set(auth)).body.data;
    expect(fields(imported)).toEqual(fields(original));
    expect(imported.every((a: { cv: unknown }) => a.cv === null)).toBe(true);

    // CSV hasil ekspor juga terbaca
    const csv = await request(app).get(`${API}/applications/export?format=csv`).set(sAuth).buffer(true).parse(binary).expect(200);
    const csvParsed = await parse(csv.body as Buffer, 'lamaran.csv').expect(200);
    expect(csvParsed.body.data.headers.slice(0, 2)).toEqual(['Perusahaan', 'Posisi']);
    expect(csvParsed.body.data.rows[1][0]).toBe("'=Tokopedia");

    // Impor ulang: semuanya terdeteksi duplikat
    const again = await importAll(csvParsed.body.data).expect(201);
    expect(again.body.data.created).toBe(0);
    expect(again.body.data.skipped.every((s: { duplicate?: boolean }) => s.duplicate)).toBe(true);
  });

  it('XLSX buatan sendiri: sel tanggal, link, dan judul kolom bebas', async () => {
    const { app, auth, parse, importAll } = await setup();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Kosong');
    const ws = wb.addWorksheet('Lamaranku');
    ws.addRow(['No', 'Company', 'Role', 'Applied date', 'Progress', 'Link']);
    ws.addRow([1, 'Shopee', 'Data Analyst', new Date(Date.UTC(2026, 8, 30)), 'Wawancara', { text: 'Lihat', hyperlink: 'https://www.kalibrr.com/c/shopee/jobs/123/data-analyst' }]);
    ws.addRow([2, 'Traveloka', 'PM', '15 Sep 2026', 'Ditolak', null]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const parsed = (await parse(buffer, 'catatan.xlsx').expect(200)).body.data as ImportParseResult;
    expect(parsed.sheet).toBe('Lamaranku');
    expect(parsed.rows[0]).toEqual([1, 'Shopee', 'Data Analyst', '2026-09-30', 'Wawancara', 'https://www.kalibrr.com/c/shopee/jobs/123/data-analyst']);
    expect(parsed.suggestedMapping).toMatchObject({ company: 1, position: 2, appliedAt: 3, status: 4, jobUrl: 5 });
    await importAll(parsed).expect(201);
    const list = (await request(app).get(`${API}/applications?sort=company:asc`).set(auth)).body.data;
    expect(list.map((a: { company: string; status: string; source: string; appliedAt: string }) => [a.company, a.status, a.source, a.appliedAt])).toEqual([
      ['Shopee', 'interview', 'kalibrr', '2026-09-30'],
      ['Traveloka', 'rejected', 'other', '2026-09-15'],
    ]);
  });

  it('baris tidak valid dilewati dengan alasannya, dry run tidak menyimpan, kuota dicek, data per user', async () => {
    const { app, auth, user } = await setup();
    const rows = [
      { line: 2, input: { company: 'A', position: 'X', appliedAt: '2026-10-01' } },
      { line: 3, input: { company: '', position: 'Y', appliedAt: '2026-10-01' } },
      { line: 4, input: { company: 'B', position: 'Z', appliedAt: '2999-01-01' } },
      { line: 5, input: { company: 'A', position: 'X', appliedAt: '2026-10-01' } },
    ];
    const dry = await request(app).post(`${API}/applications/import`).set(auth).send({ rows, dryRun: true }).expect(200);
    expect(dry.body.data.created).toBe(1);
    expect(dry.body.data.skipped).toEqual([
      { line: 3, reason: 'Perusahaan wajib diisi' },
      { line: 4, reason: 'Tanggal lamar tidak boleh di masa depan' },
      { line: 5, reason: 'Sudah ada di WorksTracker', duplicate: true },
    ]);
    expect(await prisma.application.count()).toBe(0);

    const saved = await request(app).post(`${API}/applications/import`).set(auth).send({ rows }).expect(201);
    expect(saved.body.data.ids).toHaveLength(1);
    const history = await prisma.statusHistory.findMany({ where: { applicationId: BigInt(saved.body.data.ids[0]) } });
    expect(history).toMatchObject([{ fromStatus: null, toStatus: 'applied' }]);
    // Tidak melewati duplikat bila diminta
    const dup = await request(app).post(`${API}/applications/import`).set(auth).send({ rows: [rows[0]], skipDuplicates: false }).expect(201);
    expect(dup.body.data.created).toBe(1);

    // User lain: duplikat milik user ini tidak berpengaruh
    const other = await registerUser(app);
    const otherRes = await request(app).post(`${API}/applications/import`).set({ Authorization: `Bearer ${other.token}` }).send({ rows: [rows[0]] }).expect(201);
    expect(otherRes.body.data.created).toBe(1);

    // Kuota 2.000 lamaran aktif
    await prisma.application.createMany({
      data: Array.from({ length: 1997 }, (_, i) => ({ userId: BigInt(user.id), company: `C${i}`, position: 'P', appliedAt: new Date('2026-10-01'), status: 'applied' as const })),
    });
    const many = Array.from({ length: 2 }, (_, i) => ({ line: i + 2, input: { company: `Baru ${i}`, position: 'P', appliedAt: '2026-10-01' } }));
    const quota = await request(app).post(`${API}/applications/import`).set(auth).send({ rows: many }).expect(403);
    expect(quota.body.error.message).toMatch(/Sisa kuota 1 lamaran/);

    // Undo memakai aksi massal hapus yang sudah ada
    await request(app).post(`${API}/applications/bulk`).set(auth).send({ action: 'delete', ids: saved.body.data.ids }).expect(200);
  });

  it('menolak file kosong, format lain, dan tanpa login; template bisa diunduh', async () => {
    const { app, auth, parse } = await setup();
    await parse(Buffer.from('Perusahaan,Posisi\r\n'), 'kosong.csv').expect(400);
    const xls = await parse(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), 'lama.xls').expect(400);
    expect(xls.body.error.message).toMatch(/\.xls lama/);
    await parse(Buffer.from('hello'), 'foto.png').expect(400);
    await request(app).post(`${API}/applications/import/parse`).set(auth).expect(400);
    await request(app).post(`${API}/applications/import`).send({ rows: [] }).expect(401);
    await request(app).post(`${API}/applications/import`).set(auth).send({ rows: [] }).expect(400);

    const tpl = await request(app).get(`${API}/applications/import/template`).set(auth).buffer(true).parse(binary).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tpl.body as Buffer);
    const header = wb.getWorksheet('Lamaran')!.getRow(1).values as unknown[];
    expect(header).toContain('Deskripsi lowongan');
    const parsed = await parse(tpl.body as Buffer, 'template.xlsx').expect(200);
    expect(Object.keys(parsed.body.data.suggestedMapping)).toHaveLength(16);
  });
});
