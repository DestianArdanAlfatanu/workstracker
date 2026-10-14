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

1. Klik **Tambah pembeli**: isi nama, email, No. WhatsApp, tanggal & harga beli, catatan.
2. Sistem membuat **password default** (nama depan + 4 digit acak, mis. `rina4821`). Password hanya tampil sekali, jadi salin pesannya atau klik **Kirim via WhatsApp**.
3. Pembeli login dengan password itu dan **wajib membuat password baru** sebelum bisa memakai aplikasi.
4. Admin bisa edit data, **reset password**, **nonaktifkan/aktifkan** akun (akses langsung dicabut), atau hapus permanen. Admin hanya melihat *jumlah* lamaran pembeli, bukan isinya.

**Membuat admin di production** (seed hanya untuk development):

```bash
npm run admin:create -w api -- --email kamu@domain.com --name "Nama Kamu"   # password acak dicetak sekali
npm run admin:create -w api -- --promote email@yang.sudah.ada               # jadikan user yang ada sebagai admin
```

Opsional: set `VITE_ADMIN_WHATSAPP=62812xxxx` saat build web agar halaman login menampilkan tombol "Hubungi admin via WhatsApp".

## Fitur pengguna

- **Landing page** di `/` untuk pengunjung (harga promo Rp 24.999, tombol beli ke WhatsApp `6287796747329`; ubah lewat `VITE_ADMIN_WHATSAPP` dan `web/src/lib/config.ts`).
- **Lamaran:** tampilan Tabel atau **Board Kanban** (geser kartu untuk ubah status, juga bisa dengan keyboard), **aksi massal** (ubah status, ekspor, hapus + undo), **ekspor Excel/CSV**.
- **Lampiran** per lamaran (PDF/DOC/DOCX/PNG/JPG, maks. 5 MB, 10 file); disimpan di `api/storage/uploads`.
- **Tugas & to-do** (`/tasks`, juga di detail lamaran), **Kalender aktivitas** (`/calendar`), **Target mingguan** di dashboard.
- **Pengumuman** dari admin (`/admin/announcements`) tampil di dashboard & notifikasi pembeli.

## Demo instan

Tombol **"Coba demo gratis"** di landing & halaman login membuat akun sementara (`is_demo`) berisi data contoh (`api/src/services/demo/sample-data.ts`) dan langsung masuk — tanpa daftar.
- Berlaku 24 jam, lalu dihapus otomatis oleh job di API (cek tiap jam). Maks. 5 demo/jam per IP dan 300 demo aktif (`DEMO_RATE_LIMIT_MAX`, `DEMO_MAX_ACTIVE`).
- Upload lampiran, email pengingat, dan ganti password dinonaktifkan; fitur AI menampilkan **contoh hasil** tanpa memanggil API.
- Akun demo tidak muncul di daftar pembeli; ringkasan admin menampilkan jumlah demo yang dibuka bulan ini.

## Insight & kartu progres

Menu **Insight** (`/insight`): funnel lamaran, response rate per kanal, median waktu sampai direspons/interview, lamaran tanpa kabar > 14 hari, dan insight otomatis berbasis aturan (tanpa AI). Tombol **Bagikan progres** membuat gambar PNG (Instagram 4:5 atau LinkedIn) dari data pengguna.

## AI Career Assistant (add-on)

Cover letter yang dipersonalisasi (streaming), persiapan interview, **Cek CV (ATS)** — skor kecocokan CV vs lowongan, kata kunci yang hilang, saran perbaikan — dan **isi otomatis** form lamaran dari teks lowongan, memakai **Claude Opus 5.5** lewat Anthropic SDK. Semua menghitung kuota add-on.

1. Isi `ANTHROPIC_API_KEY` di `api/.env` (opsional `AI_MODEL`, default `claude-opus-5-5`), lalu restart API. Set juga *spend limit* di Anthropic Console sebagai pengaman biaya.
2. Admin mengaktifkan add-on per pembeli: **Admin → Pembeli → ⋯ → Atur add-on AI** (aktif + batas generate per bulan, default 30). Biaya AI bulan ini tampil di ringkasan admin.
3. Pembeli mengisi **Profil Karier** (`/profil-karier`) dan menempel **Deskripsi lowongan** di form lamaran, lalu membuka **AI Assistant** dari detail lamaran.

- **Data yang dikirim ke AI:** profil karier, data lamaran (perusahaan, posisi, lokasi, status, catatan, deskripsi lowongan), dan CV PDF hanya bila dipilih. **Tidak dikirim:** email/no. HP pengguna, kontak & email HR, gaji, lamaran lain. Pengguna menyetujui ini sebelum pemakaian pertama.
- **Biaya:** dicatat per generasi (`ai_generations.cost_micro_usd`); estimasi ±$0,06 per cover letter, ±$0,10 per persiapan interview. Refusal/gagal tidak memotong kuota.
- **Development tanpa biaya:** `AI_FAKE=1` memakai provider palsu (hasil contoh). Tes Vitest & Playwright selalu memakai provider palsu.
- Prompt ada di `api/src/services/ai/prompts.ts` (ber-versi `PROMPT_VERSION`); rating 👍/👎 dan versi yang diedit pengguna disimpan sebagai bahan evaluasi kualitas.

## Pengingat email

Setiap 15 menit API mengecek; mulai jam `REMINDER_HOUR` (default 07.00 WIB) tiap pengguna yang mengaktifkan pengingat menerima **satu email per hari** berisi jadwal & tugas yang jatuh tempo hari ini atau terlewat.

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
