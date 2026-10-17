# Fitur yang Ditambahkan Setelah MVP

Dokumen ini mencatat semua yang dibangun di WorksTracker setelah MVP selesai. MVP mengikuti PRD (13 Okt 2026, modul F-01 sampai F-08): auth, CRUD lamaran, ubah status + riwayat, daftar dengan pencarian/filter, dashboard, jadwal tindak lanjut, hapus + undo, dan profil.

Per 16 Oktober 2026.

## Ringkasan

| Kelompok | Fitur | Paket |
| --- | --- | --- |
| Penjualan | Admin menjual akses seumur hidup, 3 paket, upgrade bayar selisih | - |
| Lamaran | Board Kanban, aksi massal, impor & ekspor Excel/CSV | Basic |
| Aplikasi HP (PWA) | Pasang di layar utama, buka offline (baca saja) | Basic |
| Bagikan dari HP | Simpan loker dari menu Bagikan Android, push notification | Standar |
| Pembayaran | Beli, upgrade, dan isi ulang kredit otomatis lewat Midtrans | - |
| Produktivitas | Tugas & to-do, kalender aktivitas, target mingguan | Standar |
| Insight | Funnel, response rate per kanal, kartu progres untuk dibagikan | Standar |
| CV Saya | Simpan hingga 5 CV, pilih CV per lamaran | Standar |
| Notifikasi | Email pengingat harian, pengumuman dari admin | Standar |
| Chrome Extension | Simpan lowongan dari LinkedIn, Jobstreet, Instagram, dll. dengan satu klik | Standar |
| AI Career Assistant | Cover letter, persiapan interview, Cek CV, isi otomatis dari poster/teks loker, isi Profil Karier dari CV | Premium |
| Akun | Lupa password lewat email | Semua |
| Pemasaran | Landing page, demo instan tanpa daftar | Pengunjung |

## 1. Admin & penjualan akses

Registrasi publik dari PRD ditutup. Akses dijual sekali bayar untuk seumur hidup, dan akun pembeli dibuat oleh admin.

- **Kelola Pembeli** (`/admin`):
  - Admin menambah pembeli lewat form: paket, nama, email, No. WhatsApp, tanggal & harga beli, dan catatan.
  - Sistem membuat password default (nama depan + 4 digit acak) yang hanya tampil sekali, dengan tombol **Kirim via WhatsApp**.
- **Wajib ganti password** saat pembeli login pertama kali.
- **Aksi admin per pembeli:**
  - Edit data, ubah paket (upgrade bayar selisih), atau tambah kredit AI.
  - Reset password, nonaktifkan/aktifkan akun (akses langsung dicabut), atau hapus permanen.
  - Admin hanya melihat jumlah lamaran pembeli, bukan isinya.
- **Ringkasan admin:**
  - Jumlah pembeli, pendapatan (lisensi + upgrade + isi ulang kredit), dan jumlah demo bulan ini.
  - Modal rata-rata AI per kredit, dengan peringatan bila di atas Rp 380.
- **Integrasi** (`/admin/integrations`): tes koneksi AI dan email.
- **Pengumuman** (`/admin/announcements`): admin menulis dan menerbitkan pengumuman. Pengumuman tampil di dashboard dan notifikasi pembeli, dengan status sudah dibaca.
- Skrip `npm run admin:create -w api` untuk membuat atau mempromosikan admin di production.

## 2. Paket & harga

| Paket | Harga | Isi |
| --- | --- | --- |
| Basic | Rp 24.999 | Dashboard & Lamaran (tabel/board, aksi massal, ekspor) |
| Standar (paling populer) | Rp 49.999 | Basic + Kalender, Tugas, Insight & kartu progres, CV Saya, email pengingat, Chrome Extension |
| Premium | Rp 109.999 | Standar + AI Career Assistant, Profil Karier, 150 kredit AI |

- **Pembatasan fitur ada di dua lapis:**
  - API: `requireFeature` mengembalikan error `PLAN_REQUIRED` beserta paket yang dibutuhkan.
  - Web: menu bergembok dan halaman ajakan upgrade via WhatsApp (bayar selisih).
- **Kredit AI:**
  - Biaya per aksi: isi otomatis 1 per gambar/teks, cover letter 2, persiapan interview 4, Cek CV 4, isi Profil Karier dari CV 1.
  - Kredit hanya dipotong bila berhasil dan tidak hangus.
  - Isi ulang: 50 kredit Rp 19.999 atau 100 kredit Rp 39.999.
- Aturan paket & harga ada di satu tempat: `shared/src/plans.ts`.

## 3. Lamaran

- **Board Kanban:** kolom per status. Kartu bisa digeser dengan mouse, sentuhan, atau keyboard.
- **Aksi massal:** pilih banyak lamaran lalu ubah status, ekspor, atau hapus (dengan undo).
- **Ekspor Excel (XLSX) & CSV:** mengikuti filter yang aktif. Ekspor CSV memakai BOM agar terbaca benar di Excel dan diberi pengaman formula.
- **Impor dari Excel/CSV/Google Sheets:**
  - Unggah file atau tempel tabel dari Google Sheets; template bisa diunduh.
  - Kolom dicocokkan otomatis dari nama kolom Indonesia/Inggris, bisa diubah manual.
  - Mengenali status ("Ditolak", "Wawancara", "Lolos berkas"), tanggal (13/10/2026, "13 Okt 2026", serial Excel), dan gaji ("8,5 jt", "8-10 jt").
  - Pratinjau baris siap, bermasalah, dan duplikat sebelum disimpan, lalu bisa dibatalkan sekali klik.
  - Kanban di HP: strip status yang bisa jadi target seret, tombol "Pindah ke…", kolom selebar layar.
- **Sumber lowongan baru:** Dealls, KitaLulus, Loker.id, Indeed, Karirhub Kemnaker, dan Instagram (selain LinkedIn, Jobstreet, Glints, Kalibrr dari PRD).
- **Field baru:** deskripsi lowongan (dipakai AI) dan CV yang dipakai.

## 4. Tugas, kalender, dan target

- **Tugas & to-do** (`/tasks`, juga di detail lamaran): tambah, tenggat, tandai selesai/buka kembali, dan bisa dikaitkan ke lamaran.
- **Kalender aktivitas** (`/calendar`): menggabungkan tanggal lamar, tindak lanjut, dan tugas.
- **Target mingguan** di dashboard, dengan riwayat 8 minggu.

## 5. Insight & kartu progres

- **Halaman Insight** (`/insight`):
  - Funnel lamaran dan response rate per kanal.
  - Median waktu sampai direspons atau interview.
  - Lamaran tanpa kabar lebih dari 14 hari.
  - Insight otomatis berbasis aturan, tanpa AI.
- **Bagikan progres:** membuat gambar PNG (format Instagram 4:5 atau LinkedIn) dari data pengguna.

## 6. CV Saya

Menggantikan rencana "upload CV per lamaran" di backlog PRD.

- **Penyimpanan:** hingga 5 CV (PDF, DOC, DOCX, maks. 5 MB). Isi file dicek, bukan hanya ekstensinya.
- **CV utama:** CV pertama otomatis jadi CV utama. Tiap CV bisa diganti nama, diganti file, diunduh, dihapus, atau dijadikan utama.
- **Di form lamaran:** pilihan "CV yang dipakai" otomatis terisi CV utama. Detail lamaran menampilkan CV yang dipakai beserta tombol Unduh dan Ganti.
- **Versi lama:**
  - CV yang diganti atau dihapus padahal masih dipakai lamaran dipindah ke "Versi lama", jadi lamaran lama tetap menunjuk CV yang benar-benar dikirim.
  - Versi lama tidak dihitung dalam batas 5 dan terhapus otomatis saat tidak dipakai lagi.
- **Teks CV untuk AI:** teks dibaca sekali saat diunggah (`unpdf`/`mammoth`) sehingga AI lebih hemat dan bisa membaca file Word. CV hasil scan dikirim ke AI sebagai file PDF.
- **Migrasi data lama:** `npm run migrate:cv -w api` memindahkan lampiran lama. File identik digabung menjadi satu CV, lamaran ditautkan, dan duplikat dihapus.

## 7. Email pengingat & lupa password

- **Email pengingat harian** (Standar ke atas):
  - Satu email per hari mulai pukul 07.00 WIB berisi jadwal dan tugas yang jatuh tempo hari ini atau terlewat.
  - Bisa dimatikan di Pengaturan, dan ada tombol kirim email uji.
  - Dikirim lewat SMTP (Gmail App Password). Tanpa SMTP, email disimpan sebagai file preview.
- **Lupa password** (`/lupa-password`, `/reset-password`):
  - Link reset berlaku 30 menit, sekali pakai, dan disimpan sebagai hash.
  - Respons selalu sama, sehingga tidak bisa dipakai mengecek email terdaftar.
  - Dibatasi 3 permintaan per jam per akun.
  - Setelah reset, semua sesi dikeluarkan dan pengguna menerima email konfirmasi.

## 8. Chrome Extension

Folder `extension/` (Manifest V3, Standar ke atas).

- **Login:** memakai sesi website, jadi tidak perlu login ulang. Logout di website ikut berlaku di extension.
- **Isi otomatis dari halaman lowongan:** perusahaan, posisi, lokasi, tipe kerja, gaji, deskripsi, dan batas melamar dari LinkedIn, Jobstreet, Glints, Kalibrr, Dealls, KitaLulus, Loker.id, Indeed, dan Karirhub.
- **Instagram:** caption masuk ke deskripsi. Pengguna Premium bisa meminta AI membaca poster yang terlihat di layar.
- **Peringatan duplikat** bila link lowongan sudah pernah disimpan. Link dinormalisasi agar format berbeda tetap terdeteksi.
- **Penyimpanan:** pilih tahap Wishlist/Applied dan CV yang dipakai. Batas melamar dijadikan agenda "Batas akhir melamar".

## 9. AI Career Assistant (Premium)

Memakai **Google Gemini** (`@google/genai`). Model diatur lewat `AI_MODEL`.

- **Profil Karier** (`/profil-karier`): bahan utama AI, dengan indikator kelengkapan. Bisa diisi otomatis dari CV (1 kredit). Hasilnya hanya mengisi form, lalu pengguna menekan Simpan.
- **Cover letter:** hasil muncul bertahap (streaming), dengan pilihan bahasa, nada, dan panjang. Hasilnya bisa diedit, disalin, diunduh, dan diberi rating.
- **Persiapan interview:** pertanyaan per kategori, alasan ditanyakan, poin jawaban, dan pertanyaan untuk pewawancara. Pertanyaan bisa dijadikan tugas latihan.
- **Cek CV (ATS):** skor kecocokan CV dengan deskripsi lowongan, kata kunci yang hilang, dan saran perbaikan.
- **Isi otomatis form lamaran** dari poster loker (maks. 4 gambar) atau teks lowongan, termasuk transkrip teks poster, batas melamar, cara melamar, dan kontak WA.
- **Privasi:**
  - Pengguna menyetujui pengiriman data sebelum pemakaian pertama.
  - Email/no. HP pengguna, kontak HR, gaji, dan lamaran lain tidak dikirim ke AI.
  - Gambar poster tidak disimpan di server.
- **Riwayat & biaya:** setiap hasil tersimpan per lamaran, lengkap dengan biaya token. Prompt diberi versi untuk evaluasi kualitas.
- **Gaya bahasa:** keluaran AI dibersihkan dari em dash.
- **Mode uji:** `AI_FAKE=1` memakai provider palsu tanpa biaya.

## 10. Landing page & demo instan

- **Landing page** (`/`):
  - Penjelasan produk, 3 kartu paket, tabel perbandingan fitur, dan FAQ.
  - Tombol beli per paket ke WhatsApp admin.
- **Demo instan:**
  - Tombol "Coba demo gratis" membuat akun sementara (Premium, 50 kredit) berisi data contoh dan langsung masuk.
  - Berlaku 24 jam lalu dihapus otomatis.
  - Upload CV, email, dan ganti password dinonaktifkan. AI menampilkan contoh hasil.

## 11. Aplikasi di HP (PWA)

- **Pasang di layar utama** (Android, iPhone, desktop) dengan ikon dan pintasan Tambah lamaran & Tugas.
- **Share Target (Standar ke atas):** tekan Bagikan di LinkedIn, Instagram, Jobstreet, atau browser lalu pilih WorksTracker. Link, teks, atau screenshot poster langsung menjadi form lamaran terisi, dengan cek duplikat. Premium bisa meminta AI membaca poster yang dibagikan.
- **Push notification (Standar ke atas):** pengingat jadwal & tugas setiap pagi di HP, diatur per perangkat di Pengaturan.
- **Offline dasar:** aplikasi tetap terbuka tanpa internet dan menampilkan data terakhir (baca saja).
- **Bottom navigation:** Dashboard, Lamaran, Tambah, Tugas, dan menu Lainnya untuk halaman lain; tersembunyi saat keyboard terbuka.

## 12. Pembayaran otomatis (Midtrans)

- **Beli dari landing:** isi nama & email, bayar lewat QRIS, transfer bank, GoPay, atau ShopeePay. Akun dibuat otomatis setelah lunas dan email berisi link membuat password dikirim, kapan pun jamnya.
- **Upgrade & isi ulang kredit** dibayar langsung dari aplikasi; paket dan kredit aktif otomatis.
- **Bukti pembayaran** lewat email dan riwayat di Pengaturan; admin melihat semua pesanan di menu Pesanan.
- **Keamanan:** harga dihitung server, tanda tangan notifikasi dicek, status dikonfirmasi ulang ke Midtrans, dan setiap pesanan dipenuhi tepat sekali. Pesanan yang webhook-nya terlewat ditangkap job rekonsiliasi.
- Pembelian lewat WhatsApp dan pembuatan akun manual oleh admin tetap tersedia.

## 13. Perbaikan tampilan & tulisan

- Logo dan favicon baru, warna utama `#1D4ED8`.
- Tulisan di semua halaman dirapikan agar terdengar wajar: tanpa em dash, tanpa emoji, dan tanpa kalimat berlebihan.
- Tampilan tetap nyaman dari lebar 360 px. Di HP ada bottom nav dengan tombol Tambah.

## Perubahan dari PRD

| Di PRD | Sekarang |
| --- | --- |
| Registrasi publik (`/register`) | Ditutup. Akun dibuat admin setelah pembelian |
| Tanpa peran admin | Ada admin untuk penjualan, paket, kredit, dan pengumuman |
| Upload CV per lamaran (backlog) | CV Saya: simpan sekali, pilih per lamaran |
| Kanban, reminder email, ekspor CSV (backlog v1.1) | Sudah dibuat |
| Fitur AI di luar lingkup | AI Career Assistant di paket Premium |
| 4 tabel database | Bertambah: `licenses`, `tasks`, `announcements`, `announcement_reads`, `career_profiles`, `ai_generations`, `ai_credit_ledger`, `purchases`, `password_reset_tokens`, `cv_documents`, `push_subscriptions`, `payment_orders` |
| Pembelian manual | Pembayaran otomatis Midtrans, WhatsApp tetap ada |

Semua item backlog v1.1 di PRD sudah dibuat (termasuk PWA offline).

## Pengujian

Hasil terakhir (16 Okt 2026):

- 104 tes API (Vitest + Supertest).
- 39 tes e2e Playwright di desktop dan HP 360 px (1 tes khusus HP tidak dijalankan di desktop).
- 20 tes scraper extension.
- Uji extension menyeluruh di Chromium sungguhan.

Semuanya lolos.

## Catatan deploy

Untuk rilis yang membawa CV Saya, jalankan berurutan:

```bash
npm run db:deploy -w api
npm run migrate:cv -w api
```

Tabel lampiran lama diganti nama menjadi `legacy_attachments`, tidak dihapus. Tabel ini bisa dihapus di rilis berikutnya setelah data dipastikan pindah. Detail setup lain ada di `README.md` dan `extension/README.md`.
