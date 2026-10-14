import type { Application } from '@prisma/client';
import { SOURCE_LABELS, STATUS_LABELS, WORK_TYPE_LABELS } from '@wt/shared';
import ExcelJS from 'exceljs';
import { toISODate } from '../lib/serialize';

const COLUMNS: Array<{ header: string; width: number; value: (a: Application) => string | number | null }> = [
  { header: 'Perusahaan', width: 24, value: (a) => a.company },
  { header: 'Posisi', width: 26, value: (a) => a.position },
  { header: 'Status', width: 12, value: (a) => STATUS_LABELS[a.status] },
  { header: 'Sumber', width: 16, value: (a) => SOURCE_LABELS[a.source] },
  { header: 'Tanggal lamar', width: 14, value: (a) => toISODate(a.appliedAt) },
  { header: 'Lokasi', width: 16, value: (a) => a.location },
  { header: 'Tipe kerja', width: 11, value: (a) => (a.workType ? WORK_TYPE_LABELS[a.workType] : null) },
  { header: 'Gaji min (Rp)', width: 14, value: (a) => a.salaryMin },
  { header: 'Gaji maks (Rp)', width: 14, value: (a) => a.salaryMax },
  { header: 'Tindak lanjut', width: 14, value: (a) => (a.nextActionDate ? toISODate(a.nextActionDate) : null) },
  { header: 'Catatan tindak lanjut', width: 28, value: (a) => a.nextActionNote },
  { header: 'URL lowongan', width: 32, value: (a) => a.jobUrl },
  { header: 'Kontak HR', width: 18, value: (a) => a.contactName },
  { header: 'Email HR', width: 24, value: (a) => a.contactEmail },
  { header: 'Catatan', width: 40, value: (a) => a.notes },
];

/** Cegah formula injection saat file dibuka di Excel/Sheets. */
function safeText(v: string) {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const cell = (v: string | number | null) => (typeof v === 'string' ? safeText(v) : v);

export function toCsv(rows: Application[]): Buffer {
  const escape = (v: string | number | null) => {
    if (v == null) return '';
    const s = String(cell(v));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    COLUMNS.map((c) => escape(c.header)).join(','),
    ...rows.map((r) => COLUMNS.map((c) => escape(c.value(r))).join(',')),
  ];
  // BOM agar Excel membaca UTF-8 dengan benar.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function toXlsx(rows: Application[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WorksTracker';
  const ws = wb.addWorksheet('Lamaran', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D5AF1' } };
  for (const r of rows) ws.addRow(COLUMNS.map((c) => cell(c.value(r))));
  for (const key of [8, 9]) ws.getColumn(key).numFmt = '#,##0';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
