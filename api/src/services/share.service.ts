import { guessFromTitle, JOB_SITES, type ShareResolveResult } from '@wt/shared';
import { AppError } from '../lib/http';
import { logger } from '../lib/logger';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const UA = 'Mozilla/5.0 (compatible; WorksTracker/1.0; pembaca judul lowongan)';

/**
 * Hanya portal loker yang dikenal (tabel JOB_SITES), lewat http(s) port standar. Server tidak
 * pernah membuka alamat lain, termasuk IP/host internal, sehingga tidak bisa dipakai untuk SSRF.
 */
export function isAllowedJobUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.port && url.port !== '443' && url.port !== '80') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return JOB_SITES.some(([re]) => re.test(host));
}

async function readLimited(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

/** Buka halaman dengan redirect manual: setiap tujuan redirect juga harus portal yang diizinkan. */
async function fetchPage(start: string) {
  let url = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isAllowedJobUrl(url)) return null;
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return null;
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? 'text/html')) return null;
    return readLimited(res);
  }
  return null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

function meta(html: string, name: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  const content = tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
  return content ? decode(content).trim() || null : null;
}

const stripHtml = (s: string) =>
  decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

interface JobPosting {
  title?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } } | Array<{ address?: { addressLocality?: string } }>;
  jobLocationType?: string;
  validThrough?: string;
  description?: string;
}

function findJobPosting(html: string): JobPosting | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, json] of blocks) {
    try {
      const data = JSON.parse(json!) as unknown;
      const items = (Array.isArray(data) ? data : [data, ...((data as { '@graph'?: unknown[] })['@graph'] ?? [])]) as Array<Record<string, unknown>>;
      const job = items.find((d) => d && (d['@type'] === 'JobPosting' || (Array.isArray(d['@type']) && d['@type'].includes('JobPosting'))));
      if (job) return job as JobPosting;
    } catch {
      /* JSON-LD rusak: lewati */
    }
  }
  return null;
}

/** Ambil info lowongan dari halaman (JSON-LD JobPosting bila ada, selain itu og:title). */
export function extractFromHtml(html: string): Omit<ShareResolveResult, 'fetched'> {
  const job = findJobPosting(html);
  const ogTitle = meta(html, 'og:title') ?? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').trim();
  const guess = guessFromTitle(ogTitle);
  const org = typeof job?.hiringOrganization === 'string' ? job.hiringOrganization : job?.hiringOrganization?.name;
  const loc = Array.isArray(job?.jobLocation) ? job?.jobLocation[0]?.address?.addressLocality : job?.jobLocation?.address?.addressLocality;
  const deadline = job?.validThrough && /^\d{4}-\d{2}-\d{2}/.test(job.validThrough) ? job.validThrough.slice(0, 10) : null;
  const description = job?.description ? stripHtml(job.description) : meta(html, 'og:description') ?? meta(html, 'description');
  return {
    company: org?.trim() || guess.company,
    position: job?.title?.trim() || guess.position,
    location: loc?.trim() || guess.location,
    workType: job?.jobLocationType === 'TELECOMMUTE' ? 'remote' : null,
    deadline,
    description: description ? description.slice(0, 20000) : null,
    siteName: meta(html, 'og:site_name'),
  };
}

export async function resolve(url: string): Promise<ShareResolveResult> {
  if (!isAllowedJobUrl(url)) {
    throw new AppError('VALIDATION_ERROR', 'Link ini bukan dari portal loker yang dikenali. Isi data lowongan secara manual.');
  }
  try {
    const html = await fetchPage(url);
    if (html) return { fetched: true, ...extractFromHtml(html) };
  } catch (err) {
    logger.info({ err: err instanceof Error ? err.message : err, host: new URL(url).hostname }, 'Halaman lowongan tidak bisa dibaca');
  }
  return { fetched: false, company: null, position: null, location: null, workType: null, deadline: null, description: null, siteName: null };
}
