/**
 * Ambil contoh halaman lowongan asli per portal → extension/test/fixtures/<portal>.html (dipangkas).
 *   node scripts/capture-fixtures.mjs
 * Dipakai saat menambah/memperbaiki pembaca portal. Butuh Chrome terpasang (Playwright channel "chrome").
 * Indeed tidak bisa diambil otomatis (diblokir "Security Check"); fixture-nya dibuat manual.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../test/fixtures/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// [portal, halaman daftar, pola link lowongan, selector konten yang disimpan]
const PORTALS = [
  ['dealls', 'https://dealls.com/loker/manual-quality-assurance-2~ordoapps', null, 'main'],
  ['glints', 'https://glints.com/id/opportunities/jobs/explore?keyword=programmer', /glints\.com\/id\/opportunities\/jobs\/[^/]+\/[0-9a-f-]{36}/, 'main'],
  ['kitalulus', 'https://www.kitalulus.com/lowongan', /kitalulus\.com\/lowongan\/detail\//, 'main'],
  ['loker_id', 'https://www.loker.id/lowongan-kerja/staf-admin', /loker\.id\/[^?#]+\/[^?#]+\/[^?#]+\.html$/, 'main'],
  ['kalibrr', 'https://www.kalibrr.com/id-ID/home', /kalibrr\.com\/id-ID\/c\/[^/]+\/jobs\/\d+\//, 'main'],
  ['jobstreet', 'https://id.jobstreet.com/id/programmer-jobs', /jobstreet\.com\/id\/job\/\d+/, '[data-automation="jobDetailsPage"]'],
  ['karirhub', 'https://karirhub.kemnaker.go.id/lowongan-dalam-negeri/lowongan', /karirhub\.kemnaker\.go\.id\/lowongan-dalam-negeri\/lowongan\/[^?#]+-[0-9a-f-]{36}/, 'main'],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  locale: 'id-ID',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
});

for (const [name, start, linkPattern, contentSel] of PORTALS) {
  const page = await ctx.newPage();
  try {
    await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    if (linkPattern) {
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
      const href = links.find((h) => linkPattern.test(h));
      if (!href) throw new Error('link lowongan tidak ditemukan');
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(5000);
    }
    const html = await page.evaluate((sel) => {
      const keep = [];
      keep.push(`<title>${document.title.replace(/</g, '&lt;')}</title>`);
      document.querySelectorAll('meta[property^="og:"], meta[name="description"]').forEach((m) => keep.push(m.outerHTML));
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => keep.push(s.outerHTML));
      const next = document.getElementById('__NEXT_DATA__');
      if (next) {
        // Simpan hanya bagian pageProps.job (Kalibrr) agar fixture kecil.
        try {
          const data = JSON.parse(next.textContent);
          const job = data?.props?.pageProps?.job;
          if (job) keep.push(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { job } } })}</script>`);
        } catch {
          /* abaikan */
        }
      }
      const main = document.querySelector(sel) ?? document.querySelector('main') ?? document.body;
      const clone = main.cloneNode(true);
      clone.querySelectorAll('script, style, svg, img, noscript, iframe').forEach((e) => e.remove());
      return `<!doctype html><html><head>${keep.join('\n')}</head><body>${clone.outerHTML}</body></html>`;
    }, contentSel);
    const url = page.url();
    writeFileSync(new URL(`${name}.html`, OUT), `<!-- ${url} -->\n${html}`);
    console.log(`${name.padEnd(10)} ${String(html.length).padStart(7)} B  ${url.slice(0, 110)}`);
  } catch (e) {
    console.log(`${name.padEnd(10)} GAGAL: ${String(e.message).slice(0, 100)}`);
  }
  await page.close();
}
await browser.close();
