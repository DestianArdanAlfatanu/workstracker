/**
 * Uji menyeluruh Chrome Extension di Chromium sungguhan (Playwright) terhadap localhost yang sedang jalan.
 *   node scripts/e2e-check.mjs [folder-screenshot]
 * Butuh: API (4000) & web (5173) menyala, admin uji E2E (e2e-admin@workstracker.local) di database dev,
 * dan `npx playwright install chromium` (Chrome bermerek memblokir --load-extension).
 * Halaman LinkedIn/Instagram disimulasikan (route) agar uji tidak bergantung pada akun & tampilan asli.
 */
import { chromium, request as pwRequest } from '@playwright/test';
import { execSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const WT = 'http://localhost:5173';
const SHOTS = process.argv[2] ? resolve(process.argv[2]) : null;
if (SHOTS && !existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
const POSTER = process.argv[3] ? resolve(process.argv[3]) : null;
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const log = (...a) => console.log('•', ...a);
const assert = (ok, msg) => {
  if (!ok) throw new Error(`GAGAL: ${msg}`);
  log('OK', msg);
};

/* ---------- build uji dengan ID extension tetap ---------- */
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });
const extId = [...createHash('sha256').update(der).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');
execSync('npx vite build', { env: { ...process.env, VITE_E2E_KEY: der.toString('base64') }, stdio: 'ignore' });
const dist = resolve('dist-e2e');

/* ---------- akun uji lewat admin E2E ---------- */
const adminApi = await pwRequest.newContext({ baseURL: WT });
const adminLogin = await (await adminApi.post('/api/v1/auth/login', { data: { email: 'e2e-admin@workstracker.local', password: 'e2e-admin-12345' } })).json();
const H = { Authorization: `Bearer ${adminLogin.data.accessToken}` };
const mkBuyer = async (plan) =>
  (
    await (
      await adminApi.post('/api/v1/admin/users', {
        headers: H,
        data: { name: `Uji Ext ${plan}`, email: `e2e-ext-${plan}-${Date.now()}@example.com`, plan, purchasedAt: today },
      })
    ).json()
  ).data;
const std = await mkBuyer('standard');
const basic = await mkBuyer('basic');

/* ---------- browser + extension ---------- */
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'wt-ext-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const popupUrl = (tabId) => `chrome-extension://${extId}/popup.html${tabId ? `?tab=${tabId}` : ''}`;

const LINKEDIN_URL = 'https://www.linkedin.com/jobs/view/4087654321/?trk=uji';
await ctx.route('https://www.linkedin.com/**', (route) =>
  route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><title>(2) Frontend Engineer | PT Uji Teknologi | LinkedIn</title></head><body><main>
      <div class="job-details-jobs-unified-top-card__company-name"><a href="#">PT Uji Teknologi</a></div>
      <div class="job-details-jobs-unified-top-card__job-title"><h1>Frontend Engineer</h1></div>
      <div class="job-details-jobs-unified-top-card__primary-description-container"><span class="tvm__text">Jakarta Selatan, Indonesia</span><span class="tvm__text"> · 1 hari lalu</span></div>
      <div class="job-details-preferences-and-skills">Hybrid · Full-time · Rp9.000.000/month - Rp13.000.000/month</div>
      <div id="job-details"><p>Tanggung jawab:</p><ul><li>Membangun aplikasi React</li><li>Menulis unit test</li></ul></div>
    </main></body></html>`,
  }),
);
const posterB64 = POSTER ? readFileSync(POSTER).toString('base64') : null;
await ctx.route('https://www.instagram.com/**', (route) =>
  route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><title>Instagram</title>
      <meta property="og:title" content="Kopi Senja (@kopisenja.jogja) on Instagram" />
      <meta property="og:description" content="88 likes, 5 comments - kopisenja.jogja on October 14, 2026: &quot;Lowongan Barista! Info lengkap di poster.&quot;" />
      </head><body style="margin:0;background:#fff"><main><article style="display:flex;justify-content:center">
      ${posterB64 ? `<img alt="poster" style="height:800px" src="data:image/jpeg;base64,${posterB64}">` : '<p>(tanpa poster)</p>'}
      </article></main></body></html>`,
  }),
);

async function tabIdOf(urlPattern) {
  const probe = await ctx.newPage();
  await probe.goto(popupUrl());
  const id = await probe.evaluate(async (pattern) => (await chrome.tabs.query({ url: pattern }))[0]?.id ?? 0, urlPattern);
  await probe.close();
  return id;
}
async function openPopup(tabId) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 380, height: 700 });
  await p.goto(popupUrl(tabId));
  await p.waitForFunction(() => !document.body.innerText.includes('Membaca halaman'), null, { timeout: 30000 });
  return p;
}
const shot = async (p, name) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

async function webLogin(email, password, newPassword) {
  const p = await ctx.newPage();
  await p.goto(`${WT}/login`);
  await p.getByLabel('Email').fill(email);
  await p.getByLabel('Password', { exact: true }).fill(password);
  await p.getByRole('button', { name: 'Masuk' }).click();
  if (newPassword) {
    await p.getByLabel('Password dari admin').fill(password);
    await p.getByLabel('Password baru', { exact: true }).fill(newPassword);
    await p.getByLabel('Ulangi password baru').fill(newPassword);
    await p.getByRole('button', { name: 'Simpan & mulai' }).click();
  }
  await p.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 60000 });
  return p;
}

try {
  // 1. Belum login di website → pop-up minta masuk
  let pop = await openPopup();
  assert((await pop.locator('body').innerText()).includes('Masuk dulu di WorksTracker'), 'belum login → pop-up meminta masuk di website');
  await shot(pop, '1-belum-login');
  await pop.close();

  // 2. Paket Basic → ajakan upgrade
  let web = await webLogin(basic.user.email, basic.tempPassword, 'rahasiabasic1');
  const li = await ctx.newPage();
  await li.goto(LINKEDIN_URL);
  pop = await openPopup(await tabIdOf('https://www.linkedin.com/*'));
  assert((await pop.locator('body').innerText()).includes('Chrome Extension ada di paket Standar'), 'paket Basic → ajakan upgrade');
  await shot(pop, '2-basic-upgrade');
  await pop.close();
  await web.request.post(`${WT}/api/v1/auth/logout`);
  await web.close();

  // 3. Standar: LinkedIn terisi otomatis → Applied → Simpan
  web = await webLogin(std.user.email, std.tempPassword, 'rahasiastd12');
  const stdAuth = async () => ({
    Authorization: `Bearer ${(await (await web.request.post(`${WT}/api/v1/auth/extension-session`)).json()).data.accessToken}`,
  });
  // CV Saya: dua CV, yang pertama otomatis jadi CV utama
  for (const label of ['CV Uji Utama', 'CV Uji Kedua']) {
    const res = await web.request.post(`${WT}/api/v1/cvs`, {
      headers: await stdAuth(),
      multipart: { label, file: { name: `${label}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% uji\n') } },
    });
    assert(res.status() === 201, `CV "${label}" terunggah`);
  }
  const liTab = await tabIdOf('https://www.linkedin.com/*');
  pop = await openPopup(liTab);
  const cvSelect = pop.getByLabel('CV yang dipakai');
  await cvSelect.waitFor();
  assert((await cvSelect.locator('option:checked').innerText()) === 'CV Uji Utama (utama)', 'pop-up: CV utama terpilih otomatis');
  await cvSelect.selectOption({ label: 'CV Uji Kedua' });
  assert((await pop.getByLabel(/Perusahaan/).inputValue()) === 'PT Uji Teknologi', 'LinkedIn: perusahaan terisi');
  assert((await pop.getByLabel(/Posisi/).inputValue()) === 'Frontend Engineer', 'LinkedIn: posisi terisi');
  assert((await pop.getByLabel('Lokasi').inputValue()) === 'Jakarta Selatan, Indonesia', 'LinkedIn: lokasi terisi');
  assert((await pop.getByLabel('Gaji min (Rp)').inputValue()) === '9.000.000', 'LinkedIn: gaji terisi');
  assert((await pop.getByLabel('Tipe kerja').inputValue()) === 'hybrid', 'LinkedIn: tipe kerja hybrid');
  assert((await pop.locator('.ai').count()) === 0, 'Standar: tombol AI tidak tampil');
  await pop.getByText('Applied', { exact: true }).click();
  await shot(pop, '3-linkedin-form');
  await pop.getByRole('button', { name: 'Simpan ke Applied' }).click();
  await pop.getByText('Lamaran tersimpan').waitFor();
  await shot(pop, '4-tersimpan');
  await pop.close();

  await web.goto(`${WT}/applications`);
  await web.getByText('PT Uji Teknologi').first().waitFor();
  const list = await (await web.request.get(`${WT}/api/v1/applications?q=PT%20Uji`, { headers: { Authorization: `Bearer ${(await (await web.request.post(`${WT}/api/v1/auth/extension-session`)).json()).data.accessToken}` } })).json();
  const saved = list.data[0];
  assert(
    saved.status === 'applied' && saved.source === 'linkedin' && saved.jobUrl === 'https://www.linkedin.com/jobs/view/4087654321/',
    'tersimpan di dashboard: status Applied, sumber LinkedIn, link dinormalisasi',
  );
  assert(saved.cv?.label === 'CV Uji Kedua', 'CV pilihan di pop-up ikut tersimpan di lamaran');

  // 4. Buka lagi → peringatan duplikat; website tetap login (cookie tidak dirotasi)
  pop = await openPopup(liTab);
  // Pengecekan duplikat berjalan di latar setelah form tampil.
  const dupShown = await pop.getByText('Lowongan ini sudah tersimpan').waitFor({ timeout: 15000 }).then(() => true, () => false);
  assert(dupShown, 'peringatan duplikat muncul');
  await shot(pop, '5-duplikat');
  await pop.close();
  await web.reload();
  await web.getByRole('heading', { name: 'Lamaran Saya' }).waitFor();
  log('OK website tetap login setelah dipakai extension');

  // 5. Upgrade Premium → Instagram: AI baca poster dari layar
  if (POSTER) {
    await adminApi.patch(`/api/v1/admin/users/${std.user.id}/plan`, { headers: H, data: { plan: 'premium', price: 60000, paidAt: today } });
    const ig = await ctx.newPage();
    await ig.goto('https://www.instagram.com/kopisenja.jogja/p/DUji123abc/?igsh=xyz');
    const igTab = await tabIdOf('https://www.instagram.com/*');
    // Buka pop-up di jendela terpisah agar tab Instagram tetap terlihat untuk tangkapan layar.
    const opener = await ctx.newPage();
    await opener.goto(popupUrl());
    const [winPop] = await Promise.all([
      ctx.waitForEvent('page'),
      opener.evaluate((url) => chrome.windows.create({ url, type: 'popup', width: 400, height: 720 }), popupUrl(igTab)),
    ]);
    await winPop.waitForLoadState();
    await winPop.waitForFunction(() => !document.body.innerText.includes('Membaca halaman'), null, { timeout: 30000 });
    assert((await winPop.locator('body').innerText()).includes('@kopisenja.jogja'), 'Instagram: akun pengunggah terbaca');
    // Halaman bantu (opener) menutupi tab Instagram di jendela yang sama → munculkan lagi tab Instagram,
    // seperti saat user mengklik ikon extension di atas post yang sedang dibuka.
    await opener.close();
    await ig.bringToFront();
    await winPop.getByRole('button', { name: /Isi dari poster di layar/ }).click();
    await winPop.waitForFunction(() => !document.body.innerText.includes('AI sedang membaca'), null, { timeout: 200000 });
    const company = await winPop.getByLabel(/Perusahaan/).inputValue();
    const position = await winPop.getByLabel(/Posisi/).inputValue();
    log(`AI poster → perusahaan "${company}", posisi "${position}", gaji ${await winPop.getByLabel('Gaji min (Rp)').inputValue()}–${await winPop.getByLabel('Gaji maks (Rp)').inputValue()}`);
    await shot(winPop, '6-instagram-ai');
    assert(/kopi senja/i.test(company) && /barista/i.test(position), 'Instagram Premium: AI mengisi perusahaan & posisi dari poster');
    await winPop.getByRole('button', { name: 'Simpan ke Wishlist' }).click();
    await winPop.getByText('Lamaran tersimpan').waitFor();
    log('OK Instagram tersimpan sebagai Wishlist');
  }

  // 6. Logout di website → extension ikut keluar
  await web.request.post(`${WT}/api/v1/auth/logout`);
  pop = await openPopup(liTab);
  assert((await pop.locator('body').innerText()).includes('Masuk dulu di WorksTracker'), 'logout di website → extension ikut keluar');
  console.log('\nSEMUA UJI EXTENSION LULUS');
} finally {
  await ctx.close();
  for (const u of [std, basic]) await adminApi.delete(`/api/v1/admin/users/${u.user.id}`, { headers: H });
  await adminApi.dispose();
}
