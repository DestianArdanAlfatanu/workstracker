import type { Source } from './enums';

/**
 * Normalisasi link lowongan agar lowongan yang sama terdeteksi walau URL-nya berbeda
 * (parameter pelacak, tampilan pencarian dengan panel detail, subdomain, dll.).
 *  - LinkedIn: /jobs/view/<id> atau ?currentJobId=<id> → https://www.linkedin.com/jobs/view/<id>/
 *  - Instagram: /p/<kode> atau /reel/<kode> → https://www.instagram.com/p/<kode>/
 *  - Jobstreet: /job/<id> atau ?jobId=<id> → https://id.jobstreet.com/id/job/<id>
 *  - Indeed: ?jk=<id> / ?vjk=<id> → https://id.indeed.com/viewjob?jk=<id>
 *  - Loker.id: panel pencarian ?jobid=<id> → https://www.loker.id/lowongan-kerja?jobid=<id>
 *  - Portal lain (Glints, Dealls, KitaLulus, Kalibrr, Karirhub, situs karier): tanpa query & hash
 *    (kecuali parameter non-pelacak di situs karier), tanpa garis miring di akhir.
 */
export function normalizeJobUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^(www\.|m\.|id\.)/, '').toLowerCase();
  const param = (...names: string[]) => {
    for (const n of names) {
      const v = url.searchParams.get(n);
      if (v) return v;
    }
    return null;
  };

  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const id = /\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/.exec(url.pathname)?.[1] ?? param('currentJobId');
    if (id && /^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}/`;
  }
  if (host === 'instagram.com') {
    const code = /^\/(?:[^/]+\/)?(?:p|reel|reels)\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
    if (code) return `https://www.instagram.com/p/${code}/`;
  }
  if (host === 'jobstreet.com' || host.endsWith('.jobstreet.com') || host === 'jobstreet.co.id') {
    const id = /\/job\/(\d+)/.exec(url.pathname)?.[1] ?? param('jobId');
    if (id && /^\d+$/.test(id)) return `https://id.jobstreet.com/id/job/${id}`;
  }
  if (host === 'indeed.com' || host.endsWith('.indeed.com')) {
    const id = param('jk', 'vjk');
    if (id && /^[0-9a-f]{8,}$/i.test(id)) return `https://id.indeed.com/viewjob?jk=${id.toLowerCase()}`;
  }
  if (host === 'loker.id') {
    const id = param('jobid');
    if (id && /^\d+$/.test(id)) return `https://www.loker.id/lowongan-kerja?jobid=${id}`;
  }

  url.hash = '';
  // Portal loker: query hanya berisi pelacak/tampilan → buang semua.
  if (/(^|\.)(glints\.com|dealls\.com|kitalulus\.com|kalibrr\.com|loker\.id|kemnaker\.go\.id)$/.test(host)) {
    url.search = '';
  } else {
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|igsh|trk|ref|traceinfo)/i.test(key)) url.searchParams.delete(key);
    }
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/(?=$|\?)/, '');
}

/**
 * Portal loker yang dikenali dari domain. Sama dengan tabel di extension/src/lib/scrape.ts
 * (fungsi itu disuntikkan ke halaman sehingga tidak bisa mengimpor modul ini).
 */
export const JOB_SITES: ReadonlyArray<readonly [RegExp, Source]> = [
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)jobstreet\.(com|co\.id)$/, 'jobstreet'],
  [/(^|\.)glints\.com$/, 'glints'],
  [/(^|\.)kalibrr\.(com|id)$/, 'kalibrr'],
  [/(^|\.)dealls\.com$/, 'dealls'],
  [/(^|\.)kitalulus\.com$/, 'kitalulus'],
  [/(^|\.)loker\.id$/, 'loker_id'],
  [/(^|\.)indeed\.com$/, 'indeed'],
  [/(^|\.)karirhub\.kemnaker\.go\.id$/, 'karirhub'],
];

/** Sumber lowongan dari link: portal yang dikenal, selain itu "Situs perusahaan". Null bila bukan URL. */
export function sourceFromUrl(raw: string): Source | null {
  let host: string;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  return JOB_SITES.find(([re]) => re.test(host))?.[1] ?? 'company_site';
}

/** Ambil link pertama dari teks (mis. teks yang dibagikan dari aplikasi LinkedIn/Instagram). */
export function firstUrlIn(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  return m ? m[0].replace(/[.,;:!?)\]]+$/, '') : null;
}

/** Kunci pendek & unik dari link (ID/slug) untuk mempersempit pencarian duplikat di database. */
export function jobUrlKey(normalized: string): string {
  const url = new URL(normalized);
  return (
    /\/jobs\/view\/(\d+)\//.exec(normalized)?.[1] ??
    /instagram\.com\/p\/([^/]+)\//.exec(normalized)?.[1] ??
    /jobstreet\.com\/id\/job\/(\d+)/.exec(normalized)?.[1] ??
    url.searchParams.get('jk') ??
    url.searchParams.get('jobid') ??
    // Slug terakhir (UUID Glints/Karirhub, ID Kalibrr, slug Dealls/KitaLulus/Loker.id)
    url.pathname.split('/').filter(Boolean).pop()?.slice(0, 120) ??
    url.hostname
  );
}
