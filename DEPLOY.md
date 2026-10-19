# Daftar Periksa Hosting

Tugas yang dikerjakan saat WorksTracker dipasang di server dengan domain sendiri. Centang satu per satu.

## 1. Domain & HTTPS

- [ ] Domain mengarah ke server, HTTPS aktif (wajib untuk PWA, Share Target, dan push).
- [ ] `api/.env`: `NODE_ENV=production`, `APP_URL=https://<domain>`, `CORS_ORIGINS=https://<domain>`, `JWT_ACCESS_SECRET` acak panjang.
- [ ] Reverse proxy menyajikan `web/dist` (fallback SPA ke `index.html`) dan meneruskan `/api` ke API.
- [ ] `sw.js` dan `manifest.webmanifest` disajikan tanpa cache panjang (`Cache-Control: no-cache`) agar versi baru cepat terpasang.

## 2. Database

```bash
npm run db:deploy -w api     # semua migrasi
npm run migrate:cv -w api    # pindahkan lampiran lama ke CV Saya (aman diulang)
npm run admin:create -w api -- --email kamu@domain.com --name "Nama Kamu"
```

- [ ] Setelah data CV dipastikan pindah, hapus tabel lama: `DROP TABLE legacy_attachments;` (lewat migrasi baru).

## 3. Email & push

- [ ] `SMTP_*` dan `MAIL_FROM` terisi (Gmail App Password atau layanan SMTP). Uji di Admin → Integrasi.
- [ ] `npm run push:keys -w api` sekali di server, lalu restart API. Jangan ganti kunci VAPID setelah pengguna berlangganan.

## 4. Midtrans (pembayaran otomatis)

- [ ] Isi `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY` (sandbox dulu), `MIDTRANS_IS_PRODUCTION=false`, restart API.
- [ ] Dashboard Midtrans → Settings → Payment → **Notification URL**: `https://<domain>/api/v1/payments/midtrans/notification`.
- [ ] **Finish / Unfinish / Error Redirect URL**: `https://<domain>/` (WorksTracker sudah mengarahkan ke halaman status pesanan).
- [ ] Uji sandbox: beli akun baru, upgrade, dan isi ulang kredit memakai simulator pembayaran Midtrans. Pastikan email link buat password masuk.
- [ ] Ganti ke kunci production dan `MIDTRANS_IS_PRODUCTION=true`, lalu uji satu transaksi sungguhan kecil.
- [ ] Pastikan `PAYMENT_FAKE` **tidak** diset di production.
- [ ] Setelah aktif, tombol beli di landing otomatis berubah dari WhatsApp ke halaman beli. Cek tampilannya.

## 5. AI

- [ ] `GEMINI_API_KEY` dengan billing aktif (paid tier), `AI_MODEL` sesuai paket yang dijual. Uji di Admin → Integrasi.
- [ ] Pastikan `AI_FAKE` tidak diset.

## 6. Chrome Extension

- [ ] Halaman `https://<domain>/privasi` bisa dibuka (wajib untuk Chrome Web Store).
- [ ] Buat ZIP rilis: `$env:VITE_WT_URL='https://<domain>'; npm run zip -w extension`. Cek `host_permissions` di manifest berisi domain asli.
- [ ] Unggah ke Chrome Web Store memakai teks dan gambar di `extension/store/` (langkah lengkap di `extension/README.md`).

## 7. Setelah rilis

- [ ] Cek dari HP Android: pasang aplikasi, Bagikan loker dari LinkedIn/Instagram, aktifkan notifikasi.
- [ ] Pantau log API (job pengingat, rekonsiliasi pembayaran) pada hari pertama.
