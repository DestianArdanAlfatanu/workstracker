/**
 * Cek langsung pembaca halaman pada lowongan ASLI yang sedang tayang di tiap portal.
 *   npx tsx scripts/live-check.ts
 * Membuka halaman daftar tiap portal di Chrome headless, mengambil satu lowongan, lalu menjalankan
 * scrapePage di halaman itu (sama seperti extension: fungsi disuntikkan ke tab).
 * Indeed & beberapa halaman bisa memblokir browser otomatis; cek manual di Chrome biasa.
 */
import { chromium } from '@playwright/test';
import { scrapePage } from '../src/lib/scrape';

const PORTALS: Array<[string, string, RegExp]> = [
  ['linkedin', 'https://www.linkedin.com/jobs/search?keywords=frontend&location=Indonesia', /linkedin\.com\/jobs\/view\//],
  ['dealls', 'https://dealls.com/loker', /dealls\.com\/loker\/[^/?#]+~[^/?#]+/],
  ['glints', 'https://glints.com/id/opportunities/jobs/explore?keyword=admin', /glints\.com\/id\/opportunities\/jobs\/[^/]+\/[0-9a-f-]{36}/],
  ['kitalulus', 'https://www.kitalulus.com/lowongan', /kitalulus\.com\/lowongan\/detail\//],
  ['loker_id', 'https://www.loker.id/lowongan-kerja/staf-admin', /loker\.id\/[^?#]+\/[^?#]+\/[^?#]+\.html$/],
  ['kalibrr', 'https://www.kalibrr.com/id-ID/home', /kalibrr\.com\/id-ID\/c\/[^/]+\/jobs\/\d+\//],
  ['jobstreet', 'https://id.jobstreet.com/id/admin-jobs', /jobstreet\.com\/id\/job\/\d+/],
  ['karirhub', 'https://karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan', /karirhub\.kemnaker\.go\.id\/lowongan-dalam-negeri\/lowongan\/[^?#]+-[0-9a-f-]{36}/],
  ['indeed', 'https://id.indeed.com/jobs?q=admin', /indeed\.com\/(viewjob|rc\/clk|pagead)/],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  locale: 'id-ID',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
});
// tsx (esbuild keepNames) menyisipkan helper __name ke fungsi; build Vite extension tidak.
await ctx.addInitScript(() => {
  (globalThis as Record<string, unknown>).__name = (fn: unknown) => fn;
});
const rows: Array<Record<string, string>> = [];
for (const [name, list, pattern] of PORTALS) {
  const page = await ctx.newPage();
  try {
    await page.goto(list, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href));
    const href = links.find((h) => pattern.test(h));
    if (!href) throw new Error(`tidak ada link lowongan (judul: ${await page.title()})`);
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const r = await page.evaluate(scrapePage);
    const rp = (n: number | null) => (n == null ? '' : `${(n / 1e6).toLocaleString('id-ID')} jt`);
    rows.push({
      portal: name,
      perusahaan: r.company ?? '—',
      posisi: (r.position ?? '—').slice(0, 34),
      lokasi: (r.location ?? '—').slice(0, 28),
      kerja: r.workType ?? '',
      gaji: r.salaryMin ? `${rp(r.salaryMin)}${r.salaryMax !== r.salaryMin ? `–${rp(r.salaryMax)}` : ''}` : '',
      batas: r.deadline ?? '',
      deskripsi: String(r.description?.length ?? 0),
    });
  } catch (e) {
    rows.push({ portal: name, perusahaan: `GAGAL: ${String((e as Error).message).slice(0, 70)}` });
  }
  await page.close();
}
await browser.close();
console.table(rows);
