# WorksTracker — Chrome Extension

Simpan lowongan dari portal loker (LinkedIn, Jobstreet, Glints, Dealls, Kalibrr, KitaLulus, Loker.id, Indeed, Karirhub), **Instagram**, atau situs karier perusahaan ke WorksTracker dengan satu klik. Tersedia mulai **paket Standar**.

## Cara kerja

1. User membuka halaman lowongan, lalu klik ikon WorksTracker di toolbar Chrome.
2. Pop-up membaca halaman yang **sedang dibuka saja** (izin `activeTab`, tanpa membaca situs lain di latar belakang) dan mengisi form.
3. User memilih **Wishlist** atau **Applied**, l| Portal | Sumber data yang dibaca | Diuji dengan |
|---|---|---|
| Dealls, Glints, KitaLulus, Loker.id | JSON-LD `JobPosting` (perusahaan, posisi, lokasi, gaji, batas melamar) | halaman asli |
| Kalibrr | `__NEXT_DATA__` → `pageProps.job` (termasuk WFH/hybrid & batas melamar) | halaman asli |
| Jobstreet | atribut `data-automation` (halaman detail & panel pencarian `?jobId=`) | halaman asli |
| Karirhub Kemnaker | judul, baris lokasi, label "Rentang gaji" / "Batas waktu lamaran", tautan profil perusahaan | halaman asli |
| LinkedIn | tampilan halaman (top card) + JSON-LD versi publik + judul tab | contoh HTML + uji extension |
| Indeed | atribut `data-testid` + `#jobDescriptionText` | contoh HTML buatan (Indeed memblokir browser otomatis), perlu dicek di Chrome biasa |
| Situs karier lain | JSON-LD bila ada → `h1`/meta `og:*` | contoh HTML |
| Instagram | Akun pengunggah, caption, link. **Premium:** "Isi dari poster di layar (AI)" membaca tangkapan layar post (1 kredit) | uji extension + AI |

- Semua pembaca ada di `src/lib/scrape.ts`. Selector tiap portal dikumpulkan dalam konstanta (`LINKEDIN`, `JOBSTREET`, `INDEED`, …) agar mudah diperbarui.
- Gaji dibaca sebagai gaji bulanan rupiah ("Rp 5 – 7 jt", "IDR 5.000.000 - 7.000.000/bulan"); "Dirahasiakan" / gaji per tahun diabaikan. Batas melamar yang belum lewat otomatis dijadikan agenda "Batas akhir melamar".
- Sumber lamaran terisi sesuai portal (Dealls, KitaLulus, Loker.id, Indeed, Karirhub punya sumber sendiri), sehingga Insight bisa membandingkan response rate per portal.
- Link lowongan dinormalisasi (`normalizeJobUrl` di `@wt/shared`), jadi lowongan yang sama terdeteksi duplikat walau dibuka dari panel pencarian atau link berparameter pelacak.

### Saat portal mengubah tampilan

1. `npx tsx scripts/live-check.ts` menampilkan tabel hasil baca di lowongan asli yang sedang tayang di tiap portal. Kolom yang kosong menandakan portal yang perlu diperbaiki.
2. `node scripts/capture-fixtures.mjs` mengambil ulang contoh halaman ke `test/fixtures/`.
3. Perbarui selector di `src/lib/scrape.ts`, sesuaikan `test/scrape.test.ts`, lalu jalankan `npm test -w extension`.

emberi peringatan bila lowongan yang sama sudah tersimpan.

## Login cukup sekali

Extension tidak punya halaman login sendiri.

- Setiap kali pop-up dibuka, extension memanggil `POST /api/v1/auth/extension-session`. Cookie login website ikut terkirim, karena extension punya izin untuk domain WorksTracker.
- Server memeriksa sesi **tanpa mengganti cookie website**, lalu memberi token akses 15 menit.
- Logout, ganti password, atau akun dinonaktifkan di website langsung berlaku juga di extension.
- Paket Basic menampilkan ajakan upgrade. Akun demo tidak didukung.

## Memasang versi uji (komputer ini)

1. Jalankan WorksTracker (`http://localhost:5173`), lalu login di Chrome.
2. Jalankan `npm run build -w extension`. Hasilnya ada di `extension/dist`.
3. Buka `chrome://extensions`, aktifkan **Developer mode**, klik **Load unpacked**, lalu pilih folder `extension/dist`.
4. Sematkan (pin) ikon WorksTracker. Buka lowongan di LinkedIn atau Instagram, lalu klik ikonnya.

Setelah mengubah kode, jalankan build lagi lalu klik ⟳ (reload) pada kartu extension di `chrome://extensions`.

## Rilis ke Chrome Web Store (setelah website online)

1. Build dengan alamat asli: `VITE_WT_URL=https://domain-anda.com npm run zip -w extension`. Hasilnya `extension/workstracker-extension-<versi>.zip`.
2. Daftar di Chrome Web Store Developer Dashboard (biaya sekali $5), lalu unggah ZIP. Lengkapi deskripsi, screenshot, dan **kebijakan privasi**: data yang dikirim hanya isi halaman lowongan yang dibuka user, ke server WorksTracker.
3. Naikkan `version` di `extension/package.json` setiap rilis.

## Tes

- `npm test -w extension`: parser halaman (LinkedIn, Instagram, Jobstreet, situs karier) dengan HTML contoh.
- `api/test/extension.test.ts`: sesi extension (tanpa rotasi cookie, logout, paket, demo) dan cek duplikat.
- `node scripts/e2e-check.mjs [folder-screenshot] [poster.jpg]` (dari folder `extension`): uji menyeluruh di Chromium Playwright terhadap localhost yang sedang jalan.
  - Yang diuji: belum login, paket Basic, LinkedIn → Applied, duplikat, website tetap login, Instagram + AI (bila poster diberikan), dan logout.
  - Butuh `npx playwright install chromium`, karena Chrome bermerek memblokir `--load-extension`.
