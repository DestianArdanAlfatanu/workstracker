import { Prisma } from '@prisma/client';
import {
  applicationCreateSchema,
  duplicateKeys,
  IMPORT_MAX_ROWS,
  MAX_ACTIVE_APPLICATIONS,
  parseDelimited,
  splitHeader,
  suggestMapping,
  type ImportCell,
  type ImportCommitInput,
  type ImportCommitResult,
  type ImportParseResult,
} from '@wt/shared';
import ExcelJS from 'exceljs';
import { AppError } from '../lib/http';
import { prisma } from '../lib/prisma';
import { toISODate } from '../lib/serialize';
import { toApplicationData } from './applications.service';

const MAX_COLUMNS = 60;

/** Nilai sel exceljs → nilai sederhana (tanggal jadi ISO, link jadi URL bila teksnya hanya label). */
function cellValue(v: ExcelJS.CellValue): ImportCell {
  if (v == null) return null;
  if (v instanceof Date) return toISODate(v);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('hyperlink' in v) {
      const label = typeof v.text === 'string' ? v.text : '';
      return /^https?:\/\//i.test(label) || !/^https?:\/\//i.test(v.hyperlink) ? label || v.hyperlink : v.hyperlink;
    }
    if ('formula' in v || 'sharedFormula' in v) return cellValue((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ('error' in v) return null;
  }
  return String(v);
}

async function readXlsx(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'File Excel tidak bisa dibaca. Simpan ulang sebagai .xlsx atau .csv.');
  }
  // Sheet "Lamaran" (hasil ekspor WorksTracker) atau sheet pertama yang berisi data.
  const ws = wb.getWorksheet('Lamaran') ?? wb.worksheets.find((s) => s.actualRowCount > 0) ?? wb.worksheets[0];
  if (!ws) throw new AppError('VALIDATION_ERROR', 'File Excel kosong');
  const rows: ImportCell[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length > IMPORT_MAX_ROWS + 1) return;
    const cells: ImportCell[] = [];
    const width = Math.min(row.cellCount, MAX_COLUMNS);
    for (let i = 1; i <= width; i++) cells.push(cellValue(row.getCell(i).value));
    if (cells.some((c) => c !== null && String(c).trim() !== '')) rows.push(cells);
  });
  return { rows, sheet: ws.name };
}

function readCsv(buffer: Buffer) {
  let content = buffer.toString('utf8');
  // CSV dari Excel versi lama kadang ber-encoding Windows-1252.
  if (content.includes('�')) content = buffer.toString('latin1');
  return { rows: parseDelimited(content).map((r) => r.slice(0, MAX_COLUMNS)) as ImportCell[][], sheet: null };
}

const isZip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b;

/** Baca file impor tanpa menyimpannya. */
export async function parseFile(file: { buffer: Buffer; originalname: string }): Promise<ImportParseResult> {
  const name = file.originalname.toLowerCase();
  let parsed: { rows: ImportCell[][]; sheet: string | null };
  if (name.endsWith('.xlsx') || isZip(file.buffer)) parsed = await readXlsx(file.buffer);
  else if (/\.(csv|tsv|txt)$/.test(name)) parsed = readCsv(file.buffer);
  else if (name.endsWith('.xls')) {
    throw new AppError('VALIDATION_ERROR', 'Format .xls lama belum didukung. Buka di Excel lalu simpan sebagai .xlsx atau .csv.');
  } else throw new AppError('VALIDATION_ERROR', 'Gunakan file .xlsx atau .csv');

  if (parsed.rows.length < 2) throw new AppError('VALIDATION_ERROR', 'File tidak berisi data. Baris pertama harus judul kolom, data mulai baris kedua.');
  const { headers, rows } = splitHeader(parsed.rows);
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new AppError('VALIDATION_ERROR', `Maksimal ${IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris per impor. Pecah file menjadi beberapa bagian.`);
  }
  return { headers, rows, suggestedMapping: suggestMapping(headers), sheet: parsed.sheet };
}

/**
 * Simpan baris impor (satu batch). Divalidasi ulang dengan skema form; duplikat terhadap lamaran
 * aktif dilewati bila diminta. Satu batch disimpan dalam satu transaksi.
 */
export async function commit(userId: bigint, input: ImportCommitInput): Promise<ImportCommitResult> {
  const existing = await prisma.application.findMany({
    where: { userId, deletedAt: null },
    select: { company: true, position: true, appliedAt: true, jobUrl: true },
  });
  const known = new Set(existing.flatMap((a) => duplicateKeys({ ...a, appliedAt: toISODate(a.appliedAt) })));

  const skipped: ImportCommitResult['skipped'] = [];
  const valid: Array<{ line: number; data: ReturnType<typeof applicationCreateSchema.parse> }> = [];
  for (const row of input.rows) {
    const parsed = applicationCreateSchema.safeParse(row.input);
    if (!parsed.success) {
      skipped.push({ line: row.line, reason: [...new Set(parsed.error.issues.map((i) => i.message))].join(', ') });
      continue;
    }
    const keys = duplicateKeys(parsed.data);
    if (input.skipDuplicates !== false && keys.some((k) => known.has(k))) {
      skipped.push({ line: row.line, reason: 'Sudah ada di WorksTracker', duplicate: true });
      continue;
    }
    keys.forEach((k) => known.add(k));
    valid.push({ line: row.line, data: parsed.data });
  }

  const slots = MAX_ACTIVE_APPLICATIONS - existing.length;
  if (valid.length > slots) {
    throw new AppError(
      'FORBIDDEN',
      `Sisa kuota ${Math.max(0, slots).toLocaleString('id-ID')} lamaran, sedangkan yang akan diimpor ${valid.length.toLocaleString('id-ID')}. Hapus lamaran lama atau kurangi baris.`,
    );
  }
  if (input.dryRun || valid.length === 0) {
    return { created: input.dryRun ? valid.length : 0, ids: [], skipped, remaining: slots - (input.dryRun ? valid.length : 0) };
  }

  const ids = await prisma.$transaction(
    async (tx) => {
      const created: bigint[] = [];
      for (const { data } of valid) {
        // CV tidak dipasang otomatis: lamaran lama belum tentu memakai CV yang sekarang.
        const app = await tx.application.create({
          data: { ...(toApplicationData(data) as Prisma.ApplicationUncheckedCreateInput), userId, cvId: null },
          select: { id: true, status: true },
        });
        created.push(app.id);
        await tx.statusHistory.create({ data: { applicationId: app.id, fromStatus: null, toStatus: app.status } });
      }
      return created;
    },
    { timeout: 60_000 },
  );
  return { created: ids.length, ids: ids.map(Number), skipped, remaining: slots - ids.length };
}
