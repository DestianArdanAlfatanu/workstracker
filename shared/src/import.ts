/**
 * Impor lamaran dari spreadsheet (Excel/CSV/Google Sheets): pemetaan kolom otomatis dan
 * konversi nilai yang biasa ditulis orang Indonesia (status "Ditolak", tanggal 13/10/2026,
 * gaji "8,5 jt"). Dipakai web (pratinjau) dan API (validasi ulang) agar hasilnya sama.
 */
import { z } from 'zod';
import { isValidISODate, todayISO } from './dates';
import { SOURCE_LABELS, SOURCES, STATUS_LABELS, STATUSES, WORK_TYPES, type Source, type Status, type WorkType } from './enums';
import { applicationCreateSchema, type ApplicationCreate, type ApplicationCreateInput } from './schemas';
import { normalizeJobUrl, sourceFromUrl } from './urls';

export const IMPORT_MAX_ROWS = 2000;
/** Jumlah baris per permintaan simpan (web mengirim bertahap). */
export const IMPORT_BATCH_SIZE = 200;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export type ImportCell = string | number | boolean | null;

export const IMPORT_FIELD_KEYS = [
  'company',
  'position',
  'appliedAt',
  'status',
  'source',
  'location',
  'workType',
  'salary',
  'salaryMin',
  'salaryMax',
  'jobUrl',
  'contactName',
  'contactEmail',
  'nextActionDate',
  'nextActionNote',
  'notes',
  'jobDescription',
] as const;
export type ImportField = (typeof IMPORT_FIELD_KEYS)[number];

/** Field → indeks kolom di file. */
export type ImportMapping = Partial<Record<ImportField, number>>;

export interface ImportFieldInfo {
  key: ImportField;
  label: string;
  required?: boolean;
  hint?: string;
  /** Nama kolom yang dikenali (sudah dinormalisasi: huruf kecil, tanpa spasi/tanda baca). */
  aliases: string[];
}

export const IMPORT_FIELDS: ImportFieldInfo[] = [
  { key: 'company', label: 'Perusahaan', required: true, aliases: ['perusahaan', 'namaperusahaan', 'company', 'companyname', 'employer', 'instansi', 'kantor'] },
  { key: 'position', label: 'Posisi', required: true, aliases: ['posisi', 'jabatan', 'position', 'role', 'jobtitle', 'title', 'lowongan', 'pekerjaan', 'posisiyangdilamar'] },
  {
    key: 'appliedAt',
    label: 'Tanggal lamar',
    required: true,
    hint: 'Kosong = hari ini',
    aliases: ['tanggallamar', 'tanggalmelamar', 'tgllamar', 'tglmelamar', 'tanggal', 'tgl', 'dateapplied', 'applieddate', 'appliedon', 'applied', 'date', 'tanggaldaftar', 'tanggalapply'],
  },
  { key: 'status', label: 'Status', hint: 'Kosong = Applied', aliases: ['status', 'tahap', 'progress', 'progres', 'stage', 'hasil', 'statuslamaran'] },
  { key: 'source', label: 'Sumber', hint: 'Kosong = dari link', aliases: ['sumber', 'platform', 'source', 'via', 'kanal', 'channel', 'situs', 'sumberlowongan', 'infodari'] },
  { key: 'location', label: 'Lokasi', aliases: ['lokasi', 'kota', 'location', 'city', 'penempatan', 'domisili'] },
  { key: 'workType', label: 'Tipe kerja', aliases: ['tipekerja', 'sistemkerja', 'worktype', 'jeniskerja', 'modelkerja', 'tipe'] },
  { key: 'salary', label: 'Gaji (satu kolom)', hint: 'mis. 8-10 jt', aliases: ['gaji', 'salary', 'kisarangaji', 'rentanggaji', 'ekspektasigaji', 'expectedsalary', 'gajiditawarkan'] },
  { key: 'salaryMin', label: 'Gaji min', aliases: ['gajiminrp', 'gajimin', 'gajiminimum', 'salarymin', 'minsalary', 'minimumsalary'] },
  { key: 'salaryMax', label: 'Gaji maks', aliases: ['gajimaksrp', 'gajimaks', 'gajimax', 'gajimaksimum', 'salarymax', 'maxsalary', 'maximumsalary'] },
  { key: 'jobUrl', label: 'URL lowongan', aliases: ['urllowongan', 'url', 'link', 'linklowongan', 'joburl', 'tautan', 'linkloker'] },
  { key: 'contactName', label: 'Kontak HR', aliases: ['kontakhr', 'namahr', 'hr', 'recruiter', 'namakontak', 'contactname', 'contact', 'kontak'] },
  { key: 'contactEmail', label: 'Email HR', aliases: ['emailhr', 'email', 'emailkontak', 'contactemail', 'emailrecruiter', 'emailperusahaan'] },
  { key: 'nextActionDate', label: 'Tindak lanjut', aliases: ['tindaklanjut', 'tanggaltindaklanjut', 'jadwal', 'followup', 'nextaction', 'jadwalinterview', 'tanggalinterview', 'jadwalberikutnya'] },
  { key: 'nextActionNote', label: 'Catatan tindak lanjut', aliases: ['catatantindaklanjut', 'agenda', 'nextstep', 'langkahberikutnya'] },
  { key: 'notes', label: 'Catatan', aliases: ['catatan', 'notes', 'note', 'keterangan', 'komentar', 'remarks', 'ket'] },
  { key: 'jobDescription', label: 'Deskripsi lowongan', aliases: ['deskripsilowongan', 'deskripsi', 'jobdescription', 'description', 'kualifikasi', 'jd', 'persyaratan'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Tebak pemetaan kolom dari baris judul. Setiap kolom dipakai sekali; kecocokan persis didahulukan. */
export function suggestMapping(headers: string[]): ImportMapping {
  const cols = headers.map((h) => norm(h ?? ''));
  const mapping: ImportMapping = {};
  const used = new Set<number>();
  const assign = (score: (col: string, alias: string) => boolean) => {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== undefined) continue;
      const idx = cols.findIndex((c, i) => !used.has(i) && c && field.aliases.some((a) => score(c, a)));
      if (idx >= 0) {
        mapping[field.key] = idx;
        used.add(idx);
      }
    }
  };
  assign((c, a) => c === a);
  assign((c, a) => a.length >= 4 && (c.startsWith(a) || c.endsWith(a)));
  // Satu kolom "Gaji" sudah cukup bila tidak ada kolom min/maks terpisah, dan sebaliknya.
  if (mapping.salaryMin !== undefined || mapping.salaryMax !== undefined) delete mapping.salary;
  return mapping;
}

/* ------------------------------ Parser teks ------------------------------ */

/** Parse CSV/TSV (RFC 4180: kutip ganda, baris baru di dalam kutip). Pemisah dideteksi otomatis. */
export function parseDelimited(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => {
    let n = 0;
    let quoted = false;
    for (const c of firstLine) {
      if (c === '"') quoted = !quoted;
      else if (!quoted && c === ch) n++;
    }
    return n;
  };
  const [best, n] = (['\t', ';', ','] as const).map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1])[0]!;
  return n > 0 ? best : ',';
}

/** Pisahkan baris judul (baris pertama yang berisi) dari data. */
export function splitHeader(rows: ImportCell[][]): { headers: string[]; rows: ImportCell[][] } {
  const [head = [], ...rest] = rows;
  const width = Math.max(head.length, ...rest.slice(0, 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = head[i];
    return h == null || String(h).trim() === '' ? `Kolom ${i + 1}` : String(h).trim();
  });
  return { headers, rows: rest };
}

/* ---------------------------- Konversi nilai ---------------------------- */

const text = (v: ImportCell | undefined): string | null => {
  if (v == null || typeof v === 'boolean') return null;
  // Awalan ' dari pengaman formula ekspor WorksTracker/Excel dibuang.
  const s = String(v).trim().replace(/^'(?=[=+\-@])/, '');
  return s === '' ? null : s;
};

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

const STATUS_WORDS: Record<Status, string[]> = {
  wishlist: ['wishlist', 'wish list', 'incaran', 'rencana', 'belum melamar', 'belum apply', 'akan dilamar', 'simpan', 'saved'],
  applied: ['applied', 'apply', 'dilamar', 'melamar', 'sudah melamar', 'sudah apply', 'terkirim', 'kirim cv', 'submitted', 'menunggu', 'waiting', 'proses', 'in review', 'review'],
  screening: ['screening', 'seleksi', 'seleksi berkas', 'lolos berkas', 'tes', 'test', 'psikotes', 'assessment', 'online test', 'tes online', 'shortlist', 'shortlisted'],
  interview: ['interview', 'wawancara', 'interview hr', 'interview user', 'hr interview', 'user interview', 'tahap interview'],
  offer: ['offer', 'offering', 'offering letter', 'tawaran', 'penawaran', 'ditawari'],
  accepted: ['accepted', 'diterima', 'diterima kerja', 'hired', 'lolos', 'join', 'onboard', 'tanda tangan kontrak'],
  rejected: ['rejected', 'reject', 'ditolak', 'gagal', 'tidak lolos', 'tidak diterima', 'gugur', 'not selected', 'unsuccessful', 'declined by company'],
  withdrawn: ['withdrawn', 'withdraw', 'mundur', 'batal', 'dibatalkan', 'mengundurkan diri', 'tidak lanjut', 'cancel', 'cancelled'],
};

/** Status dari teks bebas; frasa terpanjang yang cocok menang ("tidak lolos" mengalahkan "lolos"). */
export function parseStatus(raw: string): Status | null {
  const w = words(raw);
  let best: { status: Status; len: number } | null = null;
  for (const status of STATUSES) {
    for (const phrase of [STATUS_LABELS[status], status, ...STATUS_WORDS[status]]) {
      const p = words(phrase);
      if (w.includes(p) && (!best || p.length > best.len)) best = { status, len: p.length };
    }
  }
  return best?.status ?? null;
}

const SOURCE_WORDS: Partial<Record<Source, string[]>> = {
  linkedin: ['linked in', 'linkedin'],
  jobstreet: ['jobstreet', 'job street', 'seek'],
  loker_id: ['loker id', 'lokerid', 'loker'],
  karirhub: ['karirhub', 'kemnaker', 'karir hub'],
  company_site: ['situs perusahaan', 'website perusahaan', 'web perusahaan', 'career site', 'careers', 'company website', 'website', 'email'],
  instagram: ['instagram', 'ig'],
  referral: ['referral', 'referensi', 'teman', 'orang dalam', 'rekomendasi', 'refer'],
  other: ['lainnya', 'other', 'lain lain', 'job fair', 'jobfair'],
};

export function parseSource(raw: string): Source | null {
  const w = words(raw);
  let best: { source: Source; len: number } | null = null;
  for (const source of SOURCES) {
    for (const phrase of [SOURCE_LABELS[source], source.replace('_', ' '), ...(SOURCE_WORDS[source] ?? [])]) {
      const p = words(phrase);
      if (w.includes(p) && (!best || p.length > best.len)) best = { source, len: p.length };
    }
  }
  return best?.source ?? null;
}

export function parseWorkType(raw: string): WorkType | null {
  const w = words(raw);
  if (/ (hybrid|hibrida|campuran) /.test(w)) return 'hybrid';
  if (/ (remote|wfh|work from home|jarak jauh|wfa) /.test(w)) return 'remote';
  if (/ (onsite|on site|wfo|work from office|kantor|di kantor) /.test(w)) return 'onsite';
  return (WORK_TYPES as readonly string[]).includes(raw.toLowerCase()) ? (raw.toLowerCase() as WorkType) : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, dec: 12, desember: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => {
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return isValidISODate(s) ? s : null;
};
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** Tanggal dari ISO, dd/mm/yyyy (format Indonesia), "13 Okt 2026", "Oct 13, 2026", atau serial Excel. */
export function parseDate(v: ImportCell | undefined): string | null {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') {
    // Serial Excel (hari sejak 1899-12-30), wajar untuk tahun 1970 s.d. 2100.
    if (v > 25_000 && v < 75_000) return new Date(Math.round((v - 25_569) * 86_400_000)).toISOString().slice(0, 10);
    return null;
  }
  const s = v.trim().toLowerCase();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let [d, mo] = [+m[1]!, +m[2]!];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // format bulan/tanggal (AS)
    return iso(fullYear(+m[3]!), mo, d);
  }
  m = /^(?:[a-z]+,?\s+)?(\d{1,2})\s+([a-z]+)\.?\s+(\d{2}|\d{4})$/.exec(s); // 13 Okt 2026, Senin 13 Oktober 2026
  if (m && MONTHS[m[2]!]) return iso(fullYear(+m[3]!), MONTHS[m[2]!]!, +m[1]!);
  m = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s); // Oct 13, 2026
  if (m && MONTHS[m[1]!]) return iso(+m[3]!, MONTHS[m[1]!]!, +m[2]!);
  if (/^\d{5}$/.test(s)) return parseDate(Number(s));
  return null;
}

/** Satu angka gaji: "8.000.000", "8 jt", "8,5 juta", "7500k", "Rp 8.000.000,00". */
function salaryNumber(part: string, unit?: string): number | null {
  const m = /(\d[\d.,]*)\s*(jt|juta|j|m|rb|ribu|k)?\b/.exec(part);
  if (!m) return null;
  const u = m[2] ?? unit;
  if (u) {
    // "8,5" / "8.5" = desimal; "7.500" = ribuan.
    const raw = m[1]!;
    const n = /^\d+[.,]\d{1,2}$/.test(raw) ? Number(raw.replace(',', '.')) : Number(raw.replace(/[.,]/g, ''));
    const value = /^(jt|juta|j|m)$/.test(u) ? n * 1_000_000 : n * 1_000;
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  const digits = m[1]!.replace(/[.,]\d{2}$/, '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

/** Gaji tunggal atau rentang ("8-10 jt", "8 jt s/d 10 jt"). */
export function parseSalary(v: ImportCell | undefined): { min: number | null; max: number | null } {
  if (v == null || v === '' || typeof v === 'boolean') return { min: null, max: null };
  if (typeof v === 'number') return { min: Math.round(v), max: null };
  const s = v.toLowerCase().replace(/rp\.?|idr/g, ' ');
  const parts = s.split(/\s*(?:-|–|s\/d|sd|sampai|hingga|to|~)\s*/).filter((p) => /\d/.test(p));
  const unit = /(jt|juta|rb|ribu|k)\b/.exec(parts.at(-1) ?? '')?.[1];
  const nums = parts.slice(0, 2).map((p) => salaryNumber(p, unit));
  return { min: nums[0] ?? null, max: nums[1] ?? null };
}

function parseUrl(raw: string): string | null {
  const s = raw.trim();
  const withProto = /^https?:\/\//i.test(s) ? s : /^(www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(s) && !/\s/.test(s) ? `https://${s}` : null;
  if (!withProto) return null;
  try {
    return new URL(withProto).toString();
  } catch {
    return null;
  }
}

export interface ImportOptions {
  /** Tanggal lamar kosong diisi hari ini. */
  fillEmptyDate: boolean;
  today?: string;
}

export interface PreparedRow {
  /** Nomor baris di file (judul = baris 1). */
  line: number;
  input: ApplicationCreateInput;
  data: ApplicationCreate | null;
  errors: string[];
  warnings: string[];
}

/** Ubah satu baris file menjadi input lamaran lalu validasi dengan skema yang sama seperti form. */
export function prepareRow(row: ImportCell[], mapping: ImportMapping, options: ImportOptions, line: number): PreparedRow {
  const get = (f: ImportField) => (mapping[f] === undefined ? undefined : row[mapping[f]!]);
  const warnings: string[] = [];
  const input: Record<string, unknown> = {
    company: text(get('company')) ?? '',
    position: text(get('position')) ?? '',
  };

  const rawDate = get('appliedAt');
  const applied = parseDate(rawDate);
  if (applied) input.appliedAt = applied;
  else if (text(rawDate)) input.appliedAt = text(rawDate); // biar pesan "tidak valid" muncul
  else if (options.fillEmptyDate) {
    input.appliedAt = options.today ?? todayISO();
    warnings.push('Tanggal lamar kosong, diisi hari ini');
  } else input.appliedAt = '';

  const rawStatus = text(get('status'));
  if (rawStatus) {
    const status = parseStatus(rawStatus);
    if (status) input.status = status;
    else warnings.push(`Status "${rawStatus}" tidak dikenali, dipakai Applied`);
  }

  const rawUrl = text(get('jobUrl'));
  if (rawUrl) {
    const url = parseUrl(rawUrl);
    if (url && url.length <= 500) input.jobUrl = normalizeJobUrl(url) ?? url;
    else warnings.push('Link lowongan tidak valid, dilewati');
  }

  const rawSource = text(get('source'));
  const source = rawSource ? parseSource(rawSource) : null;
  if (source) input.source = source;
  else if (input.jobUrl) input.source = sourceFromUrl(String(input.jobUrl)) ?? 'other';
  if (rawSource && !source) warnings.push(`Sumber "${rawSource}" tidak dikenali`);

  const rawWork = text(get('workType'));
  if (rawWork) {
    const wt = parseWorkType(rawWork);
    if (wt) input.workType = wt;
    else warnings.push(`Tipe kerja "${rawWork}" tidak dikenali`);
  }

  const range = parseSalary(get('salary'));
  const min = mapping.salaryMin !== undefined ? parseSalary(get('salaryMin')).min : range.min;
  const max = mapping.salaryMax !== undefined ? parseSalary(get('salaryMax')).min : range.max;
  if (min != null) input.salaryMin = min;
  if (max != null) input.salaryMax = max;

  const email = text(get('contactEmail'));
  if (email) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) input.contactEmail = email;
    else warnings.push('Email HR tidak valid, dilewati');
  }

  const next = get('nextActionDate');
  const nextDate = parseDate(next);
  if (nextDate) input.nextActionDate = nextDate;
  else if (text(next)) warnings.push('Tanggal tindak lanjut tidak dikenali, dilewati');

  for (const f of ['location', 'contactName', 'nextActionNote', 'notes', 'jobDescription'] as const) {
    const v = text(get(f));
    if (v) input[f] = v;
  }

  const parsed = applicationCreateSchema.safeParse(input);
  const errors = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.message))];
  return { line, input: input as ApplicationCreateInput, data: parsed.success ? parsed.data : null, errors, warnings };
}

/** Simpan hasil impor. Tiap baris divalidasi ulang di server dengan `applicationCreateSchema`. */
export const importCommitSchema = z.object({
  rows: z
    .array(z.object({ line: z.number().int().positive(), input: z.record(z.unknown()) }))
    .min(1, 'Tidak ada baris untuk diimpor')
    .max(IMPORT_BATCH_SIZE),
  skipDuplicates: z.boolean().default(true),
  /** true = hanya cek duplikat & kuota, tanpa menyimpan. */
  dryRun: z.boolean().default(false),
});
export type ImportCommitInput = z.input<typeof importCommitSchema>;

export interface ImportParseResult {
  headers: string[];
  rows: ImportCell[][];
  suggestedMapping: ImportMapping;
  /** Nama sheet yang dibaca (XLSX). */
  sheet: string | null;
}

export interface ImportCommitResult {
  created: number;
  ids: number[];
  /** Baris yang dilewati (nomor baris file) beserta alasannya. */
  skipped: Array<{ line: number; reason: string; duplicate?: boolean }>;
  /** Sisa kuota lamaran aktif setelah impor ini. */
  remaining: number;
}

/** Kunci duplikat: link yang dinormalisasi, atau perusahaan + posisi + tanggal lamar. */
export function duplicateKeys(a: { company: string; position: string; appliedAt: string; jobUrl?: string | null }): string[] {
  const keys = [`${norm(a.company)}|${norm(a.position)}|${a.appliedAt}`];
  const url = a.jobUrl ? normalizeJobUrl(a.jobUrl) : null;
  if (url) keys.push(url);
  return keys;
}
