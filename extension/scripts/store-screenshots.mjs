/**
 * Membuat gambar untuk listing Chrome Web Store dari extension sungguhan (Playwright + Chromium).
 *   node scripts/store-screenshots.mjs
 * Hasil di extension/store/: screenshot-1..3.png (1280×800) dan promo-440x280.png.
 * Butuh WorksTracker lokal menyala (WT_URL, default http://localhost:5173) dan akun Premium/Standar
 * (WT_EMAIL / WT_PASSWORD, default akun demo seed). Tidak ada data yang disimpan ke akun.
 * Halaman lowongan & Instagram disimulasikan dengan contoh netral (tanpa logo portal).
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const WT = (process.env.WT_URL || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.WT_EMAIL || 'demo@workstracker.local';
const PASSWORD = process.env.WT_PASSWORD || 'demo12345';
const OUT = resolve('store');
mkdirSync(OUT, { recursive: true });

/* Build uji dengan ID tetap (sama seperti e2e-check). Alamat website mengikuti WT_URL. */
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });
const extId = [...createHash('sha256').update(der).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');
execSync('npx vite build', { env: { ...process.env, VITE_E2E_KEY: der.toString('base64'), VITE_WT_URL: WT }, stdio: 'ignore' });
const dist = resolve('dist-e2e');

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'wt-store-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const popupUrl = (tabId) => `chrome-extension://${extId}/popup.html${tabId ? `?tab=${tabId}` : ''}`;

const PAGE_CSS = `body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;background:#f3f4f6;color:#111827}
  main{max-width:760px;margin:40px auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px 36px}
  h1{font-size:28px;margin:6px 0 4px} .muted{color:#6b7280} .chip{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:4px 12px;font-size:13px;margin-right:6px}
  li{margin:6px 0}`;

const JOB_URL = 'https://www.linkedin.com/jobs/view/4087650001/';
await ctx.route('https://www.linkedin.com/**', (route) =>
  route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><title>Admin Marketplace | Kedai Seduh Nusantara</title><style>${PAGE_CSS}</style></head><body><main>
      <div class="job-details-jobs-unified-top-card__company-name"><a href="#" style="color:#2563eb;text-decoration:none;font-weight:600">Kedai Seduh Nusantara</a></div>
      <div class="job-details-jobs-unified-top-card__job-title"><h1>Admin Marketplace</h1></div>
      <div class="job-details-jobs-unified-top-card__primary-description-container muted"><span class="tvm__text">Yogyakarta, Indonesia</span><span class="tvm__text"> · 2 hari lalu</span></div>
      <p class="job-details-preferences-and-skills" style="margin:18px 0"><span class="chip">Hybrid</span><span class="chip">Full-time</span><span class="chip">Rp5.000.000/month - Rp7.000.000/month</span></p>
      <div id="job-details"><h3>Tentang pekerjaan ini</h3><p class="muted">Mengelola toko online di Shopee dan Tokopedia, membalas chat pembeli, dan menyiapkan laporan penjualan mingguan.</p>
      <h3>Kualifikasi</h3><ul><li>Pengalaman 1 tahun mengelola marketplace</li><li>Teliti dan rapi dalam administrasi</li><li>Menguasai Excel atau Google Sheets</li></ul></div>
    </main></body></html>`,
  }),
);
await ctx.route('https://www.instagram.com/**', (route) =>
  route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><title>Instagram</title>
      <meta property="og:title" content="Kopi Senja (@kopisenja.jogja) on Instagram" />
      <meta property="og:description" content="88 likes, 5 comments - kopisenja.jogja on October 14, 2026: &quot;Lowongan Barista! Kirim CV ke email di poster sebelum 30 Oktober.&quot;" />
      <style>${PAGE_CSS}</style></head><body><div style="display:flex;justify-content:center;padding:40px">
      <div style="width:520px;height:640px;border-radius:18px;background:linear-gradient(160deg,#1e3a8a,#0f172a);color:#fff;padding:48px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between">
        <div><p style="letter-spacing:.2em;font-size:13px;opacity:.8;margin:0">KAMI MEMBUKA LOWONGAN</p><h1 style="font-size:54px;line-height:1;margin:16px 0 0">Barista</h1><p style="font-size:20px;margin:12px 0 0">Kopi Senja · Yogyakarta</p></div>
        <ul style="font-size:18px;padding-left:20px;margin:0"><li>Full-time, shift pagi/sore</li><li>Gaji Rp3,5 - 4,5 juta</li><li>Kirim CV sebelum 30 Oktober</li></ul>
      </div></div></body></html>`,
  }),
);

async function tabIdOf(pattern) {
  const probe = await ctx.newPage();
  await probe.goto(popupUrl());
  const id = await probe.evaluate(async (p) => (await chrome.tabs.query({ url: p }))[0]?.id ?? 0, pattern);
  await probe.close();
  return id;
}
async function popupShot(tabId, prepare) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 380, height: 700 });
  await p.goto(popupUrl(tabId));
  await p.waitForFunction(() => !document.body.innerText.includes('Membaca halaman'), null, { timeout: 30000 });
  await p.waitForTimeout(800);
  if (prepare) await prepare(p);
  const buf = await p.screenshot({ fullPage: true });
  await p.close();
  return buf;
}
const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

/** Bingkai browser sederhana + pop-up di kanan atas, ukuran pas 1280×800. */
async function compose(name, pageBuf, popBuf, url, caption) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;background:#0f172a;font-family:Segoe UI,Arial,sans-serif">
    <div style="position:absolute;left:0;top:0;width:1280px;height:44px;background:#e2e8f0;display:flex;align-items:center;gap:10px;padding:0 16px;box-sizing:border-box">
      <span style="display:flex;gap:6px"><i style="width:11px;height:11px;border-radius:50%;background:#ef4444;display:block"></i><i style="width:11px;height:11px;border-radius:50%;background:#f59e0b;display:block"></i><i style="width:11px;height:11px;border-radius:50%;background:#22c55e;display:block"></i></span>
      <span style="flex:1;margin-left:12px;background:#fff;border-radius:999px;padding:6px 16px;font-size:13px;color:#475569">${url}</span>
      <img src="${b64(readFileSync(resolve('public/icons/icon-32.png')))}" style="width:22px;height:22px;border-radius:6px;outline:2px solid #2563eb;outline-offset:2px">
    </div>
    <img src="${b64(pageBuf)}" style="position:absolute;left:0;top:44px;width:1280px;height:756px;object-fit:cover;object-position:top left">
    <div style="position:absolute;left:0;top:44px;width:1280px;height:756px;background:rgba(15,23,42,.18)"></div>
    <img src="${b64(popBuf)}" style="position:absolute;right:24px;top:52px;width:380px;max-height:740px;object-fit:cover;object-position:top;border-radius:12px;box-shadow:0 24px 60px -12px rgba(0,0,0,.55)">
    ${caption ? `<div style="position:absolute;left:40px;bottom:40px;max-width:700px;background:#0f172a;color:#fff;border-radius:14px;padding:16px 22px;font-size:24px;font-weight:700;letter-spacing:-.01em">${caption}</div>` : ''}
  </body></html>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(OUT, `${name}.png`) });
  await p.close();
}

try {
  // Login website (extension memakai sesi login ini).
  const web = await ctx.newPage();
  await web.goto(`${WT}/login`);
  await web.getByLabel('Email').fill(EMAIL);
  await web.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await web.getByRole('button', { name: 'Masuk', exact: true }).click();
  await web.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });

  // 1. Halaman lowongan → form terisi otomatis
  const job = await ctx.newPage();
  await job.goto(JOB_URL);
  const jobShot = await job.screenshot();
  const jobPop = await popupShot(await tabIdOf('https://www.linkedin.com/*'), (p) => p.getByText('Applied', { exact: true }).click());
  await compose('screenshot-1', jobShot, jobPop, 'linkedin.com/jobs/view/4087650001', 'Satu klik, data lowongan langsung terisi');

  // 2. Instagram → caption terbaca, tombol AI untuk poster (Premium)
  const ig = await ctx.newPage();
  await ig.goto('https://www.instagram.com/kopisenja.jogja/p/DContoh123/');
  const igShot = await ig.screenshot();
  const igPop = await popupShot(await tabIdOf('https://www.instagram.com/*'));
  await compose('screenshot-2', igShot, igPop, 'instagram.com/kopisenja.jogja', 'Loker dari poster Instagram juga bisa');

  // 3. Hasilnya di WorksTracker (papan lamaran)
  await web.setViewportSize({ width: 1280, height: 800 });
  await web.goto(`${WT}/applications`);
  await web.getByRole('heading', { name: 'Lamaran Saya' }).waitFor();
  const board = web.getByRole('tab', { name: 'Board' }).or(web.getByRole('button', { name: 'Board' }));
  if (await board.count()) await board.first().click();
  await web.waitForTimeout(1500);
  await web.screenshot({ path: join(OUT, 'screenshot-3.png') });

  // Promo tile 440×280
  const tile = await ctx.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  await tile.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;overflow:hidden;background:#0f172a;color:#fff;font-family:Segoe UI,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 36px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:12px"><img src="${b64(readFileSync(resolve('public/icons/icon-128.png')))}" style="width:48px;height:48px;border-radius:12px"><span style="font-size:26px;font-weight:800;letter-spacing:-.03em">WorksTracker</span></div>
    <p style="font-size:24px;font-weight:800;line-height:1.15;letter-spacing:-.02em;margin:22px 0 8px">Simpan lowongan dengan satu klik.</p>
    <p style="font-size:15px;color:#cbd5e1;margin:0">LinkedIn, Jobstreet, Glints, Instagram, dan situs karier.</p>
  </body></html>`);
  await tile.screenshot({ path: join(OUT, 'promo-440x280.png') });

  console.log(`Selesai: gambar Store ada di ${OUT}`);
} finally {
  await ctx.close();
}
