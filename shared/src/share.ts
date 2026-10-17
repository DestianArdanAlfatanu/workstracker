/**
 * Membaca loker yang dibagikan ke WorksTracker dari aplikasi lain (menu Share Android):
 * teks share LinkedIn/Jobstreet/Instagram dan judul halaman lowongan.
 */
import type { Source } from './enums';
import { firstUrlIn, normalizeJobUrl, sourceFromUrl } from './urls';

export interface ShareGuess {
  company: string | null;
  position: string | null;
  location: string | null;
}

export interface SharedJob extends ShareGuess {
  url: string | null;
  source: Source;
  /** Teks share tanpa link (mis. caption Instagram), untuk catatan/deskripsi. */
  text: string | null;
}

export interface ShareResolveResult extends ShareGuess {
  /** false bila halaman tidak bisa dibuka (diblokir, timeout, login wall). */
  fetched: boolean;
  workType: 'onsite' | 'hybrid' | 'remote' | null;
  deadline: string | null;
  description: string | null;
  siteName: string | null;
}

const clean = (s: string | undefined | null) => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? t : null;
};

const SITE_SUFFIX =
  /\s*[|\-–]\s*(LinkedIn|Jobstreet|JobStreet( Indonesia)?|Glints|Kalibrr|Dealls|KitaLulus|Loker\.id|Indeed( Indonesia)?|Karirhub.*|Instagram)\s*$/i;

/**
 * Tebak posisi & perusahaan dari judul halaman/og:title, mis.
 *  "PT Maju hiring Frontend Engineer in Jakarta, Indonesia | LinkedIn"
 *  "Frontend Engineer at PT Maju" / "Frontend Engineer di PT Maju"
 *  "Frontend Engineer - PT Maju - Jakarta | Glints"
 */
export function guessFromTitle(raw: string | null | undefined): ShareGuess {
  const none: ShareGuess = { company: null, position: null, location: null };
  const title = clean(raw);
  if (!title) return none;
  let m = /^(.+?) (?:hiring|sedang merekrut|membuka lowongan) (.+?)(?: in | di )(.+?)(?:\s*\|.*)?$/i.exec(title);
  if (m) return { company: clean(m[1]), position: clean(m[2]), location: clean(m[3]) };
  m = /^(.+?) (?:hiring|sedang merekrut) (.+?)(?:\s*\|.*)?$/i.exec(title);
  if (m) return { company: clean(m[1]), position: clean(m[2]), location: null };
  const t = title.replace(SITE_SUFFIX, '').replace(/^(lowongan( kerja)?|loker|job)\s+/i, '');
  m = /^(.+?)\s+(?:at|di|@)\s+(.+?)(?:\s*[|,]\s*(.+))?$/i.exec(t);
  if (m && !/\b(jakarta|bandung|surabaya|indonesia)\b/i.test(m[2]!)) return { position: clean(m[1]), company: clean(m[2]), location: clean(m[3]) };
  const parts = t.split(/\s+[-–|]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { position: parts[0]!, company: parts[1]!, location: parts[2] ?? null };
  return { ...none, position: t.length <= 150 ? t : null };
}

/** Pecah data dari menu Share: judul, teks, dan link (link kadang ada di dalam teks). */
export function parseSharedJob(input: { title?: string | null; text?: string | null; url?: string | null }): SharedJob {
  const rawUrl = clean(input.url) ?? firstUrlIn(input.text ?? '') ?? firstUrlIn(input.title ?? '');
  const url = rawUrl ? (normalizeJobUrl(rawUrl) ?? rawUrl) : null;
  const text = clean((input.text ?? '').replace(rawUrl ?? '\u0000', '').replace(/https?:\/\/\S+/g, ''));
  // Teks share aplikasi LinkedIn: "Check out this job at PT X: Frontend Engineer" / "Lihat pekerjaan ini di PT X: ..."
  const plain = (input.text ?? '').replace(/https?:\/\/\S+/g, '\n');
  const li = /(?:check out this job at|lihat (?:pekerjaan|lowongan) ini di|lowongan di)\s+(.+?):\s*(.+?)\s*(?:$|\n)/im.exec(plain);
  const guess: ShareGuess = li
    ? { company: clean(li[1]), position: clean(li[2]), location: null }
    : guessFromTitle(input.title && !/^https?:/i.test(input.title) ? input.title : null);
  return { ...guess, url, source: (url ? sourceFromUrl(url) : null) ?? 'other', text: li ? null : text };
}
