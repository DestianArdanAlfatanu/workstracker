# WorksTracker

Aplikasi web untuk mencatat dan memantau lamaran kerja (MVP sesuai PRD, F-01–F-08).

- `shared/` — skema Zod, enum, dan tipe yang dipakai bersama oleh API & web
- `api/` — Express + TypeScript + Prisma (MySQL 8), REST `/api/v1`
- `web/` — React + Vite + Tailwind v4 + komponen gaya shadcn/ui (Radix), Sonner, TanStack Query
- `e2e/` — Playwright untuk 3 alur utama

## Prasyarat

- Node.js 22 (Laragon: `D:\laragon\bin\nodejs\node-v22.2.0-win-x64`)
- MySQL 8 berjalan di `127.0.0.1:3306`, dengan database `workstracker` dan `workstracker_test` (utf8mb4)

## Setup

```bash
npm install
cp api/.env.example api/.env          # isi JWT_ACCESS_SECRET dengan string acak panjang
# api/.env.test: sama seperti .env tetapi DATABASE_URL ke workstracker_test dan NODE_ENV=test
npm run db:migrate -w api             # buat tabel
npm run db:seed -w api                # dev: admin@workstracker.local / admin12345, demo@workstracker.local / demo12345
npm run dev                           # API :4000 + web :5173 (proxy /api → :4000)
```

Buka http://localhost:5173.

## Skrip

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | API (tsx watch) + web (Vite) bersamaan |
| `npm run typecheck` | Cek tipe ketiga workspace |
| `npm run build` | Bundle API (`api/dist`) dan web (`web/dist`) |
| `npm test` | Vitest + Supertest untuk API (memakai `workstracker_test`, tabel dikosongkan per test) |
| `npm run test:e2e` | Playwright (desktop + 360 px) memakai Chrome terpasang; `PW_CHANNEL=msedge` untuk Edge. Menjalankan server sendiri di port 4100/5180, memakai database dari `api/.env`, membuat admin khusus tes `e2e-admin@workstracker.local` dan menghapus akun pembeli uji `e2e-…` setelah selesai |

## Admin & penjualan akun

Registrasi publik ditutup. Akses dijual sekali untuk seumur hidup, dan akun pembeli dibuat oleh admin di menu **Admin → Pembeli** (`/admin`):

1. Klik **Tambah pembeli**: pilih **paket**, lalu isi nama, email, No. WhatsApp, tanggal & harga beli (terisi otomatis sesuai paket), dan catatan.
2. Sistem membuat **password default** (nama depan + 4 digit acak, mis. `rina4821`). Password hanya tampil sekali, jadi salin pesannya atau klik **Kirim via WhatsApp**.
3. Pembeli login dengan password itu dan **wajib membuat password baru** sebelum bisa memakai aplikasi.
4. Admin bisa edit data, **ubah paket** (upgrade bayar selisih), **tambah kredit AI**, **reset password**, **nonaktifkan/aktifkan** akun (akses langsung dicabut), atau hapus permanen. Admin hanya melihat *jumlah* lamaran pembeli, bukan isinya.

## Paket & harga

Semua paket dibayar sekali (seumur hidup). Aturan fitur & harga ada di satu tempat: `shared/src/plans.ts`.

| Paket | Harga | Isi |
|---|---|---|
| Basic | Rp 24.999 | Dashboard & Lamaran (tabel/board, aksi massal, ekspor) |
| Standar | Rp 49.999 | Basic + Kalender, Tugas, Insight & kartu progres, CV Saya, email pengingat |
| Premium | Rp 109.999 | Standar + AI Career Assistant, Profil Karier, 150 kredit AI |

- Fitur dibatasi di API (`requireFeature` → error `PLAN_REQUIRED` + `requiredPlan`) dan di web (menu bergembok + ajakan upgrade ke WhatsApp). Admin & akun demo membuka semua fitur.
- **Kredit AI**: isi otomatis 1 kredit per gambar poster (atau teks), cover letter 2, persiapan interview 4, Cek CV 4, isi Profil Karier dari CV 1. Dipotong hanya bila berhasil; tidak hangus. Isi ulang 50 kredit Rp 19.999 / 100 kredit Rp 39.999 lewat **Admin → ⋯ → Kredit AI**.
- Dasar harga: 1 kredit dijual Rp 400; modal Gemini 3.1 Pro ±Rp 370/kredit (kurs Rp 18.000/USD + PPN 11%). Ringkasan admin menampilkan modal rata-rata per kredit dan memberi peringatan bila > Rp 380.
- Riwayat upgrade & isi ulang ada di tabel `purchases`; setiap perubahan saldo di `ai_credit_ledger`. Pendapatan admin = lisensi + pembelian tersebut.

**Membuat admin di production** (seed hanya untuk development):

```bash
npm run admin:create -w api -- --email kamu@domain.com --name "Nama Kamu"   # password acak dicetak sekali
npm run admin:create -w api -- --promote email@yang.sudah.ada               # jadikan user yang ada sebagai admin
```

Opsional: set `VITE_ADMIN_WHATSAPP=62812xxxx` saat build web agar halaman login menampilkan tombol "Hubungi admin via WhatsApp".

## Fitur pengguna

- **Landing page** di `/` untuk pengunjung: 3 kartu paket + tabel perbandingan, tombol beli per paket ke WhatsApp `6287796747329` (ubah lewat `VITE_ADMIN_WHATSAPP`).
- **Lamaran:** tampilan Tabel atau **Board Kanban** (geser kartu untuk ubah status, juga bisa dengan keyboard; di HP ada strip status dan tombol "Pindah ke…"), **aksi massal** (ubah status, ekspor, hapus + undo), **ekspor Excel/CSV**.
- **Impor** dari Excel (.xlsx), CSV, atau tempel dari Google Sheets: kolom dicocokkan otomatis (`shared/src/import.ts`), pratinjau baris siap/bermasalah/duplikat, simpan bertahap 200 baris, lalu bisa dibatalkan. Template: `GET /api/v1/applications/import/template`.
- **CV Saya** (`/cv`): simpan hingga 5 CV (PDF/DOC/DOCX, maks. 5 MB), pilih CV per lamaran di form lamaran (default: CV utama). Teks CV dibaca sekali saat diunggah (`unpdf`/`mammoth`) untuk AI; CV hasil scan dikirim ke AI sebagai file PDF. CV yang diganti/dihapus padahal masih dipakai lamaran dipindah ke "Versi lama" (tidak dihitung batas 5) dan otomatis terhapus saat tidak dipakai lagi. File di `api/storage/uploads`.
- **Tugas & to-do** (`/tasks`, juga di detail lamaran), **Kalender aktivitas** (`/calendar`), **Target mingguan** di dashboard.
- **Pengumuman** dari admin (`/admin/announcements`) tampil di dashboard & notifikasi pembeli.

## Demo instan

Tombol **"Coba demo gratis"** di landing & halaman login membuat akun sementara (`is_demo`, paket Premium dengan 50 kredit) berisi data contoh (`api/src/services/demo/sample-data.ts`) dan langsung masuk — tanpa daftar.
- Berlaku 24 jam, lalu dihapus otomatis oleh job di API (cek tiap jam). Maks. 5 demo/jam per IP dan 300 demo aktif (`DEMO_RATE_LIMIT_MAX`, `DEMO_MAX_ACTIVE`).
- Upload CV, email pengingat, dan ganti password dinonaktifkan; fitur AI menampilkan **contoh hasil** tanpa memanggil API.
- Akun demo tidak muncul di daftar pembeli; ringkasan admin menampilkan jumlah demo yang dibuka bulan ini.

## Insight & kartu progres

Menu **Insight** (`/insight`): funnel lamaran, response rate per kanal, median waktu sampai direspons/interview, lamaran tanpa kabar > 14 hari, dan insight otomatis berbasis aturan (tanpa AI). Tombol **Bagikan progres** membuat gambar PNG (Instagram 4:5 atau LinkedIn) dari data pengguna.

## AI Career Assistant (paket Premium)

Cover letter yang dipersonalisasi (streaming), persiapan interview, **Cek CV (ATS)**, dan **isi otomatis** form lamaran dari **poster loker** (gambar, mis. post Instagram, maks. 4 slide) atau teks lowongan — memakai **Google Gemini 3.1 Pro** (`@google/genai`).

1. Buat API key di **aistudio.google.com/apikey**, aktifkan **billing (paid tier)** — di tier gratis data boleh dipakai Google untuk melatih model — lalu isi `GEMINI_API_KEY` di `api/.env` (opsional `AI_MODEL`, default `gemini-3.1-pro-preview`) dan restart API. Tes di **Admin → Integrasi → Tes koneksi AI**.
2. Pembeli Premium mengisi **Profil Karier** (`/profil-karier`, bisa diisi otomatis dari CV, 1 kredit), lalu memakai **AI Assistant** dari detail lamaran atau **Isi otomatis** di form Tambah lamaran.

- **Poster**: gambar diperkecil di browser (sisi terpanjang 2048 px), diperiksa isinya (JPG/PNG/WEBP/HEIC), dikirim ke Gemini dengan resolusi tinggi, dan **tidak disimpan** di server. Hasil: field form + transkrip "Teks dari poster"; batas melamar dijadikan agenda tindak lanjut, cara melamar & nomor WA masuk ke catatan.
- **Data yang dikirim ke AI:** profil karier, data lamaran (perusahaan, posisi, lokasi, status, catatan, deskripsi lowongan), dan isi CV dari CV Saya yang dipilih (default CV lamaran). **Tidak dikirim:** email/no. HP pengguna, kontak & email HR, gaji, lamaran lain. Pengguna menyetujui ini sebelum pemakaian pertama.
- **Biaya:** dicatat per generasi (`ai_generations.cost_micro_usd`, token thinking dihitung sebagai output). Jika Google mematikan model preview, ganti `AI_MODEL` (harga cadangan untuk `gemini-4-argon` & `gemini-3.8-flash` sudah ada di `api/src/lib/ai.ts`) dan sesuaikan bobot kredit bila perlu.
- **Development tanpa biaya:** `AI_FAKE=1` memakai provider palsu (hasil contoh). Tes Vitest & Playwright selalu memakai provider palsu.
- Prompt ada di `api/src/services/ai/prompts.ts` (ber-versi `PROMPT_VERSION`); rating 👍/👎 dan versi yang diedit pengguna disimpan sebagai bahan evaluasi kualitas.
## Chrome Extension

Folder `extension/` (Manifest V3) berisi pop-up untuk menyimpan lowongan dari LinkedIn, Instagram, dan situs karier dengan satu klik (paket Standar ke atas). Login memakai sesi website lewat `POST /api/v1/auth/extension-session`, yang tidak merotasi cookie. Cara memasang versi uji, rilis ke Chrome Web Store, dan pengujiannya ada di [`extension/README.md`](extension/README.md).
## Pengingat email

Setiap 15 menit API mengecek; mulai jam `REMINDER_HOUR` (default 07.00 WIB) tiap pengguna paket Standar/Premium yang mengaktifkan pengingat menerima **satu email per hari** berisi jadwal & tugas yang jatuh tempo hari ini atau terlewat.

Isi variabel di `api/.env` lalu restart API:

```
SMTP_HOST=smtp.gmail.com      # atau smtp-relay.brevo.com, dll
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=akun@gmail.com
SMTP_PASS=app-password        # Gmail: buat "App Password", bukan password biasa
MAIL_FROM="WorksTracker <akun@gmail.com>"
APP_URL="https://domain-kamu.com"
```

Selama `SMTP_HOST` kosong (atau `MAIL_PREVIEW=1`), email **tidak dikirim** dan disimpan sebagai file HTML di `api/storage/mail-preview/` (atau `MAIL_PREVIEW_DIR`) untuk dicek. Pengguna bisa menekan "Kirim email uji sekarang" di halaman Profil. Tes E2E selalu memakai mode preview.

## Lupa password

Di halaman masuk ada tautan **Lupa password?** → `/lupa-password`. Pengguna memasukkan email, lalu menerima link `APP_URL/reset-password?token=…`. Karena link memakai `APP_URL`, isi variabel itu dengan domain asli saat produksi.

- Respons selalu sama, jadi orang lain tidak bisa mengecek apakah sebuah email terdaftar. Akun demo, akun nonaktif, dan alamat contoh (`.local`, `example.com`, `contoh.id`, …) tidak dikirimi link.
- Link berlaku 30 menit dan hanya bisa dipakai sekali. Hanya link terbaru yang berlaku. Database hanya menyimpan hash token.
- Maksimal 3 permintaan per jam per akun, dan 10 permintaan per 15 menit per IP (`RESET_RATE_LIMIT_MAX`).
- Setelah password diganti, semua sesi login dikeluarkan dan kewajiban mengganti password default ikut terhapus. Pengguna juga menerima email "Password Anda telah diubah".

## Catatan implementasi

- **Auth:** access token JWT 15 menit disimpan di memori; refresh token 7 hari di cookie `rt` (httpOnly, SameSite=Lax, Secure di production), disimpan sebagai hash SHA-256 dan dirotasi setiap refresh. Login dibatasi 5x/menit/IP.
- **Status:** setiap perubahan status menulis `status_history` dalam transaksi yang sama; urutan status tidak dikunci.
- **Response rate:** lamaran non-wishlist yang status saat ini atau riwayatnya pernah mencapai Screening/Interview/Offer/Accepted ÷ total non-wishlist (dalam persen).
- **Soft delete:** `deleted_at`; dibersihkan permanen setelah 30 hari oleh job di proses API (saat start + tiap 24 jam).
- **Batas:** 2.000 lamaran aktif per pengguna (403).
- **Production:** jalankan di belakang reverse proxy HTTPS (`trust proxy` aktif saat `NODE_ENV=production`), set `CORS_ORIGINS`, lalu `npm run db:deploy -w api && npm run start -w api` dan sajikan `web/dist` dengan fallback SPA serta proxy `/api` ke API.

## Upgrade: dari lampiran ke CV Saya

Rilis ini mengganti lampiran per lamaran dengan **CV Saya**. Urutan deploy:

```bash
npm run db:deploy -w api               # migrasi database
npm run migrate:cv -w api              # pindahkan lampiran lama ke CV Saya (aman dijalankan ulang)
```

Skrip menggabungkan file identik (hash SHA-256) menjadi satu CV, menautkan lamaran ke CV-nya, dan menghapus salinan duplikat. Tabel lama diganti nama menjadi `legacy_attachments` (tidak dihapus); hapus di rilis berikutnya setelah data dipastikan pindah.

## Aplikasi di HP (PWA)

`vite-plugin-pwa` (injectManifest, service worker di `web/src/sw.ts`). Bisa dipasang di layar utama, app shell tersimpan sehingga tetap terbuka saat offline, dan data terakhir (lamaran, dashboard, tugas) dibaca dari cache perangkat (baca saja; dihapus saat keluar).

- **Share Target** (Android, paket Standar ke atas): menu Bagikan di LinkedIn/Instagram/Jobstreet/browser → WorksTracker → `/bagikan` membuka form Tambah lamaran terisi. Link dinormalisasi & dicek duplikat; judul halaman portal yang dikenal dibaca server (`POST /share/resolve`, hanya domain portal loker, tanpa redirect ke luar). Gambar/poster yang dibagikan bisa dibaca AI (Premium).
- **Push notification** (Standar ke atas): pengingat harian jadwal & tugas, pelengkap email. Buat kunci sekali: `npm run push:keys -w api` (ditulis ke `api/.env`, kunci privat tidak ditampilkan), lalu restart API. Pengguna mengaktifkan per perangkat di **Pengaturan → Aplikasi di HP**. Jangan ganti kunci VAPID setelah dipakai.
- Share Target dan push hanya berjalan di **HTTPS** (atau localhost). Untuk mencoba di HP sungguhan, buka situs lewat domain HTTPS.

## Pembayaran otomatis (Midtrans)

Pembeli bisa membeli dari landing (`/beli/:plan`), lalu membayar lewat Snap Midtrans (QRIS, VA, e-wallet). Setelah lunas, akun dibuat otomatis dan email berisi link membuat password (berlaku 72 jam) serta bukti pembayaran dikirim. Upgrade paket dan isi ulang kredit juga bisa dibayar dari dalam aplikasi. Admin melihat semua pesanan di **Admin → Pesanan**.

1. Isi di `api/.env`: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION=false` (sandbox) lalu restart API. Tanpa kunci, tombol beli tetap ke WhatsApp.
2. Di dashboard Midtrans, set **Payment Notification URL** ke `https://<domain>/api/v1/payments/midtrans/notification`.
3. Harga selalu dihitung server dari `shared/src/plans.ts`. Notifikasi dicek tanda tangannya (SHA-512) dan statusnya dikonfirmasi ulang ke Midtrans; setiap pesanan dipenuhi tepat sekali.
4. Job tiap 10 menit mengecek pesanan yang masih menunggu (menutup webhook yang terlewat, juga membuat sandbox bisa diuji di localhost tanpa URL publik) dan menandai pesanan kedaluwarsa setelah 24 jam.

Development tanpa Midtrans: `PAYMENT_FAKE=1` (tombol "Bayar (simulasi)" di halaman status). Tes Vitest & Playwright memakai mode ini.

## Rilis: impor, PWA, pembayaran

```bash
npm run db:deploy -w api     # tabel push_subscriptions, payment_orders, kolom terkait
npm run push:keys -w api     # sekali, bila belum ada kunci VAPID
```

## Uji di HP lewat tunnel

Share Target, push, dan pemasangan PWA butuh HTTPS. Untuk mencoba di HP dari localhost:

```bash
npm run dev -w api      # API :4000 harus menyala
npm run tunnel          # build web, preview :4173, lalu Cloudflare Quick Tunnel
```

Buka URL `https://xxxx.trycloudflare.com` yang muncul di log, di Chrome Android. Alamat ini bisa dibuka siapa pun yang tahu URL-nya selama tunnel menyala (data database dev), jadi tekan Ctrl+C setelah selesai. URL berganti setiap tunnel dinyalakan ulang. Butuh `cloudflared.exe` di `D:\laragon\bin\cloudflared\` (atau env `CLOUDFLARED`).

Daftar tugas saat hosting (domain, Midtrans, push, dll.) ada di [`DEPLOY.md`](DEPLOY.md).