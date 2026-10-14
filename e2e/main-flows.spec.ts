import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { E2E_MAIL_DIR } from './paths';

const ADMIN = { email: 'e2e-admin@workstracker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-12345' };

/**
 * Admin membuat akun pembeli lewat API (butuh seed dev); kembalikan email + password default.
 * Memakai request context terpisah agar cookie sesi admin tidak ikut ke browser.
 */
async function createBuyer(baseURL: string, domain = 'example.com') {
  const request = await playwrightRequest.newContext({ baseURL });
  const login = await request.post('/api/v1/auth/login', { data: ADMIN });
  expect(login.ok(), 'Login admin E2E gagal').toBeTruthy();
  const { accessToken } = (await login.json()).data;
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await request.post('/api/v1/admin/users', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: 'Pengguna E2E', email: `e2e-${id}@${domain}`, purchasedAt: new Date().toISOString().slice(0, 10) },
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
async function registerAndLogin(page: Page) {
  const { email, tempPassword } = await createBuyer(test.info().project.use.baseURL!);
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

test('AI Career Assistant: terkunci tanpa add-on, lalu cover letter & persiapan interview', async ({ page }) => {
  const email = await registerAndLogin(page);
  await addApplication(page, 'Gamma Tech');
  await page.goto('/applications');
  await page.getByRole('button', { name: /^Gamma Tech/ }).locator('visible=true').first().click();
  await page.getByRole('button', { name: /AI Assistant/ }).click();
  const dialog = page.getByRole('dialog', { name: 'AI Career Assistant' });
  await expect(dialog.getByText('Aktifkan AI Career Assistant')).toBeVisible();
  await page.keyboard.press('Escape');

  // Admin mengaktifkan add-on lewat API
  const request = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL! });
  const login = await request.post('/api/v1/auth/login', { data: ADMIN });
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
  const list = await request.get(`/api/v1/admin/users?q=${encodeURIComponent(email)}`, { headers });
  const buyerId = (await list.json()).data[0].id;
  await request.patch(`/api/v1/admin/users/${buyerId}/ai`, { headers, data: { aiEnabled: true, aiMonthlyLimit: 5 } });
  await request.dispose();

  await page.reload();
  await page.getByRole('button', { name: /^Gamma Tech/ }).locator('visible=true').first().click();
  await page.getByRole('button', { name: /AI Assistant/ }).click();
  await dialog.getByRole('button', { name: 'Saya mengerti, lanjutkan' }).click();
  await expect(dialog.getByText('Kuota bulan ini: 0/5')).toBeVisible();

  await dialog.getByRole('button', { name: 'Buat cover letter' }).click();
  await expect(page.getByText('Cover letter selesai dibuat')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Cover letter' })).toHaveValue(/Dengan hormat/);
  await expect(dialog.getByText('Kuota bulan ini: 1/5')).toBeVisible();

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
  const email = await registerAndLogin(page);
  const request = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL! });
  const login = await request.post('/api/v1/auth/login', { data: ADMIN });
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
  const buyerId = (await (await request.get(`/api/v1/admin/users?q=${encodeURIComponent(email)}`, { headers })).json()).data[0].id;
  await request.patch(`/api/v1/admin/users/${buyerId}/ai`, { headers, data: { aiEnabled: true } });
  await request.dispose();
  await page.reload();

  await page.locator('button:visible', { hasText: /^Tambah( lamaran)?$/ }).first().click();
  const form = page.getByRole('dialog', { name: 'Tambah lamaran' });
  await form.getByRole('button', { name: /Isi otomatis dari teks lowongan/ }).click();
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