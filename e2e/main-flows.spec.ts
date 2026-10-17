import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { makePdf } from '../api/test/cv-files';
import { E2E_MAIL_DIR } from './paths';

type Plan = 'basic' | 'standard' | 'premium';
const todayJakarta = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

const ADMIN = { email: 'e2e-admin@workstracker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-12345' };

/**
 * Admin membuat akun pembeli lewat API (butuh seed dev); kembalikan email + password default.
 * Memakai request context terpisah agar cookie sesi admin tidak ikut ke browser.
 */
async function createBuyer(baseURL: string, domain = 'example.com', plan: Plan = 'standard') {
  const request = await playwrightRequest.newContext({ baseURL });
  const login = await request.post('/api/v1/auth/login', { data: ADMIN });
  expect(login.ok(), 'Login admin E2E gagal').toBeTruthy();
  const { accessToken } = (await login.json()).data;
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await request.post('/api/v1/admin/users', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: 'Pengguna E2E', email: `e2e-${id}@${domain}`, plan, purchasedAt: todayJakarta() },
  });
  expect(res.status()).toBe(201);
  const { user, tempPassword } = (await res.json()).data;
  await request.dispose();
  return { email: user.email as string, tempPassword: tempPassword as string };
}

/** Hapus semua akun uji (email e2e-…) agar database dev tidak penuh data tes. */
test.afterAll(async () => {
  const request = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL! });
  const login = await request.post('/api/v1/auth/login', { data: ADMIN });
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
  for (;;) {
    const res = await request.get('/api/v1/admin/users?q=e2e-&limit=100', { headers });
    const users = ((await res.json()).data as { id: number; email: string }[]).filter((u) =>
      u.email.startsWith('e2e-'),
    );
    if (users.length === 0) break;
    for (const u of users) await request.delete(`/api/v1/admin/users/${u.id}`, { headers });
  }
  await request.dispose();
});

/** Pembeli login dengan password default, wajib membuat password baru, lalu masuk dashboard. */
async function registerAndLogin(page: Page, plan: Plan = 'standard') {
  const { email, tempPassword } = await createBuyer(test.info().project.use.baseURL!, 'example.com', plan);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(tempPassword);
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page.getByRole('heading', { name: 'Buat password baru' })).toBeVisible();
  await page.getByLabel('Password dari admin').fill(tempPassword);
  await page.getByLabel('Password baru', { exact: true }).fill('rahasiabaru1');
  await page.getByLabel('Ulangi password baru').fill('rahasiabaru1');
  await page.getByRole('button', { name: 'Simpan & mulai' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  return email;
}

test('admin membuat akun pembeli dan mendapat kredensial', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Kelola Pembeli' })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah pembeli' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tambah pembeli' });
  const email = `e2e-admin-${Date.now()}@example.com`;
  await dialog.getByLabel('Nama').fill('Sinta Dewi');
  await dialog.getByLabel('Email (untuk login)').fill(email);
  await dialog.getByLabel('No. WhatsApp').fill('081234567890');
  await dialog.getByLabel('Harga (Rp)').fill('49000');
  await dialog.getByRole('button', { name: 'Buat akun' }).click();

  const creds = page.getByRole('dialog', { name: 'Akun pembeli dibuat' });
  await expect(creds.getByText(/^sinta\d{4}$/)).toBeVisible();
  await expect(creds.getByRole('link', { name: 'Kirim via WhatsApp' })).toHaveAttribute('href', /wa\.me\/6281234567890/);
  await creds.getByRole('button', { name: 'Selesai' }).click();

  await page.getByRole('searchbox', { name: 'Cari pembeli' }).fill(email);
  await expect(page.getByText(email).locator('visible=true').first()).toBeVisible();
});

async function addApplication(page: Page, company: string, position = 'Frontend Engineer') {
  // Desktop: tombol di sidebar; mobile: tombol "Tambah" di bottom nav.
  await page.locator('button:visible', { hasText: /^Tambah( lamaran)?$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await dialog.getByLabel('Perusahaan').fill(company);
  await dialog.getByLabel('Posisi').fill(position);
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText(`Lamaran ke ${company} disimpan`)).toBeVisible();
  await expect(dialog).toBeHidden();
}

test('pembeli login pertama kali, ganti password, lalu menambah lamaran', async ({ page }) => {
  await registerAndLogin(page);
  await expect(page.getByText('Belum ada lamaran')).toBeVisible();

  // Validasi field wajib tampil per input
  await page.locator('button:visible', { hasText: /^Tambah( lamaran)?$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog.getByText('Perusahaan wajib diisi')).toBeVisible();
  await expect(dialog.getByText('Posisi wajib diisi')).toBeVisible();
  await dialog.getByRole('button', { name: 'Batal' }).click();

  await addApplication(page, 'Tokopedia');
  await page.goto('/applications');
  await expect(page.getByText('Tokopedia').locator('visible=true').first()).toBeVisible();
  await expect(page.getByText('1 lamaran')).toBeVisible();
});

test('mengubah status langsung dari daftar dan tercatat di riwayat', async ({ page }) => {
  await registerAndLogin(page);
  await addApplication(page, 'Gojek');
  await page.goto('/applications');

  await page.getByRole('combobox', { name: 'Ubah status lamaran Gojek' }).locator('visible=true').first().click();
  await page.getByRole('option', { name: 'Interview' }).click();
  await expect(page.getByText('Status Gojek diubah ke Interview')).toBeVisible();

  await page.getByRole('button', { name: /Gojek/ }).locator('visible=true').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Applied → Interview')).toBeVisible();
  await expect(sheet.getByText('Dibuat sebagai Applied')).toBeVisible();
});

test('menghapus lamaran dengan konfirmasi lalu undo', async ({ page }) => {
  await registerAndLogin(page);
  await addApplication(page, 'Traveloka');
  await page.goto('/applications');

  await page.getByRole('button', { name: 'Aksi untuk lamaran Traveloka' }).locator('visible=true').first().click();
  await page.getByRole('menuitem', { name: 'Hapus' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Hapus lamaran?' });
  await confirm.getByRole('button', { name: 'Hapus' }).click();

  await expect(page.getByText('Lamaran ke Traveloka dihapus')).toBeVisible();
  await expect(page.getByText('Belum ada lamaran')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Lamaran ke Traveloka dipulihkan')).toBeVisible();
  await expect(page.getByText('Traveloka').locator('visible=true').first()).toBeVisible();
});


test('aksi massal, tampilan board, tugas, dan kalender', async ({ page }) => {
  await registerAndLogin(page);
  await addApplication(page, 'Alfa Corp');
  await addApplication(page, 'Beta Corp');
  await page.goto('/applications');

  // Pilih dua lamaran lalu ubah status sekaligus
  await page.getByRole('checkbox', { name: 'Pilih lamaran Alfa Corp' }).locator('visible=true').first().click();
  await page.getByRole('checkbox', { name: 'Pilih lamaran Beta Corp' }).locator('visible=true').first().click();
  await expect(page.getByText('2 dipilih')).toBeVisible();
  await page.getByRole('combobox', { name: 'Ubah status lamaran terpilih' }).click();
  await page.getByRole('option', { name: 'Screening' }).click();
  await expect(page.getByText('2 lamaran diubah ke Screening')).toBeVisible();

  // Board menampilkan keduanya di kolom Screening
  await page.getByRole('button', { name: 'Board' }).click();
  const column = page.getByRole('region', { name: /Kolom Screening, 2 lamaran/ });
  await expect(column).toBeVisible();
  await expect(column.getByText('Alfa Corp')).toBeVisible();

  // Tugas: tambah lalu selesaikan
  await page.goto('/tasks');
  await page.getByLabel('Judul tugas baru').fill('Latihan interview');
  await page.getByRole('button', { name: 'Tambah tugas' }).click();
  await expect(page.getByText('Latihan interview')).toBeVisible();
  await page.getByRole('checkbox', { name: /Latihan interview/ }).click();
  await expect(page.getByText('Tugas selesai: Latihan interview')).toBeVisible();

  // Kalender menampilkan tanggal lamar hari ini
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Kalender Aktivitas' })).toBeVisible();
  await expect(page.getByRole('gridcell', { selected: true })).toHaveAccessibleName(/2 aktivitas/);
});

test('AI Career Assistant: terkunci di Standar, upgrade Premium, lalu cover letter & persiapan interview', async ({ page }) => {
  const email = await registerAndLogin(page);
  await addApplication(page, 'Gamma Tech');
  await page.goto('/applications');
  await page.getByRole('button', { name: /^Gamma Tech/ }).locator('visible=true').first().click();
  await page.getByRole('button', { name: /AI Assistant/ }).click();
  const dialog = page.getByRole('dialog', { name: 'AI Career Assistant' });
  await expect(dialog.getByText('AI Career Assistant ada di paket Premium')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Upgrade ke Premium, bayar Rp 60\.000/ })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Hubungi admin via WhatsApp/ })).toHaveAttribute('href', /wa\.me/);
  await page.keyboard.press('Escape');

  // Admin meng-upgrade ke Premium lewat API (bayar selisih)
  const request = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL! });
  const login = await request.post('/api/v1/auth/login', { data: ADMIN });
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
  const list = await request.get(`/api/v1/admin/users?q=${encodeURIComponent(email)}`, { headers });
  const buyerId = (await list.json()).data[0].id;
  const upgraded = await request.patch(`/api/v1/admin/users/${buyerId}/plan`, {
    headers,
    data: { plan: 'premium', price: 60_000, paidAt: todayJakarta() },
  });
  expect(upgraded.ok()).toBeTruthy();
  await request.dispose();

  await page.reload();
  await page.getByRole('button', { name: /^Gamma Tech/ }).locator('visible=true').first().click();
  await page.getByRole('button', { name: /AI Assistant/ }).click();
  await dialog.getByRole('button', { name: 'Saya mengerti, lanjutkan' }).click();
  await expect(dialog.getByText('Sisa 150 kredit')).toBeVisible();

  await dialog.getByRole('button', { name: 'Buat cover letter' }).click();
  await expect(page.getByText('Cover letter selesai dibuat')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Cover letter' })).toHaveValue(/Dengan hormat/);
  await expect(dialog.getByText('Sisa 148 kredit')).toBeVisible();

  await dialog.getByRole('tab', { name: 'Persiapan Interview' }).click();
  await dialog.getByRole('button', { name: 'Siapkan interview' }).click();
  await expect(page.getByText('Persiapan interview siap')).toBeVisible();
  await dialog.getByRole('checkbox', { name: /Pilih pertanyaan 1/ }).click();
  await dialog.getByRole('button', { name: /Jadikan tugas latihan/ }).click();
  await expect(page.getByText('1 tugas latihan ditambahkan ke Tugas')).toBeVisible();
});

test('demo instan dari landing, insight, dan kartu progres', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Coba demo gratis' }).first().click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByText('Anda sedang memakai mode demo')).toBeVisible();

  await page.goto('/insight');
  await expect(page.getByRole('heading', { name: 'Insight' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Funnel lamaran' })).toBeVisible();

  await page.getByRole('button', { name: 'Bagikan progres' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bagikan progres' });
  await expect(dialog.getByRole('img', { name: 'Pratinjau kartu progres' })).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Unduh PNG' }).click();
  expect((await download).suggestedFilename()).toMatch(/progres-workstracker-.*\.png/);
});

test('isi otomatis dari teks lowongan lalu cek kecocokan CV', async ({ page }) => {
  await registerAndLogin(page, 'premium');

  await page.locator('button:visible', { hasText: /^Tambah( lamaran)?$/ }).first().click();
  const form = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await form.getByRole('button', { name: /Isi otomatis dari poster atau teks loker/ }).click();
  await form.getByRole('tab', { name: 'Dari teks' }).click();
  await form.getByPlaceholder('Tempel teks lowongan…').fill('Lowongan Frontend Engineer di PT Contoh Otomatis, Bandung, remote. '.repeat(3));
  await form.getByRole('button', { name: 'Isi otomatis', exact: true }).click();
  await expect(form.getByLabel('Perusahaan')).toHaveValue('PT Contoh Otomatis');
  await form.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Lamaran ke PT Contoh Otomatis disimpan')).toBeVisible();

  await page.goto('/applications');
  await page.getByRole('button', { name: /^PT Contoh Otomatis/ }).locator('visible=true').first().click();
  await page.getByRole('button', { name: /AI Assistant/ }).click();
  const ai = page.getByRole('dialog', { name: 'AI Career Assistant' });
  await ai.getByRole('button', { name: 'Saya mengerti, lanjutkan' }).click();
  await ai.getByRole('tab', { name: 'Cek CV' }).click();
  await ai.getByRole('button', { name: 'Cek kecocokan CV' }).click();
  await expect(ai.getByRole('img', { name: /Skor kecocokan 72 dari 100/ })).toBeVisible();
});

test('landing menampilkan 3 paket harga', async ({ page }) => {
  await page.goto('/#harga');
  const harga = page.locator('#harga');
  for (const [name, price] of [
    ['Basic', 'Rp 24.999'],
    ['Standar', 'Rp 49.999'],
    ['Premium', 'Rp 109.999'],
  ]) {
    await expect(harga.getByRole('heading', { name })).toBeVisible();
    await expect(harga.getByText(price, { exact: true })).toBeVisible();
    // Pembayaran otomatis aktif (simulasi di E2E) → tombol menuju halaman beli.
    await expect(harga.getByRole('link', { name: `Beli ${name}` })).toHaveAttribute('href', new RegExp(`/beli/`));
  }
  await expect(harga.getByText('Paling banyak dipilih')).toBeVisible();
  // Tidak ada lagi coretan diskon palsu
  await expect(page.locator('s')).toHaveCount(0);
});

test('paket Basic: menu Kalender terkunci dengan ajakan upgrade', async ({ page }) => {
  await registerAndLogin(page, 'basic');
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Kalender tersedia di paket Standar' })).toBeVisible();
  await expect(page.getByText('Rp 25.000').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upgrade ke Standar, bayar Rp 25.000' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Hubungi admin via WhatsApp/ })).toHaveAttribute('href', /wa\.me\/.*paket%20Basic%20ke%20Standar/);
  // Lamaran tetap bisa dipakai; CV Saya terkunci
  await addApplication(page, 'Basic Corp');
  await page.locator('button:visible', { hasText: /^Tambah( lamaran)?$/ }).first().click();
  await expect(page.getByText('Simpan CV sekali lalu pilih per lamaran dengan paket Standar.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/cv');
  await expect(page.getByRole('heading', { name: 'CV Saya tersedia di paket Standar' })).toBeVisible();
});

test('CV Saya: unggah CV, dipakai otomatis di lamaran baru, dibaca AI, dan isi Profil Karier', async ({ page }) => {
  await registerAndLogin(page, 'premium');
  await page.goto('/cv');
  await expect(page.getByLabel('Jumlah CV aktif')).toHaveText('0/5 CV');
  await page.getByLabel('File CV').setInputFiles({ name: 'CV_Frontend.pdf', mimeType: 'application/pdf', buffer: makePdf() });
  await expect(page.getByLabel('Nama CV')).toHaveValue('CV Frontend');
  await page.getByRole('button', { name: 'Simpan CV' }).click();
  await expect(page.getByText('CV disimpan dan dijadikan CV utama')).toBeVisible();
  const list = page.getByRole('list', { name: 'Daftar CV' });
  await expect(list.getByRole('heading', { name: 'CV Frontend' })).toBeVisible();
  await expect(list.getByText('Utama')).toBeVisible();
  await expect(page.getByLabel('Jumlah CV aktif')).toHaveText('1/5 CV');

  // Ganti nama lewat menu aksi
  await page.getByRole('button', { name: 'Aksi CV Frontend' }).click();
  await page.getByRole('menuitem', { name: 'Ganti nama' }).click();
  const rename = page.getByRole('dialog', { name: 'Ganti nama CV' });
  await rename.getByLabel('Nama CV').fill('CV Frontend 2026');
  await rename.getByRole('button', { name: 'Simpan' }).click();
  await expect(list.getByRole('heading', { name: 'CV Frontend 2026' })).toBeVisible();

  // Lamaran baru otomatis memakai CV utama
  await page.locator('button:visible', { hasText: /^Tambah( lamaran)?$/ }).first().click();
  const form = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await expect(form.getByRole('combobox', { name: 'CV yang dipakai' })).toHaveText(/CV Frontend 2026 \(utama\)/);
  await form.getByLabel('Perusahaan').fill('Delta CV Corp');
  await form.getByLabel('Posisi').fill('Frontend Engineer');
  await form.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Lamaran ke Delta CV Corp disimpan')).toBeVisible();

  await page.goto('/applications');
  await page.getByRole('button', { name: /^Delta CV Corp/ }).locator('visible=true').first().click();
  const sheet = page.getByRole('dialog', { name: /Frontend Engineer/ });
  await expect(sheet.getByText('CV Frontend 2026')).toBeVisible();
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Unduh' }).click();
  expect((await download).suggestedFilename()).toBe('CV_Frontend.pdf');

  // AI Assistant memakai CV lamaran secara default
  await sheet.getByRole('button', { name: /AI Assistant/ }).click();
  const ai = page.getByRole('dialog', { name: 'AI Career Assistant' });
  await ai.getByRole('button', { name: 'Saya mengerti, lanjutkan' }).click();
  await expect(ai.getByRole('combobox', { name: 'CV yang dibaca AI' })).toHaveText(/CV Frontend 2026/);
  await ai.getByRole('button', { name: 'Buat cover letter' }).click();
  await expect(page.getByText('Cover letter selesai dibuat')).toBeVisible();
  await page.keyboard.press('Escape');

  // Profil Karier diisi dari CV (draf, disimpan manual)
  await page.goto('/profil-karier');
  await page.getByRole('button', { name: 'Isi dari CV' }).click();
  await expect(page.getByText('Form terisi dari CV. Periksa dulu, lalu tekan Simpan profil.')).toBeVisible();
  await expect(page.getByLabel('Headline')).toHaveValue('Frontend Developer');
  await expect(page.getByLabel('Kota domisili')).toHaveValue('Bandung');
  await page.getByRole('button', { name: 'Simpan profil' }).click();
  await expect(page.getByText('Profil karier disimpan')).toBeVisible();
});

test('impor lamaran dari CSV dan tempel dari Google Sheets, lalu batalkan impor', async ({ page }) => {
  await registerAndLogin(page);
  await page.goto('/applications');
  await page.getByRole('button', { name: 'Impor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Impor lamaran' });
  const csv =
    'Nama Perusahaan;Jabatan;Tgl Lamar;Status;Gaji;Link\r\n' +
    'Impor Satu;Frontend;03/10/2026;Wawancara;8-10 jt;https://www.linkedin.com/jobs/view/4011111111/\r\n' +
    'Impor Dua;Backend;13 Okt 2026;Ditolak;;\r\n' +
    ';Tanpa perusahaan;01/10/2026;;;\r\n';
  await dialog.getByLabel('File spreadsheet').setInputFiles({ name: 'lamaran-lama.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByText('lamaran-lama.csv: 3 baris')).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Kolom untuk Perusahaan' })).toHaveText(/Nama Perusahaan/);
  await dialog.getByRole('button', { name: 'Lanjut ke pratinjau' }).click();
  const summary = dialog.getByLabel('Ringkasan impor');
  await expect(summary.getByText('Siap diimpor')).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Pratinjau impor' }).getByRole('listitem')).toHaveCount(2);
  await expect(dialog.getByText('1 baris bermasalah (dilewati)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Impor 2 lamaran' }).click();
  await expect(dialog.getByText('2 lamaran diimpor')).toBeVisible();
  await dialog.getByRole('button', { name: 'Selesai' }).click();
  await expect(page.getByText('Impor Satu').locator('visible=true').first()).toBeVisible();
  await expect(page.getByText('2 lamaran', { exact: true })).toBeVisible();

  // Tempel dari Google Sheets: satu baris sudah ada, satu baru; lalu impor dibatalkan
  await page.getByRole('button', { name: 'Impor', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Tempel dari Google Sheets' }).click();
  await dialog
    .getByLabel(/tempel di sini/)
    .fill('Perusahaan\tPosisi\tTanggal lamar\tStatus\nImpor Satu\tFrontend\t2026-10-03\tInterview\nImpor Tiga\tQA\t2026-10-05\tApplied');
  await dialog.getByRole('button', { name: 'Lanjut', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lanjut ke pratinjau' }).click();
  await expect(dialog.getByText('Lewati 1 lamaran yang sudah ada di WorksTracker')).toBeVisible();
  await dialog.getByRole('button', { name: 'Impor 1 lamaran' }).click();
  await expect(dialog.getByText('1 lamaran diimpor')).toBeVisible();
  await dialog.getByRole('button', { name: 'Batalkan impor' }).click();
  await expect(page.getByText('1 lamaran hasil impor dibatalkan')).toBeVisible();
  await expect(page.getByText('2 lamaran', { exact: true })).toBeVisible();
});

/** Kirim data seperti menu Bagikan Android ke Share Target (POST multipart yang ditangani service worker). */
async function shareToApp(page: Page, data: { title?: string; text?: string; url?: string; image?: boolean }) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Halaman harus sudah dikendalikan SW agar POST ditangkap.
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
  await page.evaluate(async (d) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/share-target';
    form.enctype = 'multipart/form-data';
    for (const key of ['title', 'text', 'url'] as const) {
      if (!d[key]) continue;
      const input = document.createElement('input');
      input.name = key;
      input.value = d[key]!;
      form.appendChild(input);
    }
    if (d.image) {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'poster.png', { type: 'image/png' });
      const input = document.createElement('input');
      input.type = 'file';
      input.name = 'images';
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }, data);
  await page.waitForURL(/\/bagikan\?/);
}

test('PWA: manifest dengan Share Target, lalu loker dibagikan dari LinkedIn menjadi form terisi', async ({ page }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', share_target: { action: '/share-target', method: 'POST' } });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  await registerAndLogin(page);
  await shareToApp(page, {
    title: 'LinkedIn',
    text: 'Check out this job at PT Bagikan Jaya: Mobile Developer https://www.linkedin.com/jobs/view/4099999999/?trk=share',
  });
  const form = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await expect(form.getByLabel('Perusahaan')).toHaveValue('PT Bagikan Jaya');
  await expect(form.getByLabel('Posisi')).toHaveValue('Mobile Developer');
  await expect(form.getByRole('combobox', { name: 'Sumber' })).toHaveText('LinkedIn');
  await expect(form.getByLabel('URL lowongan')).toHaveValue('https://www.linkedin.com/jobs/view/4099999999/');
  await form.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Lamaran ke PT Bagikan Jaya disimpan')).toBeVisible();

  // Dibagikan lagi → peringatan duplikat, form tidak terbuka otomatis
  await page.goto('/applications');
  await shareToApp(page, { url: 'https://www.linkedin.com/jobs/view/4099999999/' });
  await expect(page.getByText(/Lowongan ini sudah tersimpan: Mobile Developer di PT Bagikan Jaya/)).toBeVisible();
  await expect(form).toBeHidden();
});

test('PWA: screenshot poster dibagikan ke aplikasi lalu dibaca AI (Premium)', async ({ page }) => {
  await registerAndLogin(page, 'premium');
  await shareToApp(page, { image: true });
  const form = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await expect(form.getByRole('img', { name: 'Poster 1' })).toBeVisible();
  await form.getByRole('button', { name: 'Isi otomatis', exact: true }).click();
  await expect(form.getByLabel('Perusahaan')).toHaveValue('PT Poster Sejahtera');
});

test('PWA: data terakhir tetap bisa dibuka saat offline', async ({ page, context }) => {
  await registerAndLogin(page);
  await addApplication(page, 'Offline Corp');
  await page.goto('/applications');
  await expect(page.getByText('Offline Corp').locator('visible=true').first()).toBeVisible();
  await page.waitForTimeout(2000); // cache React Query tersimpan ke perangkat (throttle 1,5 detik)

  await context.setOffline(true);
  await expect(page.getByText('Anda sedang offline')).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard' }).locator('visible=true').first().click();
  await page.getByRole('link', { name: 'Lamaran' }).locator('visible=true').first().click();
  await expect(page.getByText('Offline Corp').locator('visible=true').first()).toBeVisible();
  await context.setOffline(false);
});

test('HP: pindah status di board tanpa menyeret, dan menu Lainnya', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Khusus tampilan HP');
  await registerAndLogin(page);
  await addApplication(page, 'Kanban HP');
  await page.goto('/applications?view=board');
  await expect(page.getByRole('group', { name: 'Status lamaran' }).getByRole('button', { name: /Applied 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pindahkan Kanban HP ke status lain' }).click();
  const sheet = page.getByRole('dialog', { name: 'Pindah ke status' });
  await sheet.getByRole('button', { name: 'Interview' }).click();
  await expect(page.getByText('Status Kanban HP diubah ke Interview')).toBeVisible();
  await expect(page.getByRole('region', { name: /Kolom Interview, 1 lamaran/ })).toBeAttached();

  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await nav.getByRole('button', { name: 'Lainnya' }).click();
  const more = page.getByRole('dialog', { name: 'Menu lainnya' });
  await more.getByRole('button', { name: 'CV Saya' }).click();
  await expect(page.getByRole('heading', { name: 'CV Saya' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByText('Aplikasi di HP')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Notifikasi di perangkat ini/ })).toBeVisible();
});

// PNG 1×1 sebagai "poster" (AI_FAKE mengembalikan contoh hasil poster).
const POSTER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('isi otomatis dari poster loker (Premium)', async ({ page }) => {
  await registerAndLogin(page, 'premium');
  await page.locator('button:visible', { hasText: /^Tambah( lamaran)?$/ }).first().click();
  const form = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await form.getByRole('button', { name: /Isi otomatis dari poster atau teks loker/ }).click();
  await expect(form.getByText('Sisa 150 kredit')).toBeVisible();
  await form.getByLabel('Pilih gambar poster').setInputFiles([
    { name: 'slide1.png', mimeType: 'image/png', buffer: POSTER_PNG },
    { name: 'slide2.png', mimeType: 'image/png', buffer: POSTER_PNG },
  ]);
  await expect(form.getByRole('img', { name: 'Poster 2' })).toBeVisible();
  await expect(form.getByText('aksi ini 2 kredit')).toBeVisible();
  await form.getByRole('button', { name: 'Isi otomatis', exact: true }).click();

  await expect(form.getByLabel('Perusahaan')).toHaveValue('PT Poster Sejahtera');
  await expect(form.getByLabel('Posisi')).toHaveValue('Admin Gudang');
  await expect(form.getByText('Sisa 148 kredit')).toBeVisible();
  await form.getByText('Teks dari poster').click();
  await expect(form.getByText(/WE ARE HIRING/)).toBeVisible();
  await form.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Lamaran ke PT Poster Sejahtera disimpan')).toBeVisible();
});

/** Link reset dari email preview terbaru untuk alamat tersebut (server E2E tidak mengirim email sungguhan). */
async function resetLinkFor(email: string) {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const files = (await readdir(E2E_MAIL_DIR).catch(() => [] as string[])).filter((f) => f.includes(email)).sort();
      if (!files.length) return undefined;
      const html = await readFile(path.join(E2E_MAIL_DIR, files[files.length - 1]), 'utf8');
      link = /href="(https?:\/\/[^"]+\/reset-password\?token=[^"]+)"/.exec(html)?.[1];
      return link;
    })
    .toBeTruthy();
  return new URL(link!);
}

test('lupa password: minta link, buat password baru, lalu masuk', async ({ page }) => {
  // Domain yang "terkirim" (example.com sengaja dilewati pengirim email).
  const { email, tempPassword } = await createBuyer(test.info().project.use.baseURL!, 'mailuji.id');

  await page.goto('/login');
  await page.getByRole('link', { name: 'Lupa password?' }).click();
  await expect(page.getByRole('heading', { name: 'Lupa password?' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Kirim link atur ulang' }).click();
  await expect(page.getByRole('heading', { name: 'Cek email Anda' })).toBeVisible();

  const link = await resetLinkFor(email);
  await page.goto(link.pathname + link.search);
  await expect(page.getByRole('heading', { name: 'Buat password baru' })).toBeVisible();
  await page.getByLabel('Password baru', { exact: true }).fill('resetbaru123');
  await page.getByLabel('Ulangi password baru').fill('beda12345');
  await page.getByRole('button', { name: 'Simpan password baru' }).click();
  await expect(page.getByText('Konfirmasi password tidak sama')).toBeVisible();
  await page.getByLabel('Ulangi password baru').fill('resetbaru123');
  await page.getByRole('button', { name: 'Simpan password baru' }).click();
  await expect(page.getByText('Password berhasil diubah')).toBeVisible();

  // Password lama ditolak, password baru langsung masuk dashboard (tanpa wajib ganti password).
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(tempPassword);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('resetbaru123');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Link yang sama tidak bisa dipakai lagi.
  await page.goto(link.pathname + link.search);
  await expect(page.getByRole('heading', { name: 'Link tidak berlaku' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Minta link baru' })).toBeVisible();
});
/** Link "buat password" dari email pembelian (preview) untuk alamat tersebut. */
async function setupLinkFor(email: string) {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const files = (await readdir(E2E_MAIL_DIR).catch(() => [] as string[])).filter((f) => f.includes(email)).sort();
      if (!files.length) return undefined;
      const html = await readFile(path.join(E2E_MAIL_DIR, files[files.length - 1]), 'utf8');
      link = /href="(https?:\/\/[^"]+\/reset-password\?token=[^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
      return link;
    })
    .toBeTruthy();
  return new URL(link!);
}

test('beli dari landing: bayar (simulasi Midtrans), akun dibuat otomatis, buat password lalu masuk', async ({ page }) => {
  const email = `e2e-beli-${Date.now()}${Math.floor(Math.random() * 1000)}@mailuji.id`;
  await page.goto('/#harga');
  await page.locator('#harga').getByRole('link', { name: 'Beli Standar' }).click();
  await expect(page.getByRole('heading', { name: 'Beli WorksTracker paket Standar' })).toBeVisible();
  await page.getByRole('button', { name: 'Bayar Rp 49.999' }).click();
  await expect(page.getByText('Nama wajib diisi')).toBeVisible();
  await page.getByLabel('Nama lengkap').fill('Pembeli Otomatis');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('No. WhatsApp (opsional)').fill('0812 3456 7890');
  await page.getByRole('button', { name: 'Bayar Rp 49.999' }).click();

  await expect(page.getByRole('heading', { name: 'Menunggu pembayaran' })).toBeVisible();
  await page.getByRole('button', { name: 'Bayar (simulasi)' }).click();
  await expect(page.getByRole('heading', { name: 'Pembayaran berhasil' })).toBeVisible();
  await expect(page.getByText(/Akun Anda sudah aktif/)).toBeVisible();

  // Email yang sama tidak bisa membeli akun kedua
  await page.goto('/beli/premium');
  await page.getByLabel('Nama lengkap').fill('Pembeli Otomatis');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Bayar Rp 109.999' }).click();
  await expect(page.getByText(/Email ini sudah terdaftar/)).toBeVisible();

  const link = await setupLinkFor(email);
  await page.goto(link.pathname + link.search);
  await expect(page.getByRole('heading', { name: 'Buat password akun Anda' })).toBeVisible();
  await page.getByLabel('Password baru', { exact: true }).fill('belibaru123');
  await page.getByLabel('Ulangi password baru').fill('belibaru123');
  await page.getByRole('button', { name: 'Simpan & lanjut masuk' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('belibaru123');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Kalender Aktivitas' })).toBeVisible();
});

test('upgrade & isi ulang kredit dibayar langsung dari aplikasi (simulasi Midtrans)', async ({ page }) => {
  await registerAndLogin(page, 'standard');
  await page.goto('/profil-karier');
  await page.getByRole('button', { name: /Upgrade ke Premium, bayar Rp 60\.000/ }).click();
  await expect(page.getByRole('heading', { name: 'Menunggu pembayaran' })).toBeVisible();
  await page.getByRole('button', { name: 'Bayar (simulasi)' }).click();
  await expect(page.getByText('Paket Premium sudah aktif di akun Anda.')).toBeVisible();
  await page.getByRole('link', { name: 'Kembali ke WorksTracker' }).click();
  await page.goto('/profil-karier');
  await expect(page.getByRole('heading', { name: 'Bahan untuk AI Career Assistant' })).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Isi ulang kredit AI' }).click();
  await page.getByRole('dialog', { name: 'Isi ulang kredit AI' }).getByRole('button', { name: /50 kredit/ }).click();
  await page.getByRole('button', { name: 'Bayar (simulasi)' }).click();
  await expect(page.getByText('50 kredit AI sudah masuk ke akun Anda.')).toBeVisible();
  await page.goto('/settings');
  const history = page.getByRole('list', { name: 'Riwayat pembayaran' });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history.getByText('Isi ulang 50 kredit AI')).toBeVisible();
});
